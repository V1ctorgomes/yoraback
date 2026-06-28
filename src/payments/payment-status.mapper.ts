import { PaymentStatus } from '@prisma/client';

export function mapMercadoPagoStatus(status?: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return PaymentStatus.APPROVED;
    case 'rejected':
      return PaymentStatus.REJECTED;
    case 'cancelled':
      return PaymentStatus.CANCELLED;
    case 'refunded':
    case 'charged_back':
      return PaymentStatus.REFUNDED;
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    default:
      return PaymentStatus.PENDING;
  }
}

export type MercadoPagoPaymentResponse = {
  id?: number;
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  transaction_amount?: number;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};
