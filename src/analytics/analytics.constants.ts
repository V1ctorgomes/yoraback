import { OrderStatus } from '@prisma/client';

export const REVENUE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export const MAX_CUSTOM_PERIOD_DAYS = 365;

export const ANALYTICS_CACHE_TTL_MS = 30_000;
