import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderStockService {
  constructor(private prisma: PrismaService) {}

  async restoreStock(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.stockRestored) {
      return;
    }

    for (const item of order.items) {
      await client.productVariant.update({
        where: { id: item.productVariantId },
        data: { stock: { increment: item.quantity } },
      });
    }

    await client.order.update({
      where: { id: orderId },
      data: { stockRestored: true },
    });
  }
}
