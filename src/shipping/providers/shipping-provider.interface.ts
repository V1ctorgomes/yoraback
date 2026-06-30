import {
  ActiveShippingServiceRecord,
  ShippingCartItem,
  ShippingQuote,
} from '../shipping.types';

export interface ShippingProvider {
  readonly name: string;
  calculate(
    zipCode: string,
    items: ShippingCartItem[],
    services: ActiveShippingServiceRecord[],
  ): Promise<ShippingQuote[]>;
}
