import { Injectable, NotFoundException } from '@nestjs/common';
import { LogisticStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MelhorEnvioApiClient } from './melhor-envio/melhor-envio-api.client';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';
import { SHIPPING_PROVIDERS } from './shipping.types';

@Injectable()
export class ShippingTrackingService {
  constructor(
    private prisma: PrismaService,
    private configService: MelhorEnvioConfigService,
    private apiClient: MelhorEnvioApiClient,
  ) {}

  async getByTrackingCode(trackingCode: string) {
    const order = await this.prisma.order.findFirst({
      where: { trackingCode },
      include: {
        shippingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Rastreamento não encontrado');
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingCode: order.trackingCode,
      provider: order.shippingProvider,
      service: order.shippingService,
      logisticStatus: order.logisticStatus,
      events: order.shippingEvents.map((event) => ({
        id: event.id,
        status: event.status,
        description: event.description,
        location: event.location,
        eventDate: event.eventDate.toISOString(),
      })),
    };
  }

  async syncOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order?.trackingCode) {
      throw new NotFoundException('Pedido sem código de rastreio');
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new NotFoundException('Melhor Envio não conectado');
    }

    const tracking = await this.apiClient.getTracking(environment, accessToken, [
      order.trackingCode,
    ]);

    const events = tracking[order.trackingCode] ?? [];

    for (const event of events) {
      const eventDate = new Date(event.date);
      const exists = await this.prisma.shippingEvent.findFirst({
        where: {
          orderId,
          description: event.observation,
          eventDate,
        },
      });

      if (exists) continue;

      await this.prisma.shippingEvent.create({
        data: {
          orderId,
          provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
          status: event.status,
          description: event.observation,
          location: event.location ?? null,
          eventDate,
        },
      });
    }

    const latest = events[0];
    if (latest) {
      await this.applyLogisticStatus(orderId, latest.status, latest.observation);
    }

    return this.getByTrackingCode(order.trackingCode);
  }

  async applyLogisticStatus(
    orderId: string,
    status: string,
    description: string,
  ) {
    const logisticStatus = this.mapLogisticStatus(status);
    const orderStatus = this.mapOrderStatus(status);

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        logisticStatus,
        ...(orderStatus ? { status: orderStatus } : {}),
      },
    });

    await this.prisma.shippingEvent.create({
      data: {
        orderId,
        provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
        status,
        description,
        eventDate: new Date(),
      },
    });
  }

  private mapLogisticStatus(status: string): LogisticStatus {
    const normalized = status.toLowerCase();

    if (normalized.includes('posted') || normalized.includes('postado')) {
      return LogisticStatus.POSTED;
    }
    if (normalized.includes('transit') || normalized.includes('trânsito')) {
      return LogisticStatus.IN_TRANSIT;
    }
    if (normalized.includes('delivery') || normalized.includes('entrega')) {
      return LogisticStatus.OUT_FOR_DELIVERY;
    }
    if (normalized.includes('delivered') || normalized.includes('entregue')) {
      return LogisticStatus.DELIVERED;
    }
    if (normalized.includes('failed') || normalized.includes('falha')) {
      return LogisticStatus.FAILED;
    }
    if (normalized.includes('return') || normalized.includes('devol')) {
      return LogisticStatus.RETURNED;
    }

    return LogisticStatus.IN_TRANSIT;
  }

  private mapOrderStatus(status: string): OrderStatus | null {
    const normalized = status.toLowerCase();

    if (normalized.includes('posted') || normalized.includes('postado')) {
      return OrderStatus.SHIPPED;
    }
    if (normalized.includes('delivered') || normalized.includes('entregue')) {
      return OrderStatus.DELIVERED;
    }

    return null;
  }
}
