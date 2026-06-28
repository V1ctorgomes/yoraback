import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStockService } from './order-stock.service';

@Injectable()
export class OrderExpirationService {
  private readonly logger = new Logger(OrderExpirationService.name);

  constructor(
    private prisma: PrismaService,
    private orderStock: OrderStockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingOrders() {
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.WAITING_PAYMENT,
        paymentExpiresAt: { lte: new Date() },
      },
      select: { id: true, orderNumber: true },
    });

    for (const order of expiredOrders) {
      try {
        const cancelled = await this.expireOrderIfNeeded(order.id);
        if (cancelled) {
          this.logger.log(
            `Pedido ${order.orderNumber} cancelado por expiração de pagamento`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Falha ao expirar pedido ${order.orderNumber}: ${error}`,
        );
      }
    }
  }

  async expireByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });

    if (!order) {
      return false;
    }

    return this.expireOrderIfNeeded(order.id);
  }

  async expireOrderIfNeeded(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== OrderStatus.WAITING_PAYMENT) {
      return false;
    }

    if (order.paymentExpiresAt > new Date()) {
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });

      if (
        !current ||
        current.status !== OrderStatus.WAITING_PAYMENT ||
        current.paymentExpiresAt > new Date()
      ) {
        return;
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          previousStatus: current.status,
          newStatus: OrderStatus.CANCELLED,
          adminId: 'system',
          adminEmail: 'system@yora.com.br',
        },
      });

      await this.orderStock.restoreStock(orderId, tx);
    });

    return true;
  }

  isPaymentWindowOpen(paymentExpiresAt: Date) {
    return paymentExpiresAt.getTime() > Date.now();
  }
}
