import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus, PromotionApplicationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PromotionCartItem,
  PromotionValidationInput,
  PromotionValidationResult,
  PromotionWithTargets,
  SOLD_ORDER_STATUSES,
} from './promotion.types';

@Injectable()
export class PromotionEngineService {
  constructor(private prisma: PrismaService) {}

  async validate(
    input: PromotionValidationInput,
  ): Promise<PromotionValidationResult> {
    const shippingPrice = input.shippingPrice ?? 0;
    const invalid = (reason: string): PromotionValidationResult => ({
      valid: false,
      reason,
      discountAmount: 0,
      freeShipping: false,
      subtotal: input.subtotal,
      shippingPrice,
      total: input.subtotal + shippingPrice,
    });

    const promotion = input.code?.trim()
      ? await this.findCoupon(input.code)
      : await this.findBestAutomatic(input, shippingPrice);

    if (!promotion) {
      return invalid(
        input.code?.trim()
          ? 'Cupom não encontrado ou indisponível'
          : 'Nenhuma promoção elegível encontrada',
      );
    }

    const eligibility = await this.checkEligibility(
      promotion,
      input,
      input.subtotal,
    );

    if (!eligibility.valid) {
      return invalid(eligibility.reason ?? 'Promoção inválida');
    }

    const eligibleSubtotal = this.getEligibleSubtotal(
      promotion.targets,
      input.cartItems,
    );

    if (eligibleSubtotal <= 0) {
      return invalid('Nenhum item do carrinho é elegível para esta promoção');
    }

    return this.buildSuccessResult(promotion, input, eligibleSubtotal, shippingPrice);
  }

  async registerUsage(
    promotionId: string,
    customerId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const promotion = await client.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new BadRequestException('Promoção não encontrada');
    }

    if (
      promotion.usageLimit !== null &&
      promotion.usageCount >= promotion.usageLimit
    ) {
      throw new BadRequestException('Limite de utilização da promoção atingido');
    }

    await client.promotion.update({
      where: { id: promotionId },
      data: { usageCount: { increment: 1 } },
    });

    await client.promotionUsage.create({
      data: {
        promotionId,
        customerId,
        orderId,
      },
    });
  }

  private async findCoupon(code: string) {
    const now = new Date();

    return this.prisma.promotion.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        applicationType: PromotionApplicationType.COUPON,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: { targets: true },
    });
  }

  private async findBestAutomatic(
    input: PromotionValidationInput,
    shippingPrice: number,
  ) {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        applicationType: PromotionApplicationType.AUTOMATIC,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: { targets: true },
    });

    let best: PromotionWithTargets | null = null;
    let bestDiscount = 0;

    for (const promotion of promotions) {
      const eligibility = await this.checkEligibility(
        promotion,
        input,
        input.subtotal,
      );

      if (!eligibility.valid) continue;

      const eligibleSubtotal = this.getEligibleSubtotal(
        promotion.targets,
        input.cartItems,
      );

      if (eligibleSubtotal <= 0) continue;

      const discount = this.calculateDiscount(
        promotion,
        eligibleSubtotal,
        shippingPrice,
      );

      if (discount > bestDiscount) {
        bestDiscount = discount;
        best = promotion;
      }
    }

    return best;
  }

  private buildSuccessResult(
    promotion: PromotionWithTargets,
    input: PromotionValidationInput,
    eligibleSubtotal: number,
    shippingPrice: number,
  ): PromotionValidationResult {
    const discountAmount = this.calculateDiscount(
      promotion,
      eligibleSubtotal,
      shippingPrice,
    );
    const freeShipping = promotion.type === 'FREE_SHIPPING';
    const effectiveShipping = freeShipping ? 0 : shippingPrice;
    const productDiscount = freeShipping ? 0 : discountAmount;

    return {
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        code: promotion.code,
        type: promotion.type,
        applicationType: promotion.applicationType,
      },
      discountAmount: freeShipping ? shippingPrice : discountAmount,
      freeShipping,
      subtotal: input.subtotal,
      shippingPrice: effectiveShipping,
      total: Math.max(0, input.subtotal - productDiscount + effectiveShipping),
    };
  }

  private async checkEligibility(
    promotion: PromotionWithTargets,
    input: PromotionValidationInput,
    orderSubtotal: number,
  ): Promise<{ valid: boolean; reason?: string }> {
    const now = new Date();

    if (!promotion.isActive) {
      return { valid: false, reason: 'Promoção inativa' };
    }

    if (promotion.startDate > now) {
      return { valid: false, reason: 'Promoção ainda não está válida' };
    }

    if (promotion.endDate && promotion.endDate < now) {
      return { valid: false, reason: 'Cupom expirado' };
    }

    if (
      promotion.usageLimit !== null &&
      promotion.usageCount >= promotion.usageLimit
    ) {
      return { valid: false, reason: 'Limite de utilização atingido' };
    }

    if (
      promotion.minimumOrderValue !== null &&
      orderSubtotal < Number(promotion.minimumOrderValue)
    ) {
      return {
        valid: false,
        reason: `Pedido mínimo de R$ ${Number(promotion.minimumOrderValue).toFixed(2)}`,
      };
    }

    if (input.customerId) {
      if (promotion.firstPurchaseOnly) {
        const previousOrders = await this.prisma.order.count({
          where: {
            customerId: input.customerId,
            status: { in: [...SOLD_ORDER_STATUSES] as OrderStatus[] },
          },
        });

        if (previousOrders > 0) {
          return {
            valid: false,
            reason: 'Promoção válida apenas para a primeira compra',
          };
        }
      }

      if (promotion.usageLimitPerCustomer !== null) {
        const customerUsage = await this.prisma.promotionUsage.count({
          where: {
            promotionId: promotion.id,
            customerId: input.customerId,
          },
        });

        if (customerUsage >= promotion.usageLimitPerCustomer) {
          return {
            valid: false,
            reason: 'Você já utilizou este cupom o máximo de vezes permitido',
          };
        }
      }
    }

    if (promotion.type === 'BUY_X_GET_Y') {
      return {
        valid: false,
        reason: 'Este tipo de promoção ainda não está disponível',
      };
    }

    return { valid: true };
  }

  private getEligibleSubtotal(
    targets: PromotionWithTargets['targets'],
    cartItems: PromotionCartItem[],
  ) {
    if (
      targets.length === 0 ||
      targets.some((target) => target.targetType === 'STORE')
    ) {
      return cartItems.reduce((total, item) => total + item.subtotal, 0);
    }

    let eligible = 0;

    for (const item of cartItems) {
      const matches = targets.some((target) => {
        if (target.targetType === 'PRODUCT' && target.targetId === item.productId) {
          return true;
        }

        if (
          target.targetType === 'CATEGORY' &&
          target.targetId === item.categoryId
        ) {
          return true;
        }

        if (
          target.targetType === 'COLLECTION' &&
          item.collectionId &&
          target.targetId === item.collectionId
        ) {
          return true;
        }

        return false;
      });

      if (matches) {
        eligible += item.subtotal;
      }
    }

    return eligible;
  }

  private calculateDiscount(
    promotion: PromotionWithTargets,
    eligibleSubtotal: number,
    shippingPrice: number,
  ) {
    const value = Number(promotion.value);
    const maximumDiscount =
      promotion.maximumDiscount !== null
        ? Number(promotion.maximumDiscount)
        : null;

    let discount = 0;

    switch (promotion.type) {
      case 'PERCENTAGE':
        discount = eligibleSubtotal * (value / 100);
        break;
      case 'FIXED':
        discount = value;
        break;
      case 'FREE_SHIPPING':
        discount = shippingPrice;
        break;
      default:
        discount = 0;
    }

    if (maximumDiscount !== null) {
      discount = Math.min(discount, maximumDiscount);
    }

    if (promotion.type === 'FIXED') {
      discount = Math.min(discount, eligibleSubtotal);
    }

    return Math.round(discount * 100) / 100;
  }
}
