import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SOLD_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class PromotionAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardMetrics() {
    const [usageGroups, discountAggregate, revenueAggregate] =
      await Promise.all([
        this.prisma.promotionUsage.groupBy({
          by: ['promotionId'],
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: {
            promotionId: { not: null },
            status: { in: SOLD_ORDER_STATUSES },
          },
          _sum: { discount: true },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: {
            promotionId: { not: null },
            status: { in: SOLD_ORDER_STATUSES },
          },
          _sum: { total: true },
        }),
      ]);

    const topUsageGroups = [...usageGroups]
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);

    const promotionIds = topUsageGroups.map((group) => group.promotionId);
    const promotions = promotionIds.length
      ? await this.prisma.promotion.findMany({
          where: { id: { in: promotionIds } },
          select: { id: true, name: true, code: true },
        })
      : [];

    const promotionMap = new Map(
      promotions.map((promotion) => [promotion.id, promotion]),
    );

    const topPromotions = topUsageGroups.map((group) => {
      const promotion = promotionMap.get(group.promotionId);

      return {
        promotionId: group.promotionId,
        name: promotion?.name ?? 'Promoção removida',
        code: promotion?.code ?? null,
        usageCount: group._count._all,
      };
    });

    const ordersWithPromotion = discountAggregate._count._all;
    const totalDiscountGranted = Number(discountAggregate._sum.discount ?? 0);
    const promotionRevenue = Number(revenueAggregate._sum.total ?? 0);

    const totalSoldOrders = await this.prisma.order.count({
      where: { status: { in: SOLD_ORDER_STATUSES } },
    });

    const conversionRate =
      totalSoldOrders > 0 ? ordersWithPromotion / totalSoldOrders : 0;

    return {
      topPromotions,
      totalDiscountGranted,
      promotionRevenue,
      ordersWithPromotion,
      conversionRate,
    };
  }
}
