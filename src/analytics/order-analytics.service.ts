import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REVENUE_ORDER_STATUSES } from '../analytics.constants';
import {
  AnalyticsDateRange,
  buildDateSeries,
  formatDateKey,
} from '../analytics-period.util';

@Injectable()
export class OrderAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(range: AnalyticsDateRange) {
    const [totalOrders, periodOrders, paidOrders, cancelledOrders] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.count({
          where: {
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.order.count({
          where: {
            status: { in: REVENUE_ORDER_STATUSES },
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.CANCELLED,
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
      ]);

    return {
      totalOrders,
      periodOrders,
      paidOrders,
      cancelledOrders,
    };
  }

  async getDailySeries(range: AnalyticsDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const dateKeys = buildDateSeries(range.from, range.to);
    const buckets = new Map(
      dateKeys.map((date) => [date, { date, count: 0 }]),
    );

    for (const order of orders) {
      const key = formatDateKey(order.createdAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.count += 1;
    }

    return [...buckets.values()];
  }

  async getRecentOrders(limit = 10) {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      status: order.status,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async getShippingBreakdown(range: AnalyticsDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: REVENUE_ORDER_STATUSES },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        shippingService: true,
        shippingMethod: true,
      },
    });

    const buckets = new Map<string, number>();

    for (const order of orders) {
      const label = this.normalizeShippingLabel(
        order.shippingService ?? order.shippingMethod,
      );
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }

    const total = orders.length || 1;

    return [...buckets.entries()]
      .map(([method, count]) => ({
        method,
        count,
        percentage: count / total,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private normalizeShippingLabel(value: string) {
    const normalized = value.trim().toUpperCase();

    if (normalized.includes('PAC')) return 'PAC';
    if (normalized.includes('SEDEX')) return 'SEDEX';
    if (
      normalized.includes('RETIRADA') ||
      normalized.includes('PICKUP') ||
      normalized.includes('LOJA')
    ) {
      return 'Retirada';
    }

    return 'Outros';
  }
}
