/**
 * TASK-042 CU7: mensajes de error del servidor para el comprador. En espanol se muestra el texto de la Function (como siempre);
 * en ingles se traduce por el `code` del error, para que nunca aparezca texto crudo en espanol. Sin Firebase ni DOM.
 */
import { messagesFor, type Locale, type Messages } from './i18n/messages'
import { stripStatusSuffix } from './checkoutLogic'

type Ctx = 'order' | 'download' | 'checkout' | 'status'
interface FnError { code?: string; message?: string }
const INTERNAL = ['functions/internal', 'functions/unavailable', 'functions/unknown', 'functions/deadline-exceeded']

const fallback = (m: Messages, ctx: Ctx) => ({ order: m.errors.orderFallback, download: m.errors.downloadFallback, checkout: m.errors.paymentFallback, status: m.errors.statusFallback })[ctx]

/** Traduccion por codigo. Lo que no se reconoce cae en el mensaje generico del contexto (nunca en texto del servidor). */
function byCode(code: string, ctx: Ctx, m: Messages): string {
  const e = m.errors
  switch (code) {
    case 'functions/not-found': return ctx === 'download' ? e.downloadNotFound : e.orderNotFound
    case 'functions/resource-exhausted': return ctx === 'order' ? e.orderRateLimit : e.tooManyAttempts
    case 'functions/invalid-argument': return e.invalidArgument
    case 'functions/failed-precondition': return ctx === 'checkout' ? e.paymentFailed : e.unavailable
    default: return fallback(m, ctx)
  }
}

/** Pago final (cobrado en PayPal sin pedido): conserva el id que el cliente debe guardar, sacado del mensaje del servidor. */
function finalPaymentMessage(x: FnError, m: Messages): string | null {
  const msg = x.message ?? ''
  const review = /\(id ([\w-]+)\)/.exec(msg)
  if (review) return m.errors.paymentReview(review[1])
  const code = /c[oó]digo: ([\w-]+)\.?/.exec(msg)
  return code ? m.errors.paymentUnconfirmed(code[1]) : null
}

function serverErrorMessage(err: unknown, ctx: Ctx, lang: Locale): string {
  const m = messagesFor(lang)
  const x = (err ?? {}) as FnError
  const business = !!x.code && !INTERNAL.includes(x.code)
  if (!business) return fallback(m, ctx)
  if (lang === 'en') return (ctx === 'checkout' && x.code === 'functions/failed-precondition' && finalPaymentMessage(x, m)) || byCode(x.code!, ctx, m)
  // Espanol: el texto de la Function (si no trae, el generico). El de descargas/pagos trae a veces el sufijo tecnico "[404]".
  return x.message ? stripStatusSuffix(x.message) : fallback(m, ctx)
}

/** createWhatsappOrder (carrito). */
export const orderErrorMessage = (e: unknown, lang: Locale = 'es') => serverErrorMessage(e, 'order', lang)
/** getDownloadLinks (Mis descargas y pedido). */
export const downloadErrorMessage = (e: unknown, lang: Locale = 'es') => serverErrorMessage(e, 'download', lang)
/** createOrder/captureOrder (checkout PayPal). */
export const checkoutErrorMessage = (e: unknown, lang: Locale = 'es') => serverErrorMessage(e, 'checkout', lang)
/** getOrderStatus (/pedido/:number). Mismo mapa que siempre: not-found, demasiados intentos y generico. */
export function statusErrorMessage(e: unknown, lang: Locale = 'es'): string {
  const m = messagesFor(lang)
  const code = (e as FnError | null)?.code
  return code === 'functions/not-found' ? m.errors.orderNotFound : code === 'functions/resource-exhausted' ? m.errors.tooManyAttempts : m.errors.statusFallback
}

/** Mensajes informativos que acompanan a los enlaces de descarga (texto fijo del servidor): se reconocen por su texto en espanol. */
export function downloadNotice(message: string | undefined, lang: Locale = 'es'): string | undefined {
  if (!message || lang === 'es') return message
  const m = messagesFor('en')
  const known = new Map([[messagesFor('es').errors.downloadNoFiles, m.errors.downloadNoFiles], [messagesFor('es').errors.downloadMissing, m.errors.downloadMissing]])
  return known.get(message) ?? m.errors.noticeGeneric
}
