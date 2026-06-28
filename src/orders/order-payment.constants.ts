export const ORDER_PAYMENT_WINDOW_MINUTES = 10;
export const ORDER_PAYMENT_WINDOW_MS =
  ORDER_PAYMENT_WINDOW_MINUTES * 60 * 1000;

export function buildPaymentExpiresAt(from = new Date()) {
  return new Date(from.getTime() + ORDER_PAYMENT_WINDOW_MS);
}
