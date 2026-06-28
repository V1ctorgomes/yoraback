import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { seedImages } from '../common/seed-images';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';

@Injectable()
export class ProductImagesService {
  constructor(private prisma: PrismaService) {}

  async findAllByProductId(productId: string) {
    await this.ensureProductExists(productId);

    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async create(productId: string, dto: CreateProductImageDto) {
    await this.ensureProductExists(productId);

    const lastImage = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });

    return this.prisma.productImage.create({
      data: {
        productId,
        imageUrl: dto.imageUrl.trim(),
        altText: dto.altText?.trim() || null,
        color: dto.color?.trim() || null,
        displayOrder: dto.displayOrder ?? (lastImage?.displayOrder ?? -1) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateProductImageDto) {
    await this.findOneOrFail(id);

    return this.prisma.productImage.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl.trim() }),
        ...(dto.altText !== undefined && {
          altText: dto.altText?.trim() || null,
        }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.color !== undefined && {
          color: dto.color?.trim() || null,
        }),
      },
    });
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.prisma.productImage.delete({ where: { id } });
    return { message: 'Imagem removida com sucesso' };
  }

  async seedDefaults() {
    const imageCount = await this.prisma.productImage.count();
    if (imageCount > 0) {
      return;
    }

    const products = await this.prisma.product.findMany({
      select: { id: true, slug: true, name: true, coverImage: true },
    });

    const galleryRows: Prisma.ProductImageCreateManyInput[] = [];

    for (const product of products) {
      const config =
        seedImages.products[product.slug as keyof typeof seedImages.products];

      if (config) {
        for (const image of config.gallery) {
          galleryRows.push({
            productId: product.id,
            imageUrl: image.imageUrl,
            altText: product.name,
            color: image.color,
            displayOrder: image.displayOrder,
          });
        }
        continue;
      }

      galleryRows.push({
        productId: product.id,
        imageUrl: product.coverImage,
        altText: product.name,
        color: null,
        displayOrder: 0,
      });
    }

    if (galleryRows.length > 0) {
      await this.prisma.productImage.createMany({ data: galleryRows });
    }
  }

  private async ensureProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
  }

  private async findOneOrFail(id: string) {
    const image = await this.prisma.productImage.findUnique({ where: { id } });

    if (!image) {
      throw new NotFoundException('Imagem não encontrada');
    }

    return image;
  }
}
