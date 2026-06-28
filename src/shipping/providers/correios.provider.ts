import { Injectable, Logger } from '@nestjs/common';
import {
  SHIPPING_PROVIDERS,
  ShippingCartItem,
  ShippingMethodRecord,
  ShippingQuote,
} from '../shipping.types';
import { ShippingProvider } from './shipping-provider.interface';

const DEFAULT_ITEM_WEIGHT_KG = 0.3;
const BASE_PRICES: Record<string, { price: number; deadline: number }> = {
  pac: { price: 15.9, deadline: 8 },
  sedex: { price: 29.9, deadline: 3 },
};

@Injectable()
export class CorreiosProvider implements ShippingProvider {
  readonly name = SHIPPING_PROVIDERS.CORREIOS;
  private readonly logger = new Logger(CorreiosProvider.name);

  async calculate(
    zipCode: string,
    items: ShippingCartItem[],
    methods: ShippingMethodRecord[],
  ): Promise<ShippingQuote[]> {
    const activeMethods = methods.filter(
      (method) => method.provider === this.name && method.isActive,
    );

    if (activeMethods.length === 0) {
      return [];
    }

    const normalizedZip = zipCode.replace(/\D/g, '');
    const totalWeight = items.reduce(
      (total, item) => total + item.quantity * DEFAULT_ITEM_WEIGHT_KG,
      0,
    );
    const regionalFactor = this.getRegionalFactor(normalizedZip);
    const weightSurcharge = Math.max(0, totalWeight - 1) * 2.5;

    const quotes: ShippingQuote[] = [];

    for (const method of activeMethods) {
      const base = BASE_PRICES[method.serviceCode];

      if (!base) {
        this.logger.warn(
          `Serviço Correios desconhecido: ${method.serviceCode}`,
        );
        continue;
      }

      const price = Number(
        (base.price * regionalFactor + weightSurcharge).toFixed(2),
      );

      quotes.push({
        shippingMethodId: method.id,
        provider: method.provider,
        service: method.name,
        serviceCode: method.serviceCode,
        price,
        deadline: base.deadline,
      });
    }

    return quotes;
  }

  private getRegionalFactor(zipCode: string): number {
    const region = zipCode.charAt(0);

    switch (region) {
      case '0':
      case '1':
        return 1;
      case '2':
      case '3':
        return 1.05;
      case '4':
      case '5':
        return 1.1;
      case '6':
      case '7':
        return 1.15;
      case '8':
      case '9':
        return 1.2;
      default:
        return 1;
    }
  }
}
