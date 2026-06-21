import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

type VariantRecord = {
  priceOverride: Prisma.Decimal | null;
  product?: { basePrice: Prisma.Decimal };
  [key: string]: unknown;
};

@Injectable()
export class ProductVariantsService {
  constructor(private prisma: PrismaService) {}

  async findActiveByProductSlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: { id: true, basePrice: true },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { productId: product.id, isActive: true },
      orderBy: [{ color: 'asc' }, { size: 'asc' }],
    });

    const basePrice = Number(product.basePrice);

    return variants.map((variant) => this.serializeVariant(variant, basePrice));
  }

  async findAllByProductId(productId: string) {
    await this.ensureProductExists(productId);

    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: [{ color: 'asc' }, { size: 'asc' }],
      include: {
        product: { select: { basePrice: true } },
      },
    });

    return variants.map((variant) =>
      this.serializeVariant(variant, Number(variant.product.basePrice)),
    );
  }

  async create(productId: string, dto: CreateProductVariantDto) {
    const product = await this.ensureProductExists(productId);

    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          sku: dto.sku.trim().toUpperCase(),
          color: dto.color.trim(),
          size: dto.size.trim().toUpperCase(),
          priceOverride: dto.priceOverride ?? null,
          stock: dto.stock,
          isActive: dto.isActive ?? true,
        },
      });

      return this.serializeVariant(variant, Number(product.basePrice));
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductVariantDto) {
    await this.findOneOrFail(id);

    try {
      const variant = await this.prisma.productVariant.update({
        where: { id },
        data: {
          ...(dto.color !== undefined && { color: dto.color.trim() }),
          ...(dto.size !== undefined && { size: dto.size.trim().toUpperCase() }),
          ...(dto.sku !== undefined && { sku: dto.sku.trim().toUpperCase() }),
          ...(dto.priceOverride !== undefined && {
            priceOverride: dto.priceOverride ?? null,
          }),
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: {
          product: { select: { basePrice: true } },
        },
      });

      return this.serializeVariant(
        variant,
        Number(variant.product.basePrice),
      );
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.prisma.productVariant.delete({ where: { id } });
    return { message: 'Variante removida com sucesso' };
  }

  async seedDefaults() {
    const variantCount = await this.prisma.productVariant.count();
    if (variantCount > 0) {
      return;
    }

    const products = await this.prisma.product.findMany({
      select: { id: true, slug: true },
    });

    const colors = ['Preto', 'Branco'];
    const sizes = ['P', 'M', 'G'];
    const stockBySize: Record<string, number> = { P: 12, M: 20, G: 8 };

    for (const product of products) {
      const skuPrefix = product.slug
        .split('-')
        .map((part) => part.slice(0, 3).toUpperCase())
        .join('-');

      const variants = colors.flatMap((color) =>
        sizes.map((size) => {
          const colorCode = color === 'Preto' ? 'PRE' : 'BRA';
          return {
            productId: product.id,
            sku: `${skuPrefix}-${colorCode}-${size}`,
            color,
            size,
            stock: stockBySize[size] ?? 10,
            isActive: true,
          };
        }),
      );

      await this.prisma.productVariant.createMany({ data: variants });
    }
  }

  private serializeVariant<T extends VariantRecord>(
    variant: T,
    basePrice: number,
  ) {
    const priceOverride =
      variant.priceOverride !== null && variant.priceOverride !== undefined
        ? Number(variant.priceOverride)
        : null;

    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      priceOverride,
      price: priceOverride ?? basePrice,
      stock: variant.stock,
      isActive: variant.isActive,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }

  private async ensureProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, basePrice: true },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return product;
  }

  private async findOneOrFail(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: { select: { basePrice: true } },
      },
    });

    if (!variant) {
      throw new NotFoundException('Variante não encontrada');
    }

    return variant;
  }

  private handleUniqueError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(', ')
        : 'campo';

      if (String(target).includes('sku')) {
        throw new ConflictException('Este SKU já está em uso');
      }

      throw new ConflictException(
        'Já existe uma variante com esta combinação de cor e tamanho',
      );
    }
  }
}
