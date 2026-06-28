export const SHIPPING_PROVIDERS = {
  CORREIOS: 'Correios',
  RETIRADA_LOJA: 'RetiradaLoja',
} as const;

export type ShippingProviderName =
  (typeof SHIPPING_PROVIDERS)[keyof typeof SHIPPING_PROVIDERS];

export interface ShippingCartItem {
  productVariantId: string;
  quantity: number;
}

export interface ShippingQuote {
  shippingMethodId: string;
  provider: string;
  service: string;
  serviceCode: string;
  price: number;
  deadline: number;
}

export interface ShippingMethodRecord {
  id: string;
  name: string;
  provider: string;
  serviceCode: string;
  isActive: boolean;
  displayOrder: number;
}
