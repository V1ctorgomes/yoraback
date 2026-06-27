import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';
import {
  SHIPPING_LABELS,
  SHIPPING_PRICES,
  ShippingMethod,
} from './dto/shipping-method.enum';

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
  constructor(private prisma: PrismaService) {}

  async checkout(cartToken: string | undefined, dto: CheckoutDto) {
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
    const shippingPrice = SHIPPING_PRICES[dto.shippingMethod];
    const discount = 0;
    const total = subtotal + shippingPrice - discount;

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
          customerName: dto.customer.name.trim(),
          customerEmail: dto.customer.email.trim().toLowerCase(),
          customerPhone: dto.customer.phone.trim(),
          status: OrderStatus.WAITING_PAYMENT,
          shippingMethod: dto.shippingMethod,
          subtotal,
          shippingPrice,
          discount,
          total,
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
              recipient: dto.customer.name.trim(),
              zipCode: dto.address.zipCode.replace(/\D/g, ''),
              street: dto.address.street.trim(),
              number: dto.address.number.trim(),
              complement: dto.address.complement?.trim() || null,
              district: dto.address.district.trim(),
              city: dto.address.city.trim(),
              state: dto.address.state.trim(),
              country: dto.address.country?.trim() || 'BR',
            },
          },
        },
        include: orderInclude,
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return createdOrder;
    });

    return this.mapOrder(order);
  }

  async getOrderByNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapOrder(order);
  }

  getShippingOptions() {
    return (Object.values(ShippingMethod) as ShippingMethod[]).map(
      (method) => ({
        method,
        label: SHIPPING_LABELS[method],
        price: SHIPPING_PRICES[method],
        estimatedDays:
          method === ShippingMethod.PAC
            ? '8 a 12 dias úteis'
            : method === ShippingMethod.SEDEX
              ? '2 a 4 dias úteis'
              : 'Disponível em 1 dia útil',
      }),
    );
  }

  private validateCartItems(items: CartItemWithRelations[]) {
    const validated: Array<{
      productId: string;
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
      },
      shippingMethod: order.shippingMethod,
      shippingLabel:
        SHIPPING_LABELS[order.shippingMethod as ShippingMethod] ??
        order.shippingMethod,
      subtotal: Number(order.subtotal),
      shippingPrice: Number(order.shippingPrice),
      discount: Number(order.discount),
      total: Number(order.total),
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
          }
        : null,
    };
  }
}
