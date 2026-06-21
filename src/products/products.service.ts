import {
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

const categorySelect = {
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
  category: { select: categorySelect },
} as const;

const publicDetailSelect = {
  ...publicListSelect,
  description: true,
  seoTitle: true,
  seoDescription: true,
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
        },
      })
      .then((products) => products.map((product) => this.serializeProduct(product)));
  }

  async findOneAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: categorySelect },
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return this.serializeProduct(product);
  }

  async create(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId);

    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name), dto.name);

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        slug,
        shortDescription: dto.shortDescription.trim(),
        description: dto.description.trim(),
        categoryId: dto.categoryId,
        basePrice: dto.basePrice,
        coverImage: dto.coverImage.trim(),
        isFeatured: dto.isFeatured ?? false,
        isNew: dto.isNew ?? false,
        isActive: dto.isActive ?? true,
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
      },
      include: {
        category: { select: categorySelect },
      },
    });

    return this.serializeProduct(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOneAdmin(id);

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    let slug = current.slug as string;
    if (dto.slug !== undefined) {
      slug = await this.resolveSlug(
        dto.slug,
        dto.name ?? (current.name as string),
        id,
      );
    }

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
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.coverImage !== undefined && {
          coverImage: dto.coverImage.trim(),
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.isNew !== undefined && { isNew: dto.isNew }),
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
          basePrice: 289.9,
          coverImage:
            'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80',
          isFeatured: true,
          isNew: true,
        },
        {
          name: 'Top Cruzado',
          slug: 'top-cruzado',
          shortDescription: 'Top com alças cruzadas e suporte médio.',
          description:
            'Design moderno com costas cruzadas que garantem estabilidade durante o treino. Ideal para yoga, pilates e musculação.',
          categoryId: camisetasId,
          basePrice: 169.9,
          coverImage:
            'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=600&q=80',
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
          coverImage:
            'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=600&q=80',
          isFeatured: true,
        },
        {
          name: 'Macacão Slim',
          slug: 'macacao-slim',
          shortDescription: 'Macacão slim fit com tecido leve.',
          description:
            'Peça única versátil com modelagem alongada. Perfeita para treinos funcionais e looks casuais.',
          categoryId: calcasId,
          basePrice: 359.9,
          coverImage:
            'https://images.unsplash.com/photo-1486218119243-13883505764c?w=600&q=80',
          isNew: true,
        },
        {
          name: 'Short Performance',
          slug: 'short-performance',
          shortDescription: 'Short leve com bolsos laterais.',
          description:
            'Short de performance com secagem rápida e cintura confortável. Pensado para corrida e cross training.',
          categoryId: calcasId,
          basePrice: 179.9,
          coverImage:
            'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=600&q=80',
        },
        {
          name: 'Jaqueta Studio',
          slug: 'jaqueta-studio',
          shortDescription: 'Jaqueta leve para aquecimento e pós-treino.',
          description:
            'Camada extra ideal para dias frios. Corte relaxed com acabamento premium e bolsos funcionais.',
          categoryId: moletonsId,
          basePrice: 316.9,
          coverImage:
            'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80',
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
          coverImage:
            'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&q=80',
        },
        {
          name: 'Top Longline',
          slug: 'top-longline',
          shortDescription: 'Top longo com cobertura extra.',
          description:
            'Modelagem alongada que oferece mais conforto e segurança. Tecido duplo na região frontal.',
          categoryId: camisetasId,
          basePrice: 199.9,
          coverImage:
            'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
          isNew: true,
        },
      ],
    });
  }

  private serializeProduct<T extends ProductRecord>(product: T) {
    return {
      ...product,
      basePrice: Number(product.basePrice),
    };
  }

  private async ensureCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
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
