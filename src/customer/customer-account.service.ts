import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import {
  CustomerOrdersSort,
  QueryCustomerOrdersDto,
} from './dto/query-customer-orders.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateMeProfileDto } from './dto/update-me-profile.dto';

const orderListInclude = {
  items: { select: { quantity: true } },
} satisfies Prisma.OrderInclude;

const orderDetailInclude = {
  items: true,
  address: true,
  shippingEvents: {
    orderBy: { eventDate: 'desc' as const },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class CustomerAccountService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private customersService: CustomersService,
  ) {}

  async getCustomer(userId: string) {
    const customer = await this.customersService.getByUserIdOrThrow(userId);
    return this.customersService.mapCustomer(customer);
  }

  async updateCustomerProfile(userId: string, dto: UpdateCustomerDto) {
    const customer = await this.customersService.getByUserIdOrThrow(userId);
    return this.customersService.updateCustomer(customer.id, dto);
  }

  async getAccountOverview(userId: string) {
    const user = await this.authService.getProfile(userId);
    const customerId = await this.resolveCustomerId(userId);
    const orderScope = this.customersService.orderScope(customerId);

    const [totalOrders, addressCount, lastOrder] = await Promise.all([
      this.prisma.order.count({ where: orderScope }),
      this.prisma.customerAddress.count({ where: { customerId } }),
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
    const customerId = await this.resolveCustomerId(userId);
    const addresses = await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((address) => this.mapAddress(address));
  }

  async createAddress(userId: string, dto: CreateCustomerAddressDto) {
    const customerId = await this.resolveCustomerId(userId);

    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.customerAddress.count({
        where: { customerId },
      });
      const isPrimary = dto.isPrimary ?? existingCount === 0;

      if (isPrimary) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isPrimary: false },
        });
      }

      const address = await tx.customerAddress.create({
        data: this.buildAddressData(customerId, dto, isPrimary),
      });

      return this.mapAddress(address);
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ) {
    const customerId = await this.resolveCustomerId(userId);
    await this.ensureAddressOwner(customerId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.customerAddress.updateMany({
          where: { customerId },
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
          ...(dto.reference !== undefined
            ? { reference: dto.reference.trim() || null }
            : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
      });

      return this.mapAddress(address);
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const customerId = await this.resolveCustomerId(userId);
    await this.ensureAddressOwner(customerId, addressId);

    const address = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    await this.prisma.customerAddress.delete({ where: { id: addressId } });

    if (address.isPrimary) {
      const next = await this.prisma.customerAddress.findFirst({
        where: { customerId },
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

  async listOrders(userId: string, query: QueryCustomerOrdersDto) {
    const customerId = await this.resolveCustomerId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = this.buildOrdersWhere(customerId, query.search);
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

  async getOrderByNumber(userId: string, orderNumber: string) {
    const customerId = await this.resolveCustomerId(userId);
    const order = await this.prisma.order.findFirst({
      where: {
        orderNumber,
        customerId,
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapOrderDetail(order);
  }

  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.customersService.getByUserIdOrThrow(userId);
    return customer.id;
  }

  private buildOrdersWhere(
    customerId: string,
    search?: string,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput =
      this.customersService.orderScope(customerId);

    if (search?.trim()) {
      where.orderNumber = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    return where;
  }

  private async ensureAddressOwner(customerId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!address || address.customerId !== customerId) {
      throw new ForbiddenException('Endereço não encontrado');
    }
  }

  private buildAddressData(
    customerId: string,
    dto: CreateCustomerAddressDto,
    isPrimary: boolean,
  ) {
    return {
      customerId,
      recipient: dto.recipient.trim(),
      zipCode: dto.zipCode.replace(/\D/g, ''),
      street: dto.street.trim(),
      number: dto.number.trim(),
      complement: dto.complement?.trim() || null,
      district: dto.district.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      country: dto.country?.trim() || 'BR',
      reference: dto.reference?.trim() || null,
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
    reference: string | null;
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
      reference: address.reference,
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
      shippingLabel: order.shippingService ?? order.shippingMethod,
    };
  }

  private mapOrderDetail(
    order: Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>,
  ) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      shippingMethod: order.shippingMethod,
      shippingLabel: order.shippingService ?? order.shippingMethod,
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      shippingDeadlineDays: order.shippingDeadlineDays,
      trackingCode: order.trackingCode,
      logisticStatus: order.logisticStatus,
      shippingLabelUrl: order.shippingLabelUrl,
      trackingUrl: order.trackingCode
        ? `https://rastreamento.correios.com.br/app/index.php?objeto=${order.trackingCode}`
        : null,
      shippingEvents: order.shippingEvents.map((event) => ({
        status: event.status,
        description: event.description,
        location: event.location,
        eventDate: event.eventDate.toISOString(),
      })),
      subtotal: Number(order.subtotal),
      shippingPrice: Number(order.shippingPrice),
      discount: Number(order.discount),
      promotionCode: order.promotionCode,
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
            reference: order.address.reference,
          }
        : null,
    };
  }
}
