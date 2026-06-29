import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShippingSenderDto } from './dto/create-shipping-sender.dto';
import { UpdateShippingSenderDto } from './dto/create-shipping-sender.dto';

@Injectable()
export class ShippingSendersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.shippingSender.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getDefaultSender() {
    const sender = await this.prisma.shippingSender.findFirst({
      where: { isActive: true, isDefault: true },
    });

    if (sender) return sender;

    return this.prisma.shippingSender.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateShippingSenderDto) {
    if (dto.isDefault) {
      await this.clearDefault();
    }

    return this.prisma.shippingSender.create({
      data: {
        name: dto.name.trim(),
        company: dto.company?.trim() || null,
        document: dto.document.replace(/\D/g, ''),
        phone: dto.phone.replace(/\D/g, ''),
        zipCode: dto.zipCode.replace(/\D/g, ''),
        address: dto.address.trim(),
        number: dto.number.trim(),
        complement: dto.complement?.trim() || null,
        district: dto.district.trim(),
        city: dto.city.trim(),
        state: dto.state.trim().toUpperCase(),
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateShippingSenderDto) {
    await this.ensureExists(id);

    if (dto.isDefault) {
      await this.clearDefault();
    }

    return this.prisma.shippingSender.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.company !== undefined && {
          company: dto.company?.trim() || null,
        }),
        ...(dto.document !== undefined && {
          document: dto.document.replace(/\D/g, ''),
        }),
        ...(dto.phone !== undefined && { phone: dto.phone.replace(/\D/g, '') }),
        ...(dto.zipCode !== undefined && {
          zipCode: dto.zipCode.replace(/\D/g, ''),
        }),
        ...(dto.address !== undefined && { address: dto.address.trim() }),
        ...(dto.number !== undefined && { number: dto.number.trim() }),
        ...(dto.complement !== undefined && {
          complement: dto.complement?.trim() || null,
        }),
        ...(dto.district !== undefined && { district: dto.district.trim() }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.state !== undefined && {
          state: dto.state.trim().toUpperCase(),
        }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.shippingSender.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const sender = await this.prisma.shippingSender.findUnique({ where: { id } });
    if (!sender) {
      throw new NotFoundException('Remetente não encontrado');
    }
    return sender;
  }

  private async clearDefault() {
    await this.prisma.shippingSender.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
}
