import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REVENUE_ORDER_STATUSES } from '../analytics.constants';
import { AnalyticsDateRange } from '../analytics-period.util';

@Injectable()
export class CustomerAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(range: AnalyticsDateRange) {
    const [newCustomers, activeCustomers, recurringCustomers] =
      await Promise.all([
        this.prisma.customer.count({
          where: {
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.customer.count({
          where: {
            orders: {
              some: {
                status: { in: REVENUE_ORDER_STATUSES },
                createdAt: { gte: range.from, lte: range.to },
              },
            },
          },
        }),
        this.getRecurringCustomers(range),
      ]);

    return {
      newCustomers,
      activeCustomers,
      recurringCustomers,
    };
  }

  private async getRecurringCustomers(range: AnalyticsDateRange) {
    const customers = await this.prisma.customer.findMany({
      where: {
        orders: {
          some: {
            status: { in: REVENUE_ORDER_STATUSES },
            createdAt: { gte: range.from, lte: range.to },
          },
        },
      },
      select: {
        _count: {
          select: {
            orders: {
              where: {
                status: { in: REVENUE_ORDER_STATUSES },
                createdAt: { gte: range.from, lte: range.to },
              },
            },
          },
        },
      },
    });

    return customers.filter((customer) => customer._count.orders > 1).length;
  }
}
