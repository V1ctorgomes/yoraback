export enum ShippingMethod {
  PAC = 'pac',
  SEDEX = 'sedex',
  PICKUP = 'pickup',
}

export const SHIPPING_PRICES: Record<ShippingMethod, number> = {
  [ShippingMethod.PAC]: 15.9,
  [ShippingMethod.SEDEX]: 29.9,
  [ShippingMethod.PICKUP]: 0,
};

export const SHIPPING_LABELS: Record<ShippingMethod, string> = {
  [ShippingMethod.PAC]: 'PAC',
  [ShippingMethod.SEDEX]: 'SEDEX',
  [ShippingMethod.PICKUP]: 'Retirada na Loja',
};
