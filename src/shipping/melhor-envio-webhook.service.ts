import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingTrackingService } from './shipping-tracking.service';
import { MelhorEnvioWebhookPayload } from './melhor-envio/melhor-envio.types';
import { SHIPPING_PROVIDERS } from './shipping.types';

@Injectable()
export class MelhorEnvioWebhookService {
  private readonly logger = new Logger(MelhorEnvioWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private trackingService: ShippingTrackingService,
  ) {}

  async handle(payload: MelhorEnvioWebhookPayload) {
    const webhookEvent = await this.prisma.shippingWebhookEvent.create({
      data: {
        provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
        externalId: payload.data?.id ?? payload.data?.protocol ?? null,
        payload: payload as object,
      },
    });

    try {
      const labelId = payload.data?.id;
      const tracking = payload.data?.tracking ?? payload.data?.self_tracking;

      if (!labelId && !tracking) {
        await this.markProcessed(webhookEvent.id);
        return { received: true };
      }

      const order = await this.prisma.order.findFirst({
        where: {
          OR: [
            ...(labelId ? [{ shippingLabelId: labelId }] : []),
            ...(tracking ? [{ trackingCode: tracking }] : []),
          ],
        },
      });

      if (!order) {
        await this.markProcessed(webhookEvent.id);
        return { received: true };
      }

      if (tracking && !order.trackingCode) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { trackingCode: tracking },
        });
      }

      const status = payload.data?.status ?? payload.event ?? 'updated';
      const description = this.describeEvent(payload.event, status);

      await this.trackingService.applyLogisticStatus(
        order.id,
        status,
        description,
      );

      await this.markProcessed(webhookEvent.id);
      return { received: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao processar webhook';

      await this.prisma.shippingWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { error: message },
      });

      this.logger.error(message, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private describeEvent(event?: string, status?: string) {
    switch (event) {
      case 'shipment.created':
        return 'Etiqueta criada';
      case 'shipment.cancelled':
        return 'Etiqueta cancelada';
      case 'shipment.posted':
        return 'Objeto postado';
      case 'shipment.in_transit':
        return 'Objeto em trânsito';
      case 'shipment.out_for_delivery':
        return 'Objeto saiu para entrega';
      case 'shipment.delivered':
        return 'Objeto entregue';
      case 'shipment.failed':
        return 'Falha na entrega';
      case 'shipment.returned':
        return 'Devolução iniciada';
      default:
        return `Atualização logística: ${status ?? event ?? 'evento recebido'}`;
    }
  }

  private async markProcessed(id: string) {
    await this.prisma.shippingWebhookEvent.update({
      where: { id },
      data: { processedAt: new Date() },
    });
  }
}
