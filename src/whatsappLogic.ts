/** Logica pura del pedido por WhatsApp (TASK-026): sin Firebase ni DOM. */
import { formatMoney } from './productsLogic'
import { packBreakdown, type reconcile } from './cartLogic'

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
  const digits = t.replace(/\D/g, '')
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
export function whatsappLine(l: WhatsAppLine): string {
  return [l.event, `Foto ${l.photo}`, `${l.product} × ${l.quantity}`, l.subtotal == null ? undefined : formatMoney(l.subtotal)]
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
export function buildWhatsAppMessage({ lines, packs = [], total }: { lines: WhatsAppLine[]; packs?: WhatsAppPacks[]; total?: number }): string {
  const parts = ['Hola, quisiera pedir estas fotos:', ...lines.map((l) => `• ${whatsappLine(l)}`)]
  for (const g of packs) {
    parts.push(...g.items.map((i) => `• ${[g.event, `${i.label} × ${i.quantity}`, formatMoney(i.subtotal)].filter(Boolean).join(' – ')}`))
    parts.push(`  Ahorro por paquetes${g.event ? ` (${g.event})` : ''}: ${formatMoney(g.savings)}`)
  }
  if (total != null) parts.push(`Total estimado: USD ${formatMoney(total)}`)
  return parts.join('\n')
}

/** Pedido del carrito (TASK-029): solo lineas que cuentan, con el mismo desglose de paquetes y el mismo total que la pantalla. */
export function whatsappFromCart(
  view: ReturnType<typeof reconcile>,
  eventName: (eventId: string) => string | undefined,
  photoName: (eventId: string, photoId: string) => string,
): { lines: WhatsAppLine[]; packs: WhatsAppPacks[]; total: number } {
  return {
    lines: view.lines.filter((r) => r.counted).map((r): WhatsAppLine => ({
      event: eventName(r.line.eventId), photo: photoName(r.line.eventId, r.line.photoId),
      product: r.product?.name ?? r.line.productName ?? 'Producto', quantity: r.quantity, subtotal: r.inPack ? undefined : r.subtotal,
    })),
    packs: view.groups.filter((g) => g.pricing.packs.length).map((g) => ({ event: eventName(g.eventId), items: packBreakdown(g), savings: g.pricing.savingsCents / 100 })),
    total: view.total,
  }
}

/** wa.me exige solo digitos en el numero (sin "+" ni espacios) y el texto codificado. */
export const whatsappUrl = (digits: string, message: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
