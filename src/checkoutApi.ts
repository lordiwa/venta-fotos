import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { CartLine } from './cartLogic'
import { toOrderLines, type CheckoutForm, type OrderSummary } from './checkoutLogic'

export interface OrderRequest { lines: CartLine[]; form: CheckoutForm; simulated?: boolean }

/** createOrder: el servidor recalcula el total desde el catalogo y devuelve el id de la orden de PayPal. */
export async function createOrder({ lines, form, simulated }: OrderRequest): Promise<string> {
  const res = await httpsCallable<unknown, { paypalOrderId: string }>(functions, 'createOrder')({
    lines: toOrderLines(lines),
    buyer: { name: form.name, email: form.email, phone: form.phone },
    delivery: form.method === 'envio' ? { method: 'envio', address: form.address } : { method: 'retiro' },
    ...(simulated ? { simulated: true } : {}),
  })
  return res.data.paypalOrderId
}

/** captureOrder: captura el pago, verifica el monto y devuelve el resumen del pedido pagado (idempotente). */
export async function captureOrder(paypalOrderId: string): Promise<OrderSummary> {
  return (await httpsCallable<unknown, OrderSummary>(functions, 'captureOrder')({ paypalOrderId })).data
}
