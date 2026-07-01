import { CustomerSegment } from './dto/query-admin-crm-customers.dto';

export interface CrmSettings {
  vipThreshold: number;
  inactiveDays: number;
}

export interface CustomerOrderMetrics {
  paidOrderCount: number;
  totalSpent: number;
  averageTicket: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  totalOrderCount: number;
}

export function calculateStoreRevenue(subtotal: number, discount: number) {
  return Math.max(0, subtotal - discount);
}

export function resolveCustomerSegment(
  metrics: CustomerOrderMetrics,
  settings: CrmSettings,
  referenceDate = new Date(),
): CustomerSegment {
  if (metrics.paidOrderCount === 0) {
    return CustomerSegment.INACTIVE;
  }

  if (metrics.totalSpent >= settings.vipThreshold) {
    return CustomerSegment.VIP;
  }

  if (metrics.paidOrderCount === 1) {
    if (metrics.lastPurchaseAt) {
      const lastPurchase = new Date(metrics.lastPurchaseAt).getTime();
      const inactiveMs = settings.inactiveDays * 24 * 60 * 60 * 1000;
      if (referenceDate.getTime() - lastPurchase > inactiveMs) {
        return CustomerSegment.INACTIVE;
      }
    }

    return CustomerSegment.NEW;
  }

  if (metrics.lastPurchaseAt) {
    const lastPurchase = new Date(metrics.lastPurchaseAt).getTime();
    const inactiveMs = settings.inactiveDays * 24 * 60 * 60 * 1000;
    if (referenceDate.getTime() - lastPurchase > inactiveMs) {
      return CustomerSegment.INACTIVE;
    }
  }

  return CustomerSegment.RECURRING;
}

export function resolveCustomerStatus(input: {
  isGuest: boolean;
  segment: CustomerSegment;
}) {
  if (input.isGuest) {
    return 'Convidado';
  }

  if (input.segment === CustomerSegment.INACTIVE) {
    return 'Inativo';
  }

  return 'Ativo';
}
