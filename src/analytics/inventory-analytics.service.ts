import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
} from './analytics.constants';

@Injectable()
export class InventoryAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getLowStockThreshold() {
    const settings = await this.prisma.storeSetting.findUnique({
      where: { id: 'default' },
    });

    return settings?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  }

  async getLowStockItems(limit = 20) {
    const threshold = await this.getLowStockThreshold();

    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        stock: { lte: threshold },
        product: { isActive: true },
      },
      orderBy: [{ stock: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        sku: true,
        color: true,
        size: true,
        stock: true,
        product: { select: { name: true } },
      },
    });

    return variants.map((variant) => ({
      productName: variant.product.name,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      stock: variant.stock,
      threshold,
    }));
  }
}
