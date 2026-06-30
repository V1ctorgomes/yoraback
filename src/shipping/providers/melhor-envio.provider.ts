import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActiveShippingServiceRecord,
  SHIPPING_PROVIDERS,
  ShippingCartItem,
  ShippingQuote,
} from '../shipping.types';
import { ShippingProvider } from './shipping-provider.interface';
import { MelhorEnvioApiClient } from '../melhor-envio/melhor-envio-api.client';
import type { MelhorEnvioQuoteService } from '../melhor-envio/melhor-envio.types';
import { MelhorEnvioConfigService } from '../melhor-envio/melhor-envio-config.service';
import { ShippingPackageSelectorService } from '../shipping-package-selector.service';
import { ShippingSendersService } from '../shipping-senders.service';

const DEFAULT_ORIGIN_ZIP = '01310100';

@Injectable()
export class MelhorEnvioProvider implements ShippingProvider {
  readonly name = SHIPPING_PROVIDERS.MELHOR_ENVIO;
  private readonly logger = new Logger(MelhorEnvioProvider.name);

  constructor(
    private prisma: PrismaService,
    private configService: MelhorEnvioConfigService,
    private apiClient: MelhorEnvioApiClient,
    private packageSelector: ShippingPackageSelectorService,
    private sendersService: ShippingSendersService,
  ) {}

  async calculate(
    zipCode: string,
    items: ShippingCartItem[],
    services: ActiveShippingServiceRecord[],
  ): Promise<ShippingQuote[]> {
    const isReady = await this.configService.isReady();
    if (!isReady) {
      return [];
    }

    try {
      const accessToken = await this.configService.getAccessToken();
      const environment = await this.configService.getEnvironment();

      if (!accessToken) {
        return [];
      }

      const activeExternalIds = new Set(services.map((service) => service.externalId));
      const serviceMap = new Map(
        services.map((service) => [service.externalId, service]),
      );

      const variantIds = items.map((item) => item.productVariantId);
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { basePrice: true } } },
      });

      const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
      const packageInfo = await this.packageSelector.selectForItems(
        items.map((item) => {
          const variant = variantMap.get(item.productVariantId);
          return {
            quantity: item.quantity,
            weightKg: variant?.weightKg ? Number(variant.weightKg) : null,
            lengthCm: variant?.lengthCm ? Number(variant.lengthCm) : null,
            widthCm: variant?.widthCm ? Number(variant.widthCm) : null,
            heightCm: variant?.heightCm ? Number(variant.heightCm) : null,
          };
        }),
      );

      const sender = await this.sendersService.getDefaultSender();
      const fromZip = sender?.zipCode.replace(/\D/g, '') ?? DEFAULT_ORIGIN_ZIP;

      const products = items.map((item) => {
        const variant = variantMap.get(item.productVariantId);
        const unitPrice = Number(
          variant?.priceOverride ?? variant?.product.basePrice ?? 0,
        );

        return {
          id: item.productVariantId,
          width: packageInfo.widthCm,
          height: packageInfo.heightCm,
          length: packageInfo.lengthCm,
          weight: packageInfo.totalWeightKg / items.length,
          insurance_value: unitPrice,
          quantity: item.quantity,
        };
      });

      const remoteServices = this.normalizeQuoteServices(
        await this.apiClient.calculateQuote(environment, accessToken, {
          from: { postal_code: fromZip },
          to: { postal_code: zipCode.replace(/\D/g, '') },
          products,
        }),
      );

      const quotes: ShippingQuote[] = [];

      for (const remote of remoteServices) {
        const externalId = String(remote.id);
        if (!activeExternalIds.has(externalId)) {
          continue;
        }

        const configured = serviceMap.get(externalId);
        if (!configured) {
          continue;
        }

        const carrierName = remote.company.name;
        const serviceName = remote.name;
        const message =
          configured.customMessage ??
          configured.carrier.customMessage ??
          null;

        quotes.push({
          shippingMethodId: configured.id,
          shippingServiceId: configured.id,
          provider: this.name,
          carrier: carrierName,
          service: serviceName,
          serviceCode: externalId,
          price: Number(remote.custom_price ?? remote.price),
          deadline: Number(remote.custom_delivery_time ?? remote.delivery_time),
          message,
          externalServiceId: remote.id,
        });
      }

      return quotes;
    } catch (error) {
      this.logger.error(
        'Falha ao calcular frete via Melhor Envio',
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }

  private normalizeQuoteServices(
    payload:
      | MelhorEnvioQuoteService[]
      | Record<string, MelhorEnvioQuoteService[]>,
  ) {
    if (Array.isArray(payload)) {
      return payload;
    }

    return Object.values(payload).flat();
  }
}
