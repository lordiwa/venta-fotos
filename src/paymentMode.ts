/** Modo de pago (TASK-027): sin VITE_PAYPAL_CLIENT_ID la tienda opera solo por WhatsApp. */
export type PaymentMode = 'paypal' | 'whatsapp'

/** Vacio, indefinido, no-string o solo espacios -> 'whatsapp'; cualquier id real -> 'paypal'. */
export function paymentMode(clientId: unknown): PaymentMode {
  return typeof clientId === 'string' && clientId.trim() ? 'paypal' : 'whatsapp'
}

export const currentPaymentMode = (): PaymentMode => paymentMode(import.meta.env.VITE_PAYPAL_CLIENT_ID)
