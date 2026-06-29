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
      totalRevenue: total.netRevenue,
      periodRevenue: period.netRevenue,
      grossRevenue: period.grossRevenue,
      netRevenue: period.netRevenue,
      averageTicket: period.averageTicket,
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
        total: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dateKeys = buildDateSeries(range.from, range.to);
    const buckets = new Map(
      dateKeys.map((date) => [date, { date, gross: 0, net: 0 }]),
    );

    for (const order of orders) {
      const key = formatDateKey(order.createdAt);
      const bucket = buckets.get(key);

      if (!bucket) continue;

      bucket.gross += Number(order.subtotal);
      bucket.net += Number(order.total);
    }

    return [...buckets.values()];
  }

  private async aggregateRevenue(
    extraWhere: Prisma.OrderWhereInput = {},
  ) {
    const result = await this.prisma.order.aggregate({
      where: {
        status: { in: REVENUE_ORDER_STATUSES },
        ...extraWhere,
      },
      _count: { _all: true },
      _sum: {
        subtotal: true,
        total: true,
      },
    });

    const orderCount = result._count._all;
    const grossRevenue = Number(result._sum.subtotal ?? 0);
    const netRevenue = Number(result._sum.total ?? 0);

    return {
      orderCount,
      grossRevenue,
      netRevenue,
      averageTicket: orderCount > 0 ? netRevenue / orderCount : 0,
    };
  }
}
