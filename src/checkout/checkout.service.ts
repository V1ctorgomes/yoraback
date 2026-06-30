import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CustomersService } from '../customer/customers.service';
import { buildPaymentExpiresAt } from '../orders/order-payment.constants';
import { OrderExpirationService } from '../orders/order-expiration.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
import { PromotionEngineService } from '../promotions/promotion-engine.service';
import { CheckoutDto } from './dto/checkout.dto';

const cartItemInclude = {
  productVariant: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          basePrice: true,
          coverImage: true,
          isActive: true,
          categoryId: true,
          collectionId: true,
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemWithRelations = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude;
}>;

const orderInclude = {
  items: true,
  address: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class CheckoutService {
  constructor(
    private prisma: PrismaService,
    private customersService: CustomersService,
    private orderExpiration: OrderExpirationService,
    private shippingService: ShippingService,
    private promotionEngine: PromotionEngineService,
  ) {}

  async checkout(
    cartToken: string | undefined,
    dto: CheckoutDto,
    linkedUserId?: string,
  ) {
    if (!cartToken) {
      throw new BadRequestException('Carrinho não encontrado');
    }

    const cart = await this.prisma.cart.findUnique({
      where: { token: cartToken },
      include: { items: { include: cartItemInclude } },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('O carrinho está vazio');
    }

    const validatedItems = this.validateCartItems(cart.items);
    const subtotal = validatedItems.reduce(
      (total, item) => total + item.subtotal,
      0,
    );

    const zipCode = dto.address.zipCode.replace(/\D/g, '');
    const shippingQuote = await this.shippingService.validateSelectedQuote(
      dto.shippingMethodId,
      zipCode,
      validatedItems.map((item) => ({
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
    );

    const shippingPrice = shippingQuote.price;

    const customer = await this.customersService.findOrCreateForCheckout({
      name: dto.customer.name,
      email: dto.customer.email,
      phone: dto.customer.phone,
      cpf: dto.customer.cpf,
      linkedUserId,
    });

    const customerCpf = customer.cpfNormalized;

    const promotionCartItems = validatedItems.map((item) => ({
      productId: item.productId,
      categoryId: item.categoryId,
      collectionId: item.collectionId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    }));

    const promotionResult = await this.promotionEngine.validate({
      code: dto.promotionCode?.trim() || undefined,
      customerId: customer.id,
      cartItems: promotionCartItems,
      subtotal,
      shippingPrice,
    });

    if (dto.promotionCode?.trim() && !promotionResult.valid) {
      throw new BadRequestException(
        promotionResult.reason ?? 'Cupom inválido',
      );
    }

    const discount = promotionResult.valid ? promotionResult.discountAmount : 0;
    const effectiveShippingPrice = promotionResult.valid
      ? promotionResult.shippingPrice
      : shippingPrice;
    const total = promotionResult.valid
      ? promotionResult.total
      : subtotal + shippingPrice;

    const order = await this.prisma.$transaction(async (tx) => {
      for (const item of validatedItems) {
        const updated = await tx.productVariant.updateMany({
          where: {
            id: item.productVariantId,
            stock: { gte: item.quantity },
            isActive: true,
            product: { isActive: true },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (updated.count !== 1) {
          throw new BadRequestException(
            `Estoque insuficiente para ${item.productName}`,
          );
        }
      }

      const orderNumber = await this.generateOrderNumber(tx);

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          customerName: dto.customer.name.trim(),
          customerEmail: dto.customer.email.trim().toLowerCase(),
          customerPhone: dto.customer.phone.trim(),
          customerCpf,
          status: OrderStatus.WAITING_PAYMENT,
          shippingMethod: shippingQuote.serviceCode,
          shippingMethodId: null,
          shippingServiceId: shippingQuote.shippingServiceId,
          shippingProvider: shippingQuote.provider,
          shippingService: `${shippingQuote.carrier} ${shippingQuote.service}`,
          shippingPrice: effectiveShippingPrice,
          shippingDeadlineDays: shippingQuote.deadline,
          subtotal,
          discount,
          total,
          promotionId: promotionResult.valid
            ? promotionResult.promotion?.id ?? null
            : null,
          promotionCode: promotionResult.valid
            ? promotionResult.promotion?.code ?? null
            : null,
          paymentExpiresAt: buildPaymentExpiresAt(),
          items: {
            create: validatedItems.map((item) => ({
              productId: item.productId,
              productVariantId: item.productVariantId,
              productName: item.productName,
              sku: item.sku,
              color: item.color,
              size: item.size,
              imageUrl: item.imageUrl,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            })),
          },
          address: {
            create: {
              recipient: dto.address.recipientName.trim(),
              zipCode: dto.address.zipCode.replace(/\D/g, ''),
              street: dto.address.street.trim(),
              number: dto.address.number.trim(),
              complement: dto.address.complement?.trim() || null,
              district: dto.address.district.trim(),
              city: dto.address.city.trim(),
              state: dto.address.state.trim(),
              country: dto.address.country?.trim() || 'BR',
              reference: dto.address.reference?.trim() || null,
            },
          },
        },
        include: orderInclude,
      });

      if (promotionResult.valid && promotionResult.promotion) {
        await this.promotionEngine.registerUsage(
          promotionResult.promotion.id,
          customer.id,
          createdOrder.id,
          tx,
        );
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return createdOrder;
    });

    return this.mapOrder(order);
  }

  async getOrderByNumber(orderNumber: string) {
    await this.orderExpiration.expireByOrderNumber(orderNumber);

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapOrder(order);
  }

  private validateCartItems(items: CartItemWithRelations[]) {
    const validated: Array<{
      productId: string;
      categoryId: string;
      collectionId: string | null;
      productVariantId: string;
      productName: string;
      sku: string;
      color: string;
      size: string;
      imageUrl: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }> = [];

    for (const item of items) {
      const variant = item.productVariant;
      const product = variant.product;

      if (!variant.isActive || !product.isActive) {
        throw new BadRequestException(
          `Produto indisponível: ${product.name}`,
        );
      }

      if (item.quantity > variant.stock) {
        throw new BadRequestException(
          `Estoque insuficiente para ${product.name}`,
        );
      }

      const unitPrice = Number(variant.priceOverride ?? product.basePrice);

      validated.push({
        productId: product.id,
        categoryId: product.categoryId,
        collectionId: product.collectionId,
        productVariantId: variant.id,
        productName: product.name,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        imageUrl: product.coverImage,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      });
    }

    return validated;
  }

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');

    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      const orderNumber = `YORA-${datePart}-${suffix}`;
      const existing = await tx.order.findUnique({
        where: { orderNumber },
      });

      if (!existing) {
        return orderNumber;
      }
    }

    throw new BadRequestException('Não foi possível gerar o número do pedido');
  }

  private mapOrder(
    order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>,
  ) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
        cpf: order.customerCpf,
      },
      shippingMethod: order.shippingMethod,
      shippingMethodId: order.shippingMethodId,
      shippingServiceId: order.shippingServiceId,
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      shippingLabel: order.shippingService ?? order.shippingMethod,
      shippingPrice: Number(order.shippingPrice),
      shippingDeadlineDays: order.shippingDeadlineDays,
      trackingCode: order.trackingCode,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      promotionCode: order.promotionCode,
      total: Number(order.total),
      paymentExpiresAt: order.paymentExpiresAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      address: order.address
        ? {
            recipient: order.address.recipient,
            zipCode: order.address.zipCode,
            street: order.address.street,
            number: order.address.number,
            complement: order.address.complement,
            district: order.address.district,
            city: order.address.city,
            state: order.address.state,
            country: order.address.country,
            reference: order.address.reference,
          }
        : null,
    };
  }
}
