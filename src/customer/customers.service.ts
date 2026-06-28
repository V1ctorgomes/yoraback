import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export interface CheckoutCustomerInput {
  name: string;
  email: string;
  phone: string;
  linkedUserId?: string;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreateForCheckout(input: CheckoutCustomerInput): Promise<Customer> {
    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();
    const phone = input.phone.trim();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { email } });

      if (existing) {
        return tx.customer.update({
          where: { id: existing.id },
          data: {
            name,
            phone,
            ...(input.linkedUserId
              ? {
                  userId: existing.userId ?? input.linkedUserId,
                  isGuest: false,
                }
              : {}),
          },
        });
      }

      return tx.customer.create({
        data: {
          name,
          email,
          phone,
          isGuest: !input.linkedUserId,
          userId: input.linkedUserId ?? null,
        },
      });
    });
  }

  async linkUserOnRegister(input: {
    userId: string;
    name: string;
    email: string;
    phone?: string;
  }): Promise<Customer> {
    const email = input.email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { email } });

      if (existing) {
        if (existing.userId && existing.userId !== input.userId) {
          throw new ConflictException('E-mail já vinculado a outra conta');
        }

        return tx.customer.update({
          where: { id: existing.id },
          data: {
            userId: input.userId,
            isGuest: false,
            name: input.name.trim(),
            phone: input.phone?.trim() || existing.phone,
          },
        });
      }

      return tx.customer.create({
        data: {
          name: input.name.trim(),
          email,
          phone: input.phone?.trim() ?? '',
          isGuest: false,
          userId: input.userId,
        },
      });
    });
  }

  async getByUserId(userId: string) {
    return this.prisma.customer.findUnique({ where: { userId } });
  }

  async getByUserIdOrThrow(userId: string) {
    const customer = await this.getByUserId(userId);

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return customer;
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return customer;
  }

  async updateCustomer(customerId: string, dto: UpdateCustomerDto) {
    const customer = await this.getById(customerId);

    if (dto.email && dto.email.toLowerCase().trim() !== customer.email) {
      const email = dto.email.toLowerCase().trim();
      const duplicate = await this.prisma.customer.findUnique({
        where: { email },
      });

      if (duplicate && duplicate.id !== customerId) {
        throw new ConflictException('E-mail já utilizado por outro cliente');
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.toLowerCase().trim() }
          : {}),
      },
    });

    if (updated.userId) {
      await this.prisma.user.update({
        where: { id: updated.userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email.toLowerCase().trim() }
            : {}),
        },
      });
    }

    return this.mapCustomer(updated);
  }

  mapCustomer(customer: Customer) {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      isGuest: customer.isGuest,
      userId: customer.userId,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  orderScope(customerId: string): Prisma.OrderWhereInput {
    return { customerId };
  }
}
