import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AuthAdmin } from '../auth/decorators/current-admin.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStockService } from './order-stock.service';
import {
  AdminOrdersSort,
  QueryAdminOrdersDto,
} from './dto/query-admin-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateOrderTrackingDto } from './dto/update-order-tracking.dto';
import {
  canTransitionStatus,
  getAllowedNextStatuses,
} from './order-status.transitions';

const orderListInclude = {
  items: { select: { quantity: true } },
} satisfies Prisma.OrderInclude;

const orderDetailInclude = {
  items: true,
  address: true,
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
  },
  shippingEvents: {
    orderBy: { eventDate: 'desc' as const },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class AdminOrdersService {
  constructor(
    private prisma: PrismaService,
    private orderStock: OrderStockService,
  ) {}

  async findAll(query: QueryAdminOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort ?? AdminOrdersSort.NEWEST);

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
      data: orders.map((order) => this.mapListItem(order)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapDetail(order);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, admin: AuthAdmin) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (!canTransitionStatus(order.status, dto.status)) {
      throw new BadRequestException(
        `Transição inválida de ${order.status} para ${dto.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextOrder = await tx.order.update({
        where: { id },
        data: { status: dto.status },
        include: orderDetailInclude,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          previousStatus: order.status,
          newStatus: dto.status,
          adminId: admin.id,
          adminEmail: admin.email,
        },
      });

      await this.handleStatusSideEffects(order, dto.status, tx);

      return nextOrder;
    });

    return this.mapDetail(updated);
  }

  async updateTracking(id: string, dto: UpdateOrderTrackingDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        trackingCode:
          dto.trackingCode === undefined
            ? order.trackingCode
            : dto.trackingCode?.trim() || null,
      },
      include: orderDetailInclude,
    });

    return this.mapDetail(updated);
  }

  private buildWhere(query: QueryAdminOrdersDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.shippingMethod) {
      where.shippingMethod = query.shippingMethod;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};

      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }

      if (query.dateTo) {
        const endDate = new Date(query.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    if (query.minTotal !== undefined || query.maxTotal !== undefined) {
      where.total = {};

      if (query.minTotal !== undefined) {
        where.total.gte = query.minTotal;
      }

      if (query.maxTotal !== undefined) {
        where.total.lte = query.maxTotal;
      }
    }

    return where;
  }

  private buildOrderBy(sort: AdminOrdersSort): Prisma.OrderOrderByWithRelationInput {
    switch (sort) {
      case AdminOrdersSort.OLDEST:
        return { createdAt: 'asc' };
      case AdminOrdersSort.HIGHEST:
        return { total: 'desc' };
      case AdminOrdersSort.LOWEST:
        return { total: 'asc' };
      case AdminOrdersSort.NEWEST:
      default:
        return { createdAt: 'desc' };
    }
  }

  private mapListItem(
    order: Prisma.OrderGetPayload<{ include: typeof orderListInclude }>,
  ) {
    const itemCount = order.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      status: order.status,
      itemCount,
      total: Number(order.total),
      shippingMethod: order.shippingMethod,
      shippingLabel: order.shippingService ?? order.shippingMethod,
      createdAt: order.createdAt.toISOString(),
    };
  }

  private mapDetail(
    order: Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>,
  ) {
    const itemCount = order.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      allowedStatuses: getAllowedNextStatuses(order.status),
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      shippingMethod: order.shippingMethod,
      shippingLabel: order.shippingService ?? order.shippingMethod,
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      shippingDeadlineDays: order.shippingDeadlineDays,
      trackingCode: order.trackingCode,
      shippingLabelId: order.shippingLabelId,
      shippingLabelUrl: order.shippingLabelUrl,
      logisticStatus: order.logisticStatus,
      subtotal: Number(order.subtotal),
      shippingPrice: Number(order.shippingPrice),
      discount: Number(order.discount),
      promotionCode: order.promotionCode,
      total: Number(order.total),
      itemCount,
      paymentExpiresAt: order.paymentExpiresAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
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
      statusHistory: order.statusHistory.map((entry) => ({
        id: entry.id,
        previousStatus: entry.previousStatus,
        newStatus: entry.newStatus,
        adminEmail: entry.adminEmail,
        createdAt: entry.createdAt.toISOString(),
      })),
      shippingEvents: order.shippingEvents.map((event) => ({
        id: event.id,
        provider: event.provider,
        status: event.status,
        description: event.description,
        location: event.location,
        eventDate: event.eventDate.toISOString(),
      })),
    };
  }

  private async handleStatusSideEffects(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
    newStatus: OrderStatus,
    tx: Prisma.TransactionClient,
  ) {
    if (newStatus !== OrderStatus.CANCELLED) {
      return;
    }

    await this.prepareStockRestore(order.id, tx);
  }

  private async prepareStockRestore(
    orderId: string,
    tx: Prisma.TransactionClient,
  ) {
    await this.orderStock.restoreStock(orderId, tx);
  }
}
