import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REVENUE_ORDER_STATUSES } from './analytics.constants';
import { AnalyticsDateRange } from './analytics-period.util';

@Injectable()
export class ProductAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(range: AnalyticsDateRange) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: REVENUE_ORDER_STATUSES },
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      select: { quantity: true },
    });

    const productsSold = items.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    return { productsSold };
  }

  async getTopProducts(range: AnalyticsDateRange, limit = 10) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: REVENUE_ORDER_STATUSES },
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        subtotal: true,
      },
    });

    const map = new Map<
      string,
      { productId: string; productName: string; quantity: number; revenue: number }
    >();

    for (const item of items) {
      const current = map.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        revenue: 0,
      };

      current.quantity += item.quantity;
      current.revenue += Number(item.subtotal);
      map.set(item.productId, current);
    }

    return [...map.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  async getCategoryBreakdown(range: AnalyticsDateRange) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: REVENUE_ORDER_STATUSES },
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      select: {
        subtotal: true,
        productId: true,
      },
    });

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category: { select: { id: true, name: true } },
          },
        })
      : [];

    const categoryByProduct = new Map(
      products.map((product) => [product.id, product.category]),
    );

    const buckets = new Map<
      string,
      { categoryId: string; categoryName: string; revenue: number }
    >();

    for (const item of items) {
      const category = categoryByProduct.get(item.productId);

      if (!category) continue;

      const current = buckets.get(category.id) ?? {
        categoryId: category.id,
        categoryName: category.name,
        revenue: 0,
      };

      current.revenue += Number(item.subtotal);
      buckets.set(category.id, current);
    }

    const total = [...buckets.values()].reduce(
      (sum, item) => sum + item.revenue,
      0,
    );

    return [...buckets.values()]
      .map((item) => ({
        ...item,
        percentage: total > 0 ? item.revenue / total : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getCollectionRanking(range: AnalyticsDateRange, limit = 10) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: REVENUE_ORDER_STATUSES },
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      select: {
        subtotal: true,
        productId: true,
      },
    });

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds }, collectionId: { not: null } },
          select: {
            id: true,
            collection: { select: { id: true, name: true } },
          },
        })
      : [];

    const collectionByProduct = new Map(
      products.map((product) => [product.id, product.collection]),
    );

    const buckets = new Map<
      string,
      {
        collectionId: string;
        collectionName: string;
        revenue: number;
        orderCount: number;
      }
    >();

    for (const item of items) {
      const collection = collectionByProduct.get(item.productId);

      if (!collection) continue;

      const current = buckets.get(collection.id) ?? {
        collectionId: collection.id,
        collectionName: collection.name,
        revenue: 0,
        orderCount: 0,
      };

      current.revenue += Number(item.subtotal);
      current.orderCount += 1;
      buckets.set(collection.id, current);
    }

    return [...buckets.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getPaymentBreakdown(range: AnalyticsDateRange) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.APPROVED,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { paymentMethod: true },
    });

    const buckets = new Map<string, number>();

    for (const payment of payments) {
      const label = this.normalizePaymentMethod(payment.paymentMethod);
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }

    const total = payments.length || 1;

    return [...buckets.entries()]
      .map(([method, count]) => ({
        method,
        count,
        percentage: count / total,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private normalizePaymentMethod(method: string) {
    switch (method) {
      case 'PIX':
        return 'PIX';
      case 'CREDIT_CARD':
        return 'Cartão';
      default:
        return 'Outros';
    }
  }
}
