import {
  Promotion,
  PromotionApplicationType,
  PromotionTarget,
  PromotionType,
} from '@prisma/client';

export interface PromotionCartItem {
  productId: string;
  categoryId: string;
  collectionId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PromotionValidationInput {
  code?: string;
  customerId?: string;
  cartItems: PromotionCartItem[];
  subtotal: number;
  shippingPrice?: number;
}

export interface PromotionValidationResult {
  valid: boolean;
  reason?: string;
  promotion?: {
    id: string;
    name: string;
    code: string | null;
    type: PromotionType;
    applicationType: PromotionApplicationType;
  };
  discountAmount: number;
  freeShipping: boolean;
  subtotal: number;
  shippingPrice: number;
  total: number;
}

export type PromotionWithTargets = Promotion & {
  targets: PromotionTarget[];
};

export const SOLD_ORDER_STATUSES = [
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
] as const;
