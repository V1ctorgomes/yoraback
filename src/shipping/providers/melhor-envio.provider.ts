import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SHIPPING_PROVIDERS,
  ShippingCartItem,
  ShippingMethodRecord,
  ShippingQuote,
} from '../shipping.types';
import { ShippingProvider } from './shipping-provider.interface';
import { MelhorEnvioApiClient } from '../melhor-envio/melhor-envio-api.client';
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
    methods: ShippingMethodRecord[],
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

      const services = await this.apiClient.calculateQuote(
        environment,
        accessToken,
        {
          from: { postal_code: fromZip },
          to: { postal_code: zipCode.replace(/\D/g, '') },
          products,
        },
      );

      const quotes: ShippingQuote[] = [];

      for (const service of services) {
        const method = await this.ensureShippingMethod(service);
        const isActive = methods.some(
          (entry) => entry.id === method.id && entry.isActive,
        );

        if (!isActive && methods.length > 0) {
          continue;
        }

        quotes.push({
          shippingMethodId: method.id,
          provider: this.name,
          service: `${service.company.name} ${service.name}`,
          serviceCode: String(service.id),
          price: Number(service.custom_price ?? service.price),
          deadline: Number(service.custom_delivery_time ?? service.delivery_time),
          externalServiceId: service.id,
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

  private async ensureShippingMethod(service: {
    id: number;
    name: string;
    company: { name: string };
  }) {
    const serviceCode = String(service.id);
    const name = `${service.company.name} ${service.name}`;

    const existing = await this.prisma.shippingMethod.findUnique({
      where: {
        provider_serviceCode: {
          provider: this.name,
          serviceCode,
        },
      },
    });

    if (existing) {
      if (existing.name !== name) {
        return this.prisma.shippingMethod.update({
          where: { id: existing.id },
          data: { name },
        });
      }
      return existing;
    }

    const maxOrder = await this.prisma.shippingMethod.aggregate({
      _max: { displayOrder: true },
    });

    return this.prisma.shippingMethod.create({
      data: {
        name,
        provider: this.name,
        serviceCode,
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        isActive: true,
      },
    });
  }
}
