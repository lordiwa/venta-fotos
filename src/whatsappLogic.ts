/** Logica pura del pedido por WhatsApp (TASK-026): sin Firebase ni DOM. */
import { formatMoney } from './productsLogic'
import { packBreakdown, type reconcile } from './cartLogic'
import { formatDeadline, productLabel } from './i18n/format'
import { messagesFor, type Locale } from './i18n/messages'

export const DEFAULT_WHATSAPP_PHONE = '+593998565995'
export const WHATSAPP_PHONE_ERROR = 'Escribe un número válido con código de país, sin el 0 inicial: solo + y dígitos, de 8 a 15 (ej. +593998565995)'

/**
 * Entrada del admin -> solo digitos para wa.me, o null si es invalida.
 * Permite un "+" inicial, espacios y guiones; exige 8 a 15 digitos y que no empiece en 0
 * (un numero local sin codigo de pais no sirve en wa.me). Lo no-string cuenta como vacio.
 */
export function normalizePhone(input: unknown): string | null {
  const t = String(input ?? '').trim()
  if (!/^\+?[\d\s-]+$/.test(t)) return null
  // Ecuador: el 0 de discado nacional escrito despues del codigo ("+593 099...") se quita; wa.me no lo acepta.
  const digits = t.replace(/\D/g, '').replace(/^5930/, '593')
  return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? digits : null
}

/** Vacio es valido (la app usa el numero por defecto); lo demas debe normalizar. */
export function validateWhatsappPhone(input: unknown): string | null {
  return String(input ?? '').trim() === '' || normalizePhone(input) ? null : WHATSAPP_PHONE_ERROR
}

/** Valor a guardar en settings/store: "+digitos", o "" si el admin lo dejo vacio. */
export function phoneToStore(input: unknown): string {
  const d = normalizePhone(input)
  return d ? `+${d}` : ''
}

/** Numero efectivo (solo digitos) a partir de lo guardado: invalido o ausente -> el por defecto. */
export function resolveWhatsappDigits(stored: unknown): string {
  return normalizePhone(stored) ?? (normalizePhone(DEFAULT_WHATSAPP_PHONE) as string)
}

export interface WhatsAppLine {
  /** Nombre del evento; se omite si no se conoce (carrito sin red). */
  event?: string
  /** Nombre del archivo o, si falta, el id de la foto. */
  photo: string
  product: string
  quantity: number
  /** Importe de la linea; sin el no se muestra precio (sin catalogo). */
  subtotal?: number
}

/** Una linea: "Evento – Foto X – Producto × N – 10.00" (las partes desconocidas se omiten). */
export function whatsappLine(l: WhatsAppLine, lang: Locale = 'es'): string {
  return [l.event, messagesFor(lang).wa.photo(l.photo), `${l.product} × ${l.quantity}`, l.subtotal == null ? undefined : formatMoney(l.subtotal, lang)]
    .filter(Boolean)
    .join(' – ')
}

/** Paquetes digitales de un evento (TASK-029): renglones del desglose del carrito y ahorro. */
export interface WhatsAppPacks {
  event?: string
  items: { label: string; quantity: number; subtotal: number }[]
  savings: number
}

/**
 * Mensaje del pedido. `total` solo se incluye cuando se conoce (hay catalogo). Las fotos digitales cobradas por paquete
 * van sin importe propio; su precio sale en el desglose de `packs`, igual que en el carrito.
 */
export function buildWhatsAppMessage({ lines, packs = [], total }: { lines: WhatsAppLine[]; packs?: WhatsAppPacks[]; total?: number }, lang: Locale = 'es'): string {
  const w = messagesFor(lang).wa
  const parts = [w.hello, ...lines.map((l) => `• ${whatsappLine(l, lang)}`)]
  for (const g of packs) {
    parts.push(...g.items.map((i) => `• ${[g.event, `${i.label} × ${i.quantity}`, formatMoney(i.subtotal, lang)].filter(Boolean).join(' – ')}`))
    parts.push(`  ${w.packSavings(g.event)}: ${formatMoney(g.savings, lang)}`)
  }
  if (total != null) parts.push(`${w.estimated}: USD ${formatMoney(total, lang)}`)
  return parts.join('\n')
}

/** Pedido del carrito (TASK-029): solo lineas que cuentan, con el mismo desglose de paquetes y el mismo total que la pantalla. */
export function whatsappFromCart(
  view: ReturnType<typeof reconcile>,
  eventName: (eventId: string) => string | undefined,
  photoName: (eventId: string, photoId: string) => string,
  lang: Locale = 'es',
): { lines: WhatsAppLine[]; packs: WhatsAppPacks[]; total: number } {
  return {
    lines: view.lines.filter((r) => r.counted).map((r): WhatsAppLine => ({
      event: eventName(r.line.eventId), photo: photoName(r.line.eventId, r.line.photoId),
      product: productLabel(r.product?.name ?? r.line.productName ?? messagesFor(lang).common.product, messagesFor(lang), lang), quantity: r.quantity, subtotal: r.inPack ? undefined : r.subtotal,
    })),
    packs: view.groups.filter((g) => g.pricing.packs.length).map((g) => ({ event: eventName(g.eventId), items: packBreakdown(g, lang), savings: g.pricing.savingsCents / 100 })),
    total: view.total,
  }
}

/** wa.me exige solo digitos en el numero (sin "+" ni espacios) y el texto codificado. */
export const whatsappUrl = (digits: string, message: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(message)}`

/** Lo que el navegador dice del dispositivo; ausente cuando no hay window (SSR, tests). */
export interface LinkEnv { coarsePointer?: boolean; noHover?: boolean; userAgent?: string }

/**
 * Atributos del enlace a WhatsApp (TASK-036). En movil va en la misma pestaña y sin target: los universal/app links
 * no se disparan al abrir una pestaña nueva y el celular muestra la pagina de "Descargar WhatsApp" en vez del chat.
 * En escritorio (o sin informacion del dispositivo) se abre WhatsApp Web en una pestaña nueva, con rel=noopener.
 */
export function whatsappLinkAttrs(env?: LinkEnv): { target?: '_blank'; rel?: 'noopener' } {
  const mobile = !!env && ((env.coarsePointer && env.noHover) || /Android|iPhone|iPad|iPod/i.test(env.userAgent ?? ''))
  return mobile ? {} : { target: '_blank', rel: 'noopener' }
}

/** Lee el dispositivo actual; sin window o sin matchMedia devuelve undefined (=> pestaña nueva). */
export function currentLinkEnv(): LinkEnv | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    noHover: window.matchMedia('(hover: none)').matches,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  }
}

// ---- TASK-037: pedido registrado y recordatorio de pago ----

/** Datos del cliente en el carrito. El telefono se escribe con codigo de pais (por defecto +593, editable). */
export interface CustomerForm { name: string; phone: string; email: string }
export type CustomerErrors = Partial<Record<keyof CustomerForm, string>>
export const DEFAULT_PHONE_PREFIX = '+593 '
export const CUSTOMER_KEY = 'venta-fotos:customer'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** CU1: nombre y WhatsApp obligatorios; correo obligatorio solo si hay fotos digitales (las descargas se validan con el). Espejo de parseCustomer del servidor. */
export function validateCustomer(f: CustomerForm, hasDigital: boolean, lang: Locale = 'es'): CustomerErrors {
  const e: CustomerErrors = {}
  const v = messagesFor(lang).validation
  if (!f.name.trim()) e.name = v.name
  if (!normalizePhone(f.phone)) e.phone = v.phone
  // Sin digitales el correo no se muestra ni se envia: uno viejo e invalido guardado no debe bloquear el pedido.
  const email = f.email.trim()
  if (hasDigital && !email) e.email = v.emailRequired
  else if (hasDigital && !EMAIL_RE.test(email)) e.email = v.emailInvalid
  return e
}

/** Lo que viaja a createWhatsappOrder: el correo solo si hay digitales (sin digitales no se pide ni se guarda en el pedido). */
export const customerPayload = (f: CustomerForm, hasDigital: boolean) => ({
  name: f.name.trim(), phone: normalizePhone(f.phone) ?? '', ...(hasDigital && f.email.trim() ? { email: f.email.trim() } : {}),
})

/** Datos recordados en localStorage; cualquier cosa corrupta vuelve al formulario vacio con el prefijo por defecto. */
export function parseStoredCustomer(raw: string | null): CustomerForm {
  const empty = { name: '', phone: DEFAULT_PHONE_PREFIX, email: '' }
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<CustomerForm> | null
    if (!v || typeof v !== 'object') return empty
    const str = (x: unknown, d: string) => (typeof x === 'string' ? x.slice(0, 200) : d)
    return { name: str(v.name, ''), phone: str(v.phone, DEFAULT_PHONE_PREFIX) || DEFAULT_PHONE_PREFIX, email: str(v.email, '') }
  } catch { return empty }
}

/** Respuesta de createWhatsappOrder: totales y lineas calculados por el servidor. */
export interface CreatedOrder {
  number: string
  total: number
  savings: number
  expiresAt: number
  lines: { eventId: string; photoId: string; productName: string; unitPrice: number; quantity: number }[]
  packs: { eventId: string; name: string; times: number; price: number }[]
}

/** Hora limite legible en la hora de la tienda (Ecuador), igual para el cliente y el admin. */
export const deadlineText = (ms: number, lang: Locale = 'es', timeZone?: string): string => formatDeadline(ms, lang, timeZone)

/**
 * CU1: mensaje del pedido registrado, con lo que devolvio el servidor (no el total del carrito). Las lineas van a precio
 * suelto y el ahorro por paquetes se resta aparte, para que la cuenta cuadre con el total.
 */
export function whatsappOrderMessage(o: CreatedOrder, opts: { name: string; link: string; eventName: (id: string) => string | undefined; photoName: (eventId: string, photoId: string) => string; lang?: Locale }): string {
  const lang = opts.lang ?? 'es'
  const m = messagesFor(lang)
  const w = m.wa
  const parts = [
    w.helloOrder(opts.name, o.number),
    ...o.lines.map((l) => `• ${whatsappLine({ event: opts.eventName(l.eventId), photo: opts.photoName(l.eventId, l.photoId), product: productLabel(l.productName, m, lang), quantity: l.quantity, subtotal: l.unitPrice * l.quantity }, lang)}`),
    ...o.packs.map((p) => {
      const ev = opts.eventName(p.eventId)
      return `  ${w.applied(productLabel(p.name, m, lang), p.times, formatMoney(p.price, lang))}${ev ? ` – ${ev}` : ''}`
    }),
  ]
  if (o.savings > 0) parts.push(`${w.savings}: −${formatMoney(o.savings, lang)}`)
  parts.push(`${w.total}: USD ${formatMoney(o.total, lang)}`, `${w.payBy}: ${deadlineText(o.expiresAt, lang)}`, `${w.myOrder}: ${opts.link}`)
  return parts.join('\n')
}

/** CU6: recordatorio que el admin envia al cliente desde el panel. */
export function reminderMessage(o: { name: string; number: string; total: number; expiresAt: number; link: string }): string {
  return [
    `Hola ${o.name.split(/\s+/)[0]}, te recordamos tu pedido ${o.number} por USD ${formatMoney(o.total)}.`,
    `Está pendiente de pago y se anula el ${deadlineText(o.expiresAt)}.`,
    `Detalle: ${o.link}`,
  ].join('\n')
}

/** Enlace publico del pedido (/pedido/:number). */
export const orderLink = (origin: string, number: string): string => `${origin.replace(/\/$/, '')}/pedido/${encodeURIComponent(number)}`
