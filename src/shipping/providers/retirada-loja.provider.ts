import { Injectable } from '@nestjs/common';
import {
  SHIPPING_PROVIDERS,
  ShippingCartItem,
  ShippingMethodRecord,
  ShippingQuote,
} from '../shipping.types';
import { ShippingProvider } from './shipping-provider.interface';

@Injectable()
export class RetiradaLojaProvider implements ShippingProvider {
  readonly name = SHIPPING_PROVIDERS.RETIRADA_LOJA;

  async calculate(
    _zipCode: string,
    _items: ShippingCartItem[],
    methods: ShippingMethodRecord[],
  ): Promise<ShippingQuote[]> {
    return methods
      .filter((method) => method.provider === this.name && method.isActive)
      .map((method) => ({
        shippingMethodId: method.id,
        provider: method.provider,
        service: method.name,
        serviceCode: method.serviceCode,
        price: 0,
        deadline: 1,
      }));
  }
}
