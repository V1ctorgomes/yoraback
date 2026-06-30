export const SHIPPING_PROVIDERS = {
  MELHOR_ENVIO: 'MelhorEnvio',
} as const;

export type ShippingProviderName =
  (typeof SHIPPING_PROVIDERS)[keyof typeof SHIPPING_PROVIDERS];

export interface ShippingCartItem {
  productVariantId: string;
  quantity: number;
}

export interface ShippingQuote {
  shippingMethodId: string;
  shippingServiceId: string;
  provider: string;
  carrier: string;
  service: string;
  serviceCode: string;
  price: number;
  deadline: number;
  message: string | null;
  externalServiceId: number;
}

export interface ActiveShippingServiceRecord {
  id: string;
  externalId: string;
  name: string;
  displayOrder: number;
  customMessage: string | null;
  carrier: {
    id: string;
    name: string;
    isActive: boolean;
    displayOrder: number;
    customMessage: string | null;
  };
}
