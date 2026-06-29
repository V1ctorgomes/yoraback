import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isValidSlug, slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { seedImages } from '../common/seed-images';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const collectionSelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const publicListSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  basePrice: true,
  coverImage: true,
  isFeatured: true,
  isNew: true,
  isOnSale: true,
  compareAtPrice: true,
  category: { select: categorySelect },
  variants: {
    where: { isActive: true },
    select: { color: true },
  },
  images: {
    orderBy: { displayOrder: 'asc' as const },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
      color: true,
      displayOrder: true,
    },
  },
} as const;

const publicDetailSelect = {
  ...publicListSelect,
  description: true,
  seoTitle: true,
  seoDescription: true,
  images: {
    orderBy: { displayOrder: 'asc' as const },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
      color: true,
      displayOrder: true,
    },
  },
} as const;

type ProductRecord = {
  basePrice: Prisma.Decimal;
  [key: string]: unknown;
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findActive(query: QueryProductsDto = {}) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.featured !== undefined && { isFeatured: query.featured }),
      ...(query.isNew !== undefined && { isNew: query.isNew }),
      ...(query.isOnSale !== undefined && { isOnSale: query.isOnSale }),
      ...(query.category && {
        category: { slug: query.category, isActive: true },
      }),
    };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: publicListSelect,
    });

    return products.map((product) => this.serializeProduct(product));
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: publicDetailSelect,
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return this.serializeProduct(product);
  }

  findAllAdmin() {
    return this.prisma.product
      .findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: categorySelect },
          collection: { select: collectionSelect },
        },
      })
      .then((products) => products.map((product) => this.serializeProduct(product)));
  }

  async findOneAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: categorySelect },
        collection: { select: collectionSelect },
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return this.serializeProduct(product);
  }

  async create(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId);
    if (dto.collectionId) {
      await this.ensureCollectionExists(dto.collectionId);
    }

    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name), dto.name);
    this.validateSaleFields({
      isOnSale: dto.isOnSale,
      compareAtPrice: dto.compareAtPrice,
      basePrice: dto.basePrice,
    });

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        slug,
        shortDescription: dto.shortDescription.trim(),
        description: dto.description.trim(),
        categoryId: dto.categoryId,
        collectionId: dto.collectionId ?? null,
        basePrice: dto.basePrice,
        compareAtPrice: dto.compareAtPrice ?? null,
        coverImage: dto.coverImage.trim(),
        isFeatured: dto.isFeatured ?? false,
        isNew: dto.isNew ?? false,
        isOnSale: dto.isOnSale ?? false,
        isActive: dto.isActive ?? true,
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
      },
      include: {
        category: { select: categorySelect },
        collection: { select: collectionSelect },
      },
    });

    return this.serializeProduct(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOneAdmin(id);

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    if (dto.collectionId) {
      await this.ensureCollectionExists(dto.collectionId);
    }

    let slug = current.slug as string;
    if (dto.slug !== undefined) {
      slug = await this.resolveSlug(
        dto.slug,
        dto.name ?? (current.name as string),
        id,
      );
    }

    const nextIsOnSale =
      dto.isOnSale !== undefined ? dto.isOnSale : Boolean(current.isOnSale);
    const nextBasePrice =
      dto.basePrice !== undefined
        ? dto.basePrice
        : Number(current.basePrice);
    const nextCompareAtPrice =
      dto.compareAtPrice !== undefined
        ? dto.compareAtPrice
        : current.compareAtPrice !== null
          ? Number(current.compareAtPrice)
          : null;

    this.validateSaleFields({
      isOnSale: nextIsOnSale,
      compareAtPrice: nextCompareAtPrice,
      basePrice: nextBasePrice,
    });

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        slug,
        ...(dto.shortDescription !== undefined && {
          shortDescription: dto.shortDescription.trim(),
        }),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.collectionId !== undefined && {
          collectionId: dto.collectionId,
        }),
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.compareAtPrice !== undefined && {
          compareAtPrice: dto.compareAtPrice,
        }),
        ...(dto.coverImage !== undefined && {
          coverImage: dto.coverImage.trim(),
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.isNew !== undefined && { isNew: dto.isNew }),
        ...(dto.isOnSale !== undefined && { isOnSale: dto.isOnSale }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.seoTitle !== undefined && {
          seoTitle: dto.seoTitle?.trim() || null,
        }),
        ...(dto.seoDescription !== undefined && {
          seoDescription: dto.seoDescription?.trim() || null,
        }),
      },
      include: {
        category: { select: categorySelect },
        collection: { select: collectionSelect },
      },
    });

    return this.serializeProduct(product);
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Produto removido com sucesso' };
  }

  async seedDefaults() {
    const count = await this.prisma.product.count();
    if (count > 0) {
      return;
    }

    const categories = await this.prisma.category.findMany({
      select: { id: true, slug: true },
    });

    const categoryBySlug = Object.fromEntries(
      categories.map((category) => [category.slug, category.id]),
    );

    const calcasId = categoryBySlug.calcas;
    const camisetasId = categoryBySlug.camisetas;
    const moletonsId = categoryBySlug.moletons;

    if (!calcasId || !camisetasId || !moletonsId) {
      return;
    }

    await this.prisma.product.createMany({
      data: [
        {
          name: 'Legging Flow',
          slug: 'legging-flow',
          shortDescription: 'Legging de alta compressão com cós anatômico.',
          description:
            'A Legging Flow foi desenvolvida para treinos intensos e uso diário. Tecido respirável, toque macio e modelagem que valoriza o corpo em movimento.',
          categoryId: calcasId,
          basePrice: 231.92,
          compareAtPrice: 289.9,
          coverImage: seedImages.products['legging-flow'].coverImage,
          isFeatured: true,
          isNew: true,
          isOnSale: true,
        },
        {
          name: 'Top Cruzado',
          slug: 'top-cruzado',
          shortDescription: 'Top com alças cruzadas e suporte médio.',
          description:
            'Design moderno com costas cruzadas que garantem estabilidade durante o treino. Ideal para yoga, pilates e musculação.',
          categoryId: camisetasId,
          basePrice: 169.9,
          coverImage: seedImages.products['top-cruzado'].coverImage,
          isFeatured: true,
          isNew: true,
        },
        {
          name: 'Conjunto Aura',
          slug: 'conjunto-aura',
          shortDescription: 'Conjunto coordenado para treino e lifestyle.',
          description:
            'Combinação de top e legging em tonalidade premium. Acabamento impecável e conforto para usar do estúdio à rua.',
          categoryId: calcasId,
          basePrice: 459.9,
          coverImage: seedImages.products['conjunto-aura'].coverImage,
          isFeatured: true,
        },
        {
          name: 'Macacão Slim',
          slug: 'macacao-slim',
          shortDescription: 'Macacão slim fit com tecido leve.',
          description:
            'Peça única versátil com modelagem alongada. Perfeita para treinos funcionais e looks casuais.',
          categoryId: calcasId,
          basePrice: 287.92,
          compareAtPrice: 359.9,
          coverImage: seedImages.products['macacao-slim'].coverImage,
          isOnSale: true,
          isNew: true,
        },
        {
          name: 'Short Performance',
          slug: 'short-performance',
          shortDescription: 'Short leve com bolsos laterais.',
          description:
            'Short de performance com secagem rápida e cintura confortável. Pensado para corrida e cross training.',
          categoryId: calcasId,
          basePrice: 143.92,
          compareAtPrice: 179.9,
          coverImage: seedImages.products['short-performance'].coverImage,
          isOnSale: true,
        },
        {
          name: 'Jaqueta Studio',
          slug: 'jaqueta-studio',
          shortDescription: 'Jaqueta leve para aquecimento e pós-treino.',
          description:
            'Camada extra ideal para dias frios. Corte relaxed com acabamento premium e bolsos funcionais.',
          categoryId: moletonsId,
          basePrice: 316.9,
          coverImage: seedImages.products['jaqueta-studio'].coverImage,
          isFeatured: true,
        },
        {
          name: 'Calça Flare',
          slug: 'calca-flare',
          shortDescription: 'Calça flare com cintura alta.',
          description:
            'Silhueta flare contemporânea com elasticidade em quatro vias. Transita com elegância entre treino e casual.',
          categoryId: calcasId,
          basePrice: 299.9,
          coverImage: seedImages.products['calca-flare'].coverImage,
        },
        {
          name: 'Top Longline',
          slug: 'top-longline',
          shortDescription: 'Top longo com cobertura extra.',
          description:
            'Modelagem alongada que oferece mais conforto e segurança. Tecido duplo na região frontal.',
          categoryId: camisetasId,
          basePrice: 199.9,
          coverImage: seedImages.products['top-longline'].coverImage,
          isNew: true,
        },
      ],
    });
  }

  async seedSaleDefaults() {
    const onSaleCount = await this.prisma.product.count({
      where: { isOnSale: true },
    });

    if (onSaleCount > 0) {
      return;
    }

    const saleProducts = [
      {
        slug: 'legging-flow',
        basePrice: 231.92,
        compareAtPrice: 289.9,
      },
      {
        slug: 'macacao-slim',
        basePrice: 287.92,
        compareAtPrice: 359.9,
      },
      {
        slug: 'short-performance',
        basePrice: 143.92,
        compareAtPrice: 179.9,
      },
    ] as const;

    for (const item of saleProducts) {
      await this.prisma.product.updateMany({
        where: { slug: item.slug },
        data: {
          isOnSale: true,
          basePrice: item.basePrice,
          compareAtPrice: item.compareAtPrice,
        },
      });
    }
  }

  private serializeProduct<T extends ProductRecord>(product: T) {
    const record = product as T & {
      variants?: { color: string }[];
    };

    const colors = record.variants?.length
      ? [
          ...new Set(
            record.variants.map((variant) => variant.color).filter(Boolean),
          ),
        ]
      : undefined;

    const { variants: _variants, ...rest } = record;

    return {
      ...rest,
      basePrice: Number(product.basePrice),
      compareAtPrice:
        product.compareAtPrice !== null && product.compareAtPrice !== undefined
          ? Number(product.compareAtPrice)
          : null,
      ...(colors?.length ? { colors } : {}),
    };
  }

  private validateSaleFields(input: {
    isOnSale?: boolean;
    compareAtPrice?: number | null;
    basePrice: number;
  }) {
    if (
      input.isOnSale &&
      input.compareAtPrice !== null &&
      input.compareAtPrice !== undefined &&
      input.compareAtPrice <= input.basePrice
    ) {
      throw new BadRequestException(
        'O preço original deve ser maior que o preço promocional',
      );
    }
  }

  private async ensureCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
  }

  private async ensureCollectionExists(collectionId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Coleção não encontrada');
    }
  }

  private async resolveSlug(
    rawSlug: string,
    fallbackName: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = slugify(rawSlug) || slugify(fallbackName);

    if (!isValidSlug(slug)) {
      slug = slugify(fallbackName);
    }

    if (!isValidSlug(slug)) {
      throw new ConflictException('Não foi possível gerar um slug válido');
    }

    const existing = await this.prisma.product.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este slug já está em uso');
    }

    return slug;
  }
}
