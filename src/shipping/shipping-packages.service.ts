import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShippingPackageDto } from './dto/create-shipping-package.dto';
import { UpdateShippingPackageDto } from './dto/create-shipping-package.dto';

@Injectable()
export class ShippingPackagesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.shippingPackage.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateShippingPackageDto) {
    return this.prisma.shippingPackage.create({
      data: {
        name: dto.name.trim(),
        lengthCm: dto.lengthCm,
        widthCm: dto.widthCm,
        heightCm: dto.heightCm,
        maxWeightKg: dto.maxWeightKg,
        packageWeightKg: dto.packageWeightKg,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateShippingPackageDto) {
    await this.ensureExists(id);

    return this.prisma.shippingPackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.lengthCm !== undefined && { lengthCm: dto.lengthCm }),
        ...(dto.widthCm !== undefined && { widthCm: dto.widthCm }),
        ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
        ...(dto.maxWeightKg !== undefined && { maxWeightKg: dto.maxWeightKg }),
        ...(dto.packageWeightKg !== undefined && {
          packageWeightKg: dto.packageWeightKg,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.shippingPackage.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const pkg = await this.prisma.shippingPackage.findUnique({ where: { id } });
    if (!pkg) {
      throw new NotFoundException('Embalagem não encontrada');
    }
    return pkg;
  }
}
