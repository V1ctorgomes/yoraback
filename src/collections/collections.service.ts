import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isValidSlug, slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { QueryCollectionsDto } from './dto/query-collections.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const productListSelect = {
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

const publicListSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  bannerImageUrl: true,
  thumbnailImageUrl: true,
  launchDate: true,
  endDate: true,
  isFeatured: true,
} as const;

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  findActive(query: QueryCollectionsDto = {}) {
    const where: Prisma.CollectionWhereInput = {
      isActive: true,
      ...(query.featured !== undefined && { isFeatured: query.featured }),
    };

    return this.prisma.collection.findMany({
      where,
      orderBy: [{ launchDate: 'desc' }, { createdAt: 'desc' }],
      select: publicListSelect,
    });
  }

  async findBySlug(slug: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, isActive: true },
      select: {
        ...publicListSelect,
        products: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: productListSelect,
        },
      },
    });

    if (!collection) {
      throw new NotFoundException('Coleção não encontrada');
    }

    return {
      ...collection,
      productCount: collection.products.length,
      products: collection.products.map((product) => ({
        ...product,
        basePrice: Number(product.basePrice),
      })),
    };
  }

  findAllAdmin() {
    return this.prisma.collection.findMany({
      orderBy: [{ launchDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async findOneAdmin(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!collection) {
      throw new NotFoundException('Coleção não encontrada');
    }

    return collection;
  }

  async create(dto: CreateCollectionDto) {
    this.validateDates(dto.launchDate, dto.endDate);

    const slug = await this.resolveSlug(
      dto.slug ?? slugify(dto.name),
      dto.name,
    );

    return this.prisma.collection.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        bannerImageUrl: dto.bannerImageUrl.trim(),
        thumbnailImageUrl: dto.thumbnailImageUrl.trim(),
        launchDate: new Date(dto.launchDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
      },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCollectionDto) {
    const current = await this.findOneAdmin(id);

    const launchDate = dto.launchDate ?? current.launchDate.toISOString();
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
        : current.endDate?.toISOString();

    this.validateDates(launchDate, endDate ?? undefined);

    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = await this.resolveSlug(dto.slug, dto.name ?? current.name, id);
    }

    return this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        slug,
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.bannerImageUrl !== undefined && {
          bannerImageUrl: dto.bannerImageUrl.trim(),
        }),
        ...(dto.thumbnailImageUrl !== undefined && {
          thumbnailImageUrl: dto.thumbnailImageUrl.trim(),
        }),
        ...(dto.launchDate !== undefined && {
          launchDate: new Date(dto.launchDate),
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.collection.delete({ where: { id } });
    return { message: 'Coleção removida com sucesso' };
  }

  async ensureExists(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!collection) {
      throw new NotFoundException('Coleção não encontrada');
    }
  }

  async seedDefaults() {
    const count = await this.prisma.collection.count();
    if (count > 0) {
      return;
    }

    await this.prisma.collection.createMany({
      data: [
        {
          name: 'Winter 2026',
          slug: 'winter-2026',
          description:
            'Peças desenvolvidas para performance e conforto nos dias mais frios.',
          bannerImageUrl:
            'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1600&q=80',
          thumbnailImageUrl:
            'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80',
          launchDate: new Date('2026-06-01T00:00:00.000Z'),
          isFeatured: true,
        },
        {
          name: 'Street Vol. 1',
          slug: 'street-vol-1',
          description:
            'O primeiro drop urbano da Yora, pensado para transitar do treino à rua.',
          bannerImageUrl:
            'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1600&q=80',
          thumbnailImageUrl:
            'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
          launchDate: new Date('2026-05-15T00:00:00.000Z'),
          isFeatured: true,
        },
        {
          name: 'Black Collection',
          slug: 'black-collection',
          description:
            'Essenciais em preto absoluto para compor looks minimalistas.',
          bannerImageUrl:
            'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=1600&q=80',
          thumbnailImageUrl:
            'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800&q=80',
          launchDate: new Date('2026-04-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T23:59:59.000Z'),
          isFeatured: false,
        },
      ],
    });

    const winter = await this.prisma.collection.findUnique({
      where: { slug: 'winter-2026' },
    });
    const street = await this.prisma.collection.findUnique({
      where: { slug: 'street-vol-1' },
    });

    if (winter) {
      await this.prisma.product.updateMany({
        where: { slug: { in: ['legging-flow', 'jaqueta-studio', 'macacao-slim'] } },
        data: { collectionId: winter.id },
      });
    }

    if (street) {
      await this.prisma.product.updateMany({
        where: { slug: { in: ['top-cruzado', 'top-longline', 'conjunto-aura'] } },
        data: { collectionId: street.id },
      });
    }
  }

  private validateDates(launchDate: string, endDate?: string) {
    const launch = new Date(launchDate);

    if (Number.isNaN(launch.getTime())) {
      throw new BadRequestException('launchDate inválida');
    }

    if (!endDate) {
      return;
    }

    const end = new Date(endDate);

    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('endDate inválida');
    }

    if (end < launch) {
      throw new BadRequestException(
        'endDate deve ser posterior ou igual à launchDate',
      );
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

    const existing = await this.prisma.collection.findUnique({
      where: { slug },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este slug já está em uso');
    }

    return slug;
  }
}
