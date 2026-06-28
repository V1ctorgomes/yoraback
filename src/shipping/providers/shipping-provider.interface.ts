import {
  ShippingCartItem,
  ShippingMethodRecord,
  ShippingQuote,
} from '../shipping.types';

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

export interface ShippingProvider {
  readonly name: string;

  calculate(
    zipCode: string,
    items: ShippingCartItem[],
    methods: ShippingMethodRecord[],
  ): Promise<ShippingQuote[]>;
}
