import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { SHIPPING_LABELS, ShippingMethod } from '../checkout/dto/shipping-method.enum';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import {
  CustomerOrdersSort,
  QueryCustomerOrdersDto,
} from './dto/query-customer-orders.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { UpdateMeProfileDto } from './dto/update-me-profile.dto';

const orderListInclude = {
  items: { select: { quantity: true } },
} satisfies Prisma.OrderInclude;

const orderDetailInclude = {
  items: true,
  address: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class CustomerAccountService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getAccountOverview(userId: string) {
    const user = await this.authService.getProfile(userId);
    const orderScope = this.orderScope(userId, user.email);

    const [totalOrders, addressCount, lastOrder] = await Promise.all([
      this.prisma.order.count({ where: orderScope }),
      this.prisma.customerAddress.count({ where: { userId } }),
      this.prisma.order.findFirst({
        where: orderScope,
        orderBy: { createdAt: 'desc' },
        include: orderListInclude,
      }),
    ]);

    return {
      profile: user,
      dashboard: {
        totalOrders,
        addressCount,
        lastOrder: lastOrder
          ? {
              orderNumber: lastOrder.orderNumber,
              status: lastOrder.status,
              total: Number(lastOrder.total),
              itemCount: lastOrder.items.reduce(
                (total, item) => total + item.quantity,
                0,
              ),
              createdAt: lastOrder.createdAt.toISOString(),
            }
          : null,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateMeProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.avatarUrl !== undefined
          ? { avatarUrl: dto.avatarUrl.trim() || null }
          : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: new Date(dto.birthDate) }
          : {}),
      },
    });

    return this.mapUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }

  async listAddresses(userId: string) {
    const addresses = await this.prisma.customerAddress.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((address) => this.mapAddress(address));
  }

  async createAddress(userId: string, dto: CreateCustomerAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.customerAddress.count({ where: { userId } });
      const isPrimary = dto.isPrimary ?? existingCount === 0;

      if (isPrimary) {
        await tx.customerAddress.updateMany({
          where: { userId },
          data: { isPrimary: false },
        });
      }

      const address = await tx.customerAddress.create({
        data: this.buildAddressData(userId, dto, isPrimary),
      });

      return this.mapAddress(address);
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ) {
    await this.ensureAddressOwner(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.customerAddress.updateMany({
          where: { userId },
          data: { isPrimary: false },
        });
      }

      const address = await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          ...(dto.recipient !== undefined
            ? { recipient: dto.recipient.trim() }
            : {}),
          ...(dto.zipCode !== undefined
            ? { zipCode: dto.zipCode.replace(/\D/g, '') }
            : {}),
          ...(dto.street !== undefined ? { street: dto.street.trim() } : {}),
          ...(dto.number !== undefined ? { number: dto.number.trim() } : {}),
          ...(dto.complement !== undefined
            ? { complement: dto.complement.trim() || null }
            : {}),
          ...(dto.district !== undefined
            ? { district: dto.district.trim() }
            : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
          ...(dto.country !== undefined
            ? { country: dto.country.trim() || 'BR' }
            : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
      });

      return this.mapAddress(address);
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    await this.ensureAddressOwner(userId, addressId);

    const address = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    await this.prisma.customerAddress.delete({ where: { id: addressId } });

    if (address.isPrimary) {
      const next = await this.prisma.customerAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (next) {
        await this.prisma.customerAddress.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Endereço removido com sucesso' };
  }

  async listOrders(userId: string, email: string, query: QueryCustomerOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = this.buildOrdersWhere(userId, email, query.search);
    const orderBy =
      query.sort === CustomerOrdersSort.OLDEST
        ? { createdAt: 'asc' as const }
        : { createdAt: 'desc' as const };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => this.mapOrderListItem(order)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getOrderByNumber(userId: string, email: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        orderNumber,
        ...this.orderScope(userId, email),
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapOrderDetail(order);
  }

  private orderScope(userId: string, email: string): Prisma.OrderWhereInput {
    return {
      OR: [{ customerId: userId }, { customerId: null, customerEmail: email }],
    };
  }

  private buildOrdersWhere(
    userId: string,
    email: string,
    search?: string,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = this.orderScope(userId, email);

    if (search?.trim()) {
      where.orderNumber = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    return where;
  }

  private async ensureAddressOwner(userId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!address || address.userId !== userId) {
      throw new ForbiddenException('Endereço não encontrado');
    }
  }

  private buildAddressData(
    userId: string,
    dto: CreateCustomerAddressDto,
    isPrimary: boolean,
  ) {
    return {
      userId,
      recipient: dto.recipient.trim(),
      zipCode: dto.zipCode.replace(/\D/g, ''),
      street: dto.street.trim(),
      number: dto.number.trim(),
      complement: dto.complement?.trim() || null,
      district: dto.district.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      country: dto.country?.trim() || 'BR',
      isPrimary,
    };
  }

  private mapUser(user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    role: string;
    emailVerified: boolean;
    birthDate: Date | null;
    lastLogin: Date | null;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      emailVerified: user.emailVerified,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private mapAddress(address: {
    id: string;
    recipient: string;
    zipCode: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
    country: string;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: address.id,
      recipient: address.recipient,
      zipCode: address.zipCode,
      street: address.street,
      number: address.number,
      complement: address.complement,
      district: address.district,
      city: address.city,
      state: address.state,
      country: address.country,
      isPrimary: address.isPrimary,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }

  private mapOrderListItem(
    order: Prisma.OrderGetPayload<{ include: typeof orderListInclude }>,
  ) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
      createdAt: order.createdAt.toISOString(),
      shippingLabel:
        SHIPPING_LABELS[order.shippingMethod as ShippingMethod] ??
        order.shippingMethod,
    };
  }

  private mapOrderDetail(
    order: Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>,
  ) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      shippingMethod: order.shippingMethod,
      shippingLabel:
        SHIPPING_LABELS[order.shippingMethod as ShippingMethod] ??
        order.shippingMethod,
      subtotal: Number(order.subtotal),
      shippingPrice: Number(order.shippingPrice),
      discount: Number(order.discount),
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        color: item.color,
        size: item.size,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      address: order.address
        ? {
            recipient: order.address.recipient,
            zipCode: order.address.zipCode,
            street: order.address.street,
            number: order.address.number,
            complement: order.address.complement,
            district: order.address.district,
            city: order.address.city,
            state: order.address.state,
            country: order.address.country,
          }
        : null,
    };
  }
}
