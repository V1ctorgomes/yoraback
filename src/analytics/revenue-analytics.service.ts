import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REVENUE_ORDER_STATUSES } from './analytics.constants';
import {
  AnalyticsDateRange,
  buildDateSeries,
  formatDateKey,
} from './analytics-period.util';

@Injectable()
export class RevenueAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(range: AnalyticsDateRange) {
    const [total, period] = await Promise.all([
      this.aggregateRevenue({}),
      this.aggregateRevenue({
        createdAt: { gte: range.from, lte: range.to },
      }),
    ]);

    return {
      totalRevenue: total.storeNetRevenue,
      periodRevenue: period.storeNetRevenue,
      grossRevenue: period.grossRevenue,
      netRevenue: period.storeNetRevenue,
      collectedRevenue: period.collectedRevenue,
      totalCollectedRevenue: total.collectedRevenue,
      averageTicket: period.averageTicket,
      averageCollectedTicket: period.averageCollectedTicket,
      paidOrders: period.orderCount,
    };
  }

  async getSeries(range: AnalyticsDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: REVENUE_ORDER_STATUSES },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        createdAt: true,
        subtotal: true,
        discount: true,
        total: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dateKeys = buildDateSeries(range.from, range.to);
    const buckets = new Map(
      dateKeys.map((date) => [
        date,
        { date, gross: 0, net: 0, collected: 0 },
      ]),
    );

    for (const order of orders) {
      const key = formatDateKey(order.createdAt);
      const bucket = buckets.get(key);

      if (!bucket) continue;

      const subtotal = Number(order.subtotal);
      const discount = Number(order.discount);
      const total = Number(order.total);

      bucket.gross += subtotal;
      bucket.net += subtotal - discount;
      bucket.collected += total;
    }

    return [...buckets.values()];
  }

  private async aggregateRevenue(extraWhere: Prisma.OrderWhereInput = {}) {
    const result = await this.prisma.order.aggregate({
      where: {
        status: { in: REVENUE_ORDER_STATUSES },
        ...extraWhere,
      },
      _count: { _all: true },
      _sum: {
        subtotal: true,
        discount: true,
        total: true,
      },
    });

    const orderCount = result._count._all;
    const grossRevenue = Number(result._sum.subtotal ?? 0);
    const discountTotal = Number(result._sum.discount ?? 0);
    const storeNetRevenue = grossRevenue - discountTotal;
    const collectedRevenue = Number(result._sum.total ?? 0);

    return {
      orderCount,
      grossRevenue,
      storeNetRevenue,
      collectedRevenue,
      averageTicket: orderCount > 0 ? storeNetRevenue / orderCount : 0,
      averageCollectedTicket:
        orderCount > 0 ? collectedRevenue / orderCount : 0,
    };
  }
}
