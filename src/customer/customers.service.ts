import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { formatCpf, isValidCpf, normalizeCpf } from '../common/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export interface CheckoutCustomerInput {
  name: string;
  email?: string;
  phone: string;
  cpf: string;
  linkedUserId?: string;
}

export interface RegisterCustomerInput {
  userId: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  parseCpf(cpf: string) {
    if (!isValidCpf(cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    const cpfNormalized = normalizeCpf(cpf);

    return {
      cpf: formatCpf(cpfNormalized),
      cpfNormalized,
    };
  }

  async findOrCreateForCheckout(input: CheckoutCustomerInput): Promise<Customer> {
    const name = input.name.trim();
    const phone = input.phone.trim();
    const email = input.email?.trim().toLowerCase() || null;
    const { cpf, cpfNormalized } = this.parseCpf(input.cpf);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { cpfNormalized },
      });

      if (existing) {
        if (
          input.linkedUserId &&
          existing.userId &&
          existing.userId !== input.linkedUserId
        ) {
          throw new ConflictException(
            'Este CPF já está vinculado a outra conta',
          );
        }

        return tx.customer.update({
          where: { id: existing.id },
          data: {
            name,
            phone,
            cpf,
            cpfNormalized,
            cpfPending: false,
            ...(email ? { email } : {}),
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
          email: email ?? this.buildGuestEmail(cpfNormalized),
          phone,
          cpf,
          cpfNormalized,
          cpfPending: false,
          isGuest: !input.linkedUserId,
          userId: input.linkedUserId ?? null,
        },
      });
    });
  }

  private buildGuestEmail(cpfNormalized: string) {
    return `guest+${cpfNormalized}@checkout.yora.local`;
  }

  async linkUserOnRegister(input: RegisterCustomerInput): Promise<Customer> {
    const email = input.email.toLowerCase().trim();
    const { cpf, cpfNormalized } = this.parseCpf(input.cpf);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { cpfNormalized },
      });

      if (existing) {
        if (existing.userId && existing.userId !== input.userId) {
          throw new ConflictException('CPF já vinculado a outra conta');
        }

        return tx.customer.update({
          where: { id: existing.id },
          data: {
            userId: input.userId,
            isGuest: false,
            name: input.name.trim(),
            email,
            phone: input.phone.trim(),
            cpf,
            cpfNormalized,
            cpfPending: false,
          },
        });
      }

      return tx.customer.create({
        data: {
          name: input.name.trim(),
          email,
          phone: input.phone.trim(),
          cpf,
          cpfNormalized,
          cpfPending: false,
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

    if (dto.cpf) {
      if (!customer.cpfPending && customer.cpfNormalized) {
        throw new BadRequestException('CPF não pode ser alterado');
      }

      const { cpf, cpfNormalized } = this.parseCpf(dto.cpf);
      const duplicate = await this.prisma.customer.findUnique({
        where: { cpfNormalized },
      });

      if (duplicate && duplicate.id !== customerId) {
        throw new ConflictException('CPF já utilizado por outro cliente');
      }

      await this.prisma.customer.update({
        where: { id: customerId },
        data: {
          cpf,
          cpfNormalized,
          cpfPending: false,
        },
      });
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.toLowerCase().trim() }
          : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: new Date(dto.birthDate) }
          : {}),
      },
    });

    if (updated.userId) {
      await this.prisma.user.update({
        where: { id: updated.userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.birthDate !== undefined
            ? { birthDate: new Date(dto.birthDate) }
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
      cpf: customer.cpf,
      cpfPending: customer.cpfPending,
      birthDate: customer.birthDate?.toISOString().slice(0, 10) ?? null,
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
