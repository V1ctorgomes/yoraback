import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PromotionApplicationType,
  PromotionTargetType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';
import { PromotionEngineService } from './promotion-engine.service';
import { PromotionCartItem } from './promotion.types';

@Injectable()
export class PromotionsService {
  constructor(
    private prisma: PrismaService,
    private engine: PromotionEngineService,
  ) {}

  async validate(dto: ValidatePromotionDto) {
    const cartItems = await this.resolveCartItems(dto.cartItems);
    const subtotal = cartItems.reduce((total, item) => total + item.subtotal, 0);

    return this.engine.validate({
      code: dto.code,
      customerId: dto.customerId,
      cartItems,
      subtotal,
      shippingPrice: dto.shippingPrice ?? 0,
    });
  }

  findAllAdmin() {
    return this.prisma.promotion.findMany({
      include: {
        targets: true,
        _count: { select: { usages: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async findOneAdmin(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        targets: true,
        _count: { select: { usages: true } },
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promoção não encontrada');
    }

    return promotion;
  }

  async create(dto: CreatePromotionDto) {
    this.assertPromotionRules(dto);

    const code = this.normalizeCode(dto.code, dto.applicationType);

    if (code) {
      await this.assertUniqueCode(code);
    }

    return this.prisma.promotion.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        code,
        applicationType: dto.applicationType,
        type: dto.type,
        value: dto.value,
        minimumOrderValue: dto.minimumOrderValue ?? null,
        maximumDiscount: dto.maximumDiscount ?? null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        usageLimit: dto.usageLimit ?? null,
        usageLimitPerCustomer: dto.usageLimitPerCustomer ?? null,
        firstPurchaseOnly: dto.firstPurchaseOnly ?? false,
        isActive: dto.isActive ?? true,
        targets: {
          create: this.buildTargetCreates(dto.targets),
        },
      },
      include: { targets: true },
    });
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await this.findOneAdmin(id);

    if (
      dto.applicationType !== undefined ||
      dto.code !== undefined ||
      dto.type !== undefined
    ) {
      this.assertPromotionRules({
        applicationType: dto.applicationType ?? existing.applicationType,
        type: dto.type ?? existing.type,
        code: dto.code ?? existing.code ?? undefined,
        name: dto.name ?? existing.name,
        value: dto.value ?? Number(existing.value),
        startDate: dto.startDate ?? existing.startDate.toISOString(),
      });
    }

    const code =
      dto.code !== undefined || dto.applicationType !== undefined
        ? this.normalizeCode(
            dto.code ?? existing.code ?? undefined,
            dto.applicationType ?? existing.applicationType,
          )
        : undefined;

    if (code && code !== existing.code) {
      await this.assertUniqueCode(code, id);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.targets !== undefined) {
        await tx.promotionTarget.deleteMany({ where: { promotionId: id } });

        if (dto.targets.length > 0) {
          await tx.promotionTarget.createMany({
            data: this.buildTargetCreates(dto.targets).map((target) => ({
              ...target,
              promotionId: id,
            })),
          });
        }
      }

      return tx.promotion.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && {
            description: dto.description?.trim() || null,
          }),
          ...(code !== undefined && { code }),
          ...(dto.applicationType !== undefined && {
            applicationType: dto.applicationType,
          }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.value !== undefined && { value: dto.value }),
          ...(dto.minimumOrderValue !== undefined && {
            minimumOrderValue: dto.minimumOrderValue,
          }),
          ...(dto.maximumDiscount !== undefined && {
            maximumDiscount: dto.maximumDiscount,
          }),
          ...(dto.startDate !== undefined && {
            startDate: new Date(dto.startDate),
          }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? new Date(dto.endDate) : null,
          }),
          ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
          ...(dto.usageLimitPerCustomer !== undefined && {
            usageLimitPerCustomer: dto.usageLimitPerCustomer,
          }),
          ...(dto.firstPurchaseOnly !== undefined && {
            firstPurchaseOnly: dto.firstPurchaseOnly,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: { targets: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.promotion.delete({ where: { id } });
    return { message: 'Promoção removida com sucesso' };
  }

  async resolveCartItems(
    items: Array<{ productVariantId: string; quantity: number }>,
  ): Promise<PromotionCartItem[]> {
    const variantIds = items.map((item) => item.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        isActive: true,
        product: { isActive: true },
      },
      include: {
        product: {
          select: {
            id: true,
            categoryId: true,
            collectionId: true,
            basePrice: true,
            isActive: true,
          },
        },
      },
    });

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const resolved: PromotionCartItem[] = [];

    for (const item of items) {
      const variant = variantMap.get(item.productVariantId);

      if (!variant) {
        throw new BadRequestException('Item do carrinho inválido ou indisponível');
      }

      if (item.quantity > variant.stock) {
        throw new BadRequestException('Quantidade indisponível no estoque');
      }

      const unitPrice = Number(variant.priceOverride ?? variant.product.basePrice);

      resolved.push({
        productId: variant.product.id,
        categoryId: variant.product.categoryId,
        collectionId: variant.product.collectionId,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      });
    }

    return resolved;
  }

  async seedDefaults() {
    const count = await this.prisma.promotion.count();
    if (count > 0) {
      return;
    }

    const now = new Date();
    const nextYear = new Date(now);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    await this.prisma.promotion.create({
      data: {
        name: 'Boas-vindas',
        description: '10% de desconto na primeira compra com o cupom WELCOME10',
        code: 'WELCOME10',
        applicationType: PromotionApplicationType.COUPON,
        type: 'PERCENTAGE',
        value: 10,
        minimumOrderValue: 150,
        maximumDiscount: 80,
        startDate: now,
        endDate: nextYear,
        usageLimit: 500,
        usageLimitPerCustomer: 1,
        firstPurchaseOnly: true,
        isActive: true,
        targets: {
          create: [{ targetType: PromotionTargetType.STORE, targetId: null }],
        },
      },
    });

    await this.prisma.promotion.create({
      data: {
        name: 'Frete grátis acima de R$ 299',
        description: 'Frete grátis automático em pedidos acima de R$ 299',
        applicationType: PromotionApplicationType.AUTOMATIC,
        type: 'FREE_SHIPPING',
        value: 0,
        minimumOrderValue: 299,
        startDate: now,
        endDate: nextYear,
        isActive: true,
        targets: {
          create: [{ targetType: PromotionTargetType.STORE, targetId: null }],
        },
      },
    });
  }

  private buildTargetCreates(
    targets: CreatePromotionDto['targets'],
  ): Prisma.PromotionTargetCreateWithoutPromotionInput[] {
    if (!targets || targets.length === 0) {
      return [{ targetType: PromotionTargetType.STORE, targetId: null }];
    }

    return targets.map((target) => ({
      targetType: target.targetType,
      targetId:
        target.targetType === PromotionTargetType.STORE
          ? null
          : (target.targetId ?? null),
    }));
  }

  private normalizeCode(
    code: string | undefined,
    applicationType: PromotionApplicationType,
  ) {
    if (applicationType === PromotionApplicationType.AUTOMATIC) {
      return null;
    }

    if (!code?.trim()) {
      throw new BadRequestException('Cupons precisam de um código');
    }

    return code.trim().toUpperCase();
  }

  private assertPromotionRules(dto: {
    applicationType: PromotionApplicationType;
    type: CreatePromotionDto['type'];
    code?: string;
    name: string;
    value: number;
    startDate: string;
  }) {
    if (
      dto.applicationType === PromotionApplicationType.COUPON &&
      !dto.code?.trim()
    ) {
      throw new BadRequestException('Cupons precisam de um código');
    }

    if (dto.type === 'PERCENTAGE' && dto.value > 100) {
      throw new BadRequestException('Desconto percentual não pode exceder 100%');
    }

    if (dto.type === 'BUY_X_GET_Y') {
      throw new BadRequestException(
        'Este tipo de promoção ainda não está disponível',
      );
    }
  }

  private async assertUniqueCode(code: string, excludeId?: string) {
    const existing = await this.prisma.promotion.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException('Já existe uma promoção com este código');
    }
  }
}
