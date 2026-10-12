/** Logica pura del checkout (TASK-017): espejo de la validacion del servidor (functions/src/checkout.ts), que es la que manda. */
import type { CartLine } from './cartLogic'
import type { Delivery } from './types'

/** Debe coincidir con CURRENCY de functions/src/checkout.ts. */
export const CURRENCY = 'USD'

export interface CheckoutForm { name: string; email: string; phone: string; method: 'retiro' | 'envio'; address: string }
export type CheckoutErrors = Partial<Record<'name' | 'email' | 'phone' | 'address', string>>

/** CU2/CU4: un mensaje por campo; en retiro (o carrito solo digital) la direccion no se pide. */
export function validateCheckoutForm(f: CheckoutForm, hasPrints: boolean): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (!f.name.trim()) errors.name = 'Escribe tu nombre.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = 'Escribe un correo válido.'
  if (f.phone.replace(/\D/g, '').length < 7) errors.phone = 'Escribe un teléfono válido (mínimo 7 dígitos).'
  if (hasPrints && f.method === 'envio' && !f.address.trim()) errors.address = 'Escribe la dirección de envío.'
  return errors
}

/** Total estimado en pantalla (el cobrado lo calcula el servidor). Centavos enteros para no arrastrar error de punto flotante. */
export function totalWithShipping(itemsTotal: number, method: CheckoutForm['method'], hasPrints: boolean, shippingCost: number): number {
  const ship = hasPrints && method === 'envio' ? shippingCost : 0
  return (Math.round(itemsTotal * 100) + Math.round(ship * 100)) / 100
}

/** Lo unico que viaja al servidor de cada linea: ids y cantidad (precios y nombres salen del catalogo). */
export const toOrderLines = (lines: CartLine[]) => lines.map(({ eventId, photoId, productId, quantity }) => ({ eventId, photoId, productId, quantity }))

/** Resumen que devuelve captureOrder; se guarda en sessionStorage para la pagina de confirmacion (los pedidos no son publicos). */
export interface OrderSummary {
  number: string
  lines: { productName: string; unitPrice: number; quantity: number }[]
  total: number
  delivery: Delivery
}

const summaryKey = (number: string) => `venta-fotos:order:${number}`
export const saveSummary = (s: OrderSummary) => { try { sessionStorage.setItem(summaryKey(s.number), JSON.stringify(s)) } catch { /* sin almacenamiento */ } }

/** null si no hay resumen guardado o esta corrupto (nunca lanza). */
export function loadSummary(number: string): OrderSummary | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(summaryKey(number)) ?? 'null') as OrderSummary | null
    return s && s.number === number && Array.isArray(s.lines) && typeof s.total === 'number' && s.delivery ? s : null
  } catch { return null }
}
