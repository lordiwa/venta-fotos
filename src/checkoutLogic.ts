/** Logica pura del checkout (TASK-017): espejo de la validacion del servidor (functions/src/checkout.ts), que es la que manda. */
import type { CartLine } from './cartLogic'
import type { Delivery, OrderPack } from './types'
import { messagesFor, type Locale } from './i18n/messages'

/** Debe coincidir con CURRENCY de functions/src/checkout.ts. */
export const CURRENCY = 'USD'

export interface CheckoutForm { name: string; email: string; phone: string; method: 'retiro' | 'envio'; address: string }
export type CheckoutErrors = Partial<Record<'name' | 'email' | 'phone' | 'address', string>>

/** CU2/CU4: un mensaje por campo; en retiro (o carrito solo digital) la direccion no se pide. */
export function validateCheckoutForm(f: CheckoutForm, hasPrints: boolean, lang: Locale = 'es'): CheckoutErrors {
  const errors: CheckoutErrors = {}
  const v = messagesFor(lang).validation
  if (!f.name.trim()) errors.name = v.name
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = v.emailInvalid
  if (f.phone.replace(/\D/g, '').length < 7) errors.phone = v.checkoutPhone
  if (hasPrints && f.method === 'envio' && !f.address.trim()) errors.address = v.address
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
  /** Correo del comprador (lo agrega el cliente desde el formulario; captureOrder no lo devuelve): con el numero permite pedir los enlaces de descarga (TASK-019). */
  email?: string
  lines: { productId?: string; productName: string; unitPrice: number; quantity: number }[]
  total: number
  delivery: Delivery
  /** TASK-029: paquetes aplicados; ausente en pedidos sin paquetes o anteriores. */
  packs?: OrderPack[]
}

/** Quita el sufijo tecnico de codigo HTTP ("[404]") que algunos mensajes de error traen al final. */
export const stripStatusSuffix = (m: string): string => m.replace(/\s*\[\d{3}\]\s*$/, '')

const summaryKey = (number: string) => `venta-fotos:order:${number}`
export const saveSummary = (s: OrderSummary) => { try { sessionStorage.setItem(summaryKey(s.number), JSON.stringify(s)) } catch { /* sin almacenamiento */ } }

/** null si no hay resumen guardado o esta corrupto (nunca lanza). */
export function loadSummary(number: string): OrderSummary | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(summaryKey(number)) ?? 'null') as OrderSummary | null
    return s && s.number === number && Array.isArray(s.lines) && typeof s.total === 'number' && s.delivery ? s : null
  } catch { return null }
}

const PENDING_KEY = 'venta-fotos:pending-order'
/** Orden de PayPal creada y aun no confirmada: si la captura falla por red, se reintenta sobre el MISMO id antes de crear otra. */
const PENDING_EMAIL_KEY = 'venta-fotos:pending-email'
/** El correo (recortado) se guarda junto al id para que, tras recargar, el resumen recuperado conserve el acceso a las descargas. */
export const savePending = (id: string, email = '') => {
  try { sessionStorage.setItem(PENDING_KEY, id); sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim()) } catch { /* sin almacenamiento */ }
}
export const clearPending = () => { try { sessionStorage.removeItem(PENDING_KEY); sessionStorage.removeItem(PENDING_EMAIL_KEY) } catch { /* sin almacenamiento */ } }
export const loadPendingEmail = (): string => { try { return sessionStorage.getItem(PENDING_EMAIL_KEY) ?? '' } catch { return '' } }
export const loadPending = (): string | null => { try { return sessionStorage.getItem(PENDING_KEY) } catch { return null } }

/**
 * Que hacer con un fallo de captureOrder: 'final' = el cobro quedo registrado sin pedido (no reintentar ni volver a pagar),
 * 'retry' = fallo de red/interno (reintentar el mismo id), 'definitive' = rechazo claro (se puede volver a empezar).
 */
export function classifyCaptureError(e: unknown): 'final' | 'retry' | 'definitive' {
  const err = e as { code?: string; details?: { final?: boolean } } | null
  if (err?.details?.final === true) return 'final'
  const retryable = !err?.code || ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/unknown'].includes(err.code)
  return retryable ? 'retry' : 'definitive'
}
