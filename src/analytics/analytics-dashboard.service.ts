import { Injectable } from '@nestjs/common';
import { PromotionAnalyticsService } from '../promotions/promotion-analytics.service';
import { AnalyticsPeriodQueryDto } from './dto/analytics-period-query.dto';
import { resolveAnalyticsPeriod, AnalyticsDateRange } from './analytics-period.util';
import { ANALYTICS_CACHE_TTL_MS } from './analytics.constants';
import { CustomerAnalyticsService } from './customer-analytics.service';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { OrderAnalyticsService } from './order-analytics.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  expiresAt: number;
  payload: unknown;
}

@Injectable()
export class AnalyticsDashboardService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private prisma: PrismaService,
    private revenueAnalytics: RevenueAnalyticsService,
    private orderAnalytics: OrderAnalyticsService,
    private customerAnalytics: CustomerAnalyticsService,
    private productAnalytics: ProductAnalyticsService,
    private inventoryAnalytics: InventoryAnalyticsService,
    private promotionAnalytics: PromotionAnalyticsService,
  ) {}

  async getDashboard(query: AnalyticsPeriodQueryDto) {
    const range = resolveAnalyticsPeriod(query);
    const cacheKey = `dashboard:${range.preset}:${range.from.toISOString()}:${range.to.toISOString()}`;
    const cached = this.getCached(cacheKey);

    if (cached) {
      return cached;
    }

    const [
      revenue,
      orders,
      customers,
      products,
      revenueSeries,
      ordersSeries,
      topProducts,
      categories,
      collections,
      paymentMethods,
      shippingMethods,
      lowStock,
      recentOrders,
      promotions,
    ] = await Promise.all([
      this.revenueAnalytics.getSummary(range),
      this.orderAnalytics.getSummary(range),
      this.customerAnalytics.getSummary(range),
      this.productAnalytics.getSummary(range),
      this.revenueAnalytics.getSeries(range),
      this.orderAnalytics.getDailySeries(range),
      this.productAnalytics.getTopProducts(range),
      this.productAnalytics.getCategoryBreakdown(range),
      this.productAnalytics.getCollectionRanking(range),
      this.productAnalytics.getPaymentBreakdown(range),
      this.orderAnalytics.getShippingBreakdown(range),
      this.inventoryAnalytics.getLowStockItems(),
      this.orderAnalytics.getRecentOrders(),
      this.promotionAnalytics.getDashboardMetrics(),
    ]);

    const payload = {
      period: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      kpis: {
        totalRevenue: revenue.totalRevenue,
        periodRevenue: revenue.periodRevenue,
        grossRevenue: revenue.grossRevenue,
        netRevenue: revenue.netRevenue,
        totalOrders: orders.totalOrders,
        periodOrders: orders.periodOrders,
        averageTicket: revenue.averageTicket,
        paidOrders: orders.paidOrders,
        cancelledOrders: orders.cancelledOrders,
        newCustomers: customers.newCustomers,
        activeCustomers: customers.activeCustomers,
        recurringCustomers: customers.recurringCustomers,
        productsSold: products.productsSold,
        conversionRate: null,
      },
      revenueSeries,
      ordersSeries,
      topProducts,
      categories,
      collections,
      paymentMethods,
      shippingMethods,
      lowStock,
      recentOrders,
      promotions,
    };

    this.setCached(cacheKey, payload);
    return payload;
  }

  getRevenue(query: AnalyticsPeriodQueryDto) {
    const range = resolveAnalyticsPeriod(query);
    return Promise.all([
      this.revenueAnalytics.getSummary(range),
      this.revenueAnalytics.getSeries(range),
    ]).then(([summary, series]) => ({
      period: this.serializeRange(range),
      summary,
      series,
    }));
  }

  getOrders(query: AnalyticsPeriodQueryDto) {
    const range = resolveAnalyticsPeriod(query);
    return Promise.all([
      this.orderAnalytics.getSummary(range),
      this.orderAnalytics.getDailySeries(range),
      this.orderAnalytics.getRecentOrders(),
    ]).then(([summary, series, recentOrders]) => ({
      period: this.serializeRange(range),
      summary,
      series,
      recentOrders,
    }));
  }

  getProducts(query: AnalyticsPeriodQueryDto) {
    const range = resolveAnalyticsPeriod(query);
    return Promise.all([
      this.productAnalytics.getSummary(range),
      this.productAnalytics.getTopProducts(range),
      this.productAnalytics.getCategoryBreakdown(range),
      this.productAnalytics.getCollectionRanking(range),
    ]).then(([summary, topProducts, categories, collections]) => ({
      period: this.serializeRange(range),
      summary,
      topProducts,
      categories,
      collections,
    }));
  }

  getCustomers(query: AnalyticsPeriodQueryDto) {
    const range = resolveAnalyticsPeriod(query);
    return this.customerAnalytics.getSummary(range).then((summary) => ({
      period: this.serializeRange(range),
      summary,
    }));
  }

  getInventory() {
    return Promise.all([
      this.inventoryAnalytics.getLowStockItems(),
      this.inventoryAnalytics.getLowStockThreshold(),
    ]).then(([items, threshold]) => ({
      threshold,
      items,
    }));
  }

  async logAccess(adminEmail: string) {
    await this.prisma.dashboardAccessLog.create({
      data: { adminEmail },
    });
  }

  private serializeRange(range: AnalyticsDateRange) {
    return {
      preset: range.preset,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    };
  }

  private getCached(key: string) {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.payload;
  }

  private setCached(key: string, payload: unknown) {
    this.cache.set(key, {
      payload,
      expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
    });
  }
}
