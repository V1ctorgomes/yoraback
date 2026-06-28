import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidSlug, slugify } from '../common/utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { seedImages } from '../common/seed-images';

const publicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  bannerImageUrl: true,
  displayOrder: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findActive() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: publicSelect,
    });
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      select: publicSelect,
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  findAllAdmin() {
    return this.prisma.category.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async findOneAdmin(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name), dto.name);

    return this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        bannerImageUrl: dto.bannerImageUrl?.trim() || null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.findOneAdmin(id);

    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = await this.resolveSlug(dto.slug, dto.name ?? current.name, id);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        slug,
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.imageUrl !== undefined && {
          imageUrl: dto.imageUrl?.trim() || null,
        }),
        ...(dto.bannerImageUrl !== undefined && {
          bannerImageUrl: dto.bannerImageUrl?.trim() || null,
        }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Categoria removida com sucesso' };
  }

  async seedDefaults() {
    const count = await this.prisma.category.count();
    if (count > 0) {
      return;
    }

    await this.prisma.category.createMany({
      data: [
        {
          name: 'Camisetas',
          slug: 'camisetas',
          description: 'Peças versáteis para treino e dia a dia.',
          ...seedImages.categories.camisetas,
          displayOrder: 0,
        },
        {
          name: 'Moletons',
          slug: 'moletons',
          description: 'Conforto premium para antes e depois do treino.',
          ...seedImages.categories.moletons,
          displayOrder: 1,
        },
        {
          name: 'Calças',
          slug: 'calcas',
          description: 'Modelagens que acompanham cada movimento.',
          ...seedImages.categories.calcas,
          displayOrder: 2,
        },
        {
          name: 'Bonés',
          slug: 'bones',
          description: 'Estilo funcional para completar o look.',
          ...seedImages.categories.bones,
          displayOrder: 3,
        },
        {
          name: 'Acessórios',
          slug: 'acessorios',
          description: 'Detalhes que elevam sua rotina.',
          ...seedImages.categories.acessorios,
          displayOrder: 4,
        },
      ],
    });
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

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este slug já está em uso');
    }

    return slug;
  }
}
