import { Injectable } from '@nestjs/common';
import { LogisticStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpeditionService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string;
    logisticStatus?: LogisticStatus;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      status: {
        in: [
          OrderStatus.PAID,
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ],
      },
      shippingProvider: { not: 'RetiradaLoja' },
      ...(query.logisticStatus && { logisticStatus: query.logisticStatus }),
      ...(query.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' } },
          { customerName: { contains: query.search, mode: 'insensitive' } },
          { trackingCode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          shippingEvents: {
            orderBy: { eventDate: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        shippingProvider: order.shippingProvider,
        shippingService: order.shippingService,
        logisticStatus: order.logisticStatus,
        trackingCode: order.trackingCode,
        shippingLabelId: order.shippingLabelId,
        shippingLabelUrl: order.shippingLabelUrl,
        status: order.status,
        total: Number(order.total),
        createdAt: order.createdAt.toISOString(),
        lastEvent: order.shippingEvents[0]
          ? {
              description: order.shippingEvents[0].description,
              eventDate: order.shippingEvents[0].eventDate.toISOString(),
            }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getHistory(orderId: string) {
    const events = await this.prisma.shippingEvent.findMany({
      where: { orderId },
      orderBy: { eventDate: 'desc' },
    });

    return events.map((event) => ({
      id: event.id,
      provider: event.provider,
      status: event.status,
      description: event.description,
      location: event.location,
      eventDate: event.eventDate.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }));
  }
}
