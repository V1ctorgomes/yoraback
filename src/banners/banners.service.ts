import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  findActive() {
    return this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        mobileImageUrl: true,
        buttonText: true,
        buttonLink: true,
        displayOrder: true,
      },
    });
  }

  findAllAdmin() {
    return this.prisma.banner.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOneAdmin(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('Banner não encontrado');
    }
    return banner;
  }

  create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        imageUrl: dto.imageUrl.trim(),
        mobileImageUrl: dto.mobileImageUrl?.trim() || null,
        buttonText: dto.buttonText?.trim() || null,
        buttonLink: dto.buttonLink?.trim() || null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOneAdmin(id);

    return this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.subtitle !== undefined && {
          subtitle: dto.subtitle?.trim() || null,
        }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl.trim() }),
        ...(dto.mobileImageUrl !== undefined && {
          mobileImageUrl: dto.mobileImageUrl?.trim() || null,
        }),
        ...(dto.buttonText !== undefined && {
          buttonText: dto.buttonText?.trim() || null,
        }),
        ...(dto.buttonLink !== undefined && {
          buttonLink: dto.buttonLink?.trim() || null,
        }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.banner.delete({ where: { id } });
    return { message: 'Banner removido com sucesso' };
  }

  async seedDefaults() {
    const count = await this.prisma.banner.count();
    if (count > 0) {
      return;
    }

    await this.prisma.banner.createMany({
      data: [
        {
          title: 'Summer Drop',
          subtitle:
            'Peças leves para treinar, viver e brilhar — edição limitada.',
          imageUrl:
            'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1920&q=80&auto=format&fit=crop',
          buttonText: 'Explorar coleção',
          buttonLink: '/colecoes/summer-drop',
          displayOrder: 0,
          isActive: true,
        },
        {
          title: 'Essentials',
          subtitle: 'Os favoritos de quem entende de estilo e conforto.',
          imageUrl:
            'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1920&q=80&auto=format&fit=crop',
          buttonText: 'Ver best sellers',
          buttonLink: '/colecoes/essentials',
          displayOrder: 1,
          isActive: true,
        },
      ],
    });
  }
}
