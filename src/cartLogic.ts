/** Logica pura del carrito (TASK-016): sin Firebase ni DOM. */
import type { Product } from './types'
import { digitalPackPricing, type PackPricing } from './packPricing'
import { productLabel } from './i18n/format'
import { messagesFor, type Locale } from './i18n/messages'

export const MAX_QTY = 99
export const CART_KEY = 'venta-fotos:cart'

export interface CartLine {
  eventId: string
  photoId: string
  productId: string
  quantity: number
  /** Precio unitario cuando se agrego: sirve para avisar "El precio cambió". */
  priceAtAdd: number
  /** Solo para mostrar si el producto ya no existe; los precios salen siempre del catalogo. */
  productName?: string
}

export const lineKey = (l: Pick<CartLine, 'eventId' | 'photoId' | 'productId'>) => `${l.eventId}/${l.photoId}/${l.productId}`
const round2 = (n: number) => Math.round(n * 100) / 100

/** CU10: cantidad entera 1..99; si no es valida devuelve `prev` (el valor anterior valido). */
export function parseQuantity(input: unknown, prev: number): number {
  const n = typeof input === 'string' ? (/^\s*\d+\s*$/.test(input) ? Number(input) : NaN) : input
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : prev
}

/** CU1/CU2/CU3: agrega o fusiona. Lo digital queda siempre en 1; lo impreso suma con tope en 99. Nunca muta la entrada. */
export function addToCart(lines: CartLine[], add: Omit<CartLine, 'quantity'>, quantity: number, kind: Product['kind']): CartLine[] {
  const key = lineKey(add)
  const q = parseQuantity(quantity, 1)
  const i = lines.findIndex((l) => lineKey(l) === key)
  if (i < 0) return [...lines, { ...add, quantity: kind === 'digital' ? 1 : q }]
  const next = lines.slice()
  next[i] = { ...lines[i], priceAtAdd: add.priceAtAdd, quantity: kind === 'digital' ? 1 : Math.min(MAX_QTY, lines[i].quantity + q) }
  return next
}

/** CU4/CU10: fija la cantidad de una linea; un valor invalido la deja como estaba. */
export function setLineQuantity(lines: CartLine[], key: string, input: unknown): CartLine[] {
  return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: parseQuantity(input, l.quantity) } : l))
}

export const removeLine = (lines: CartLine[], key: string): CartLine[] => lines.filter((l) => lineKey(l) !== key)
export const cartCount = (lines: CartLine[]): number => lines.reduce((n, l) => n + l.quantity, 0)

/** Ids no vacios y sin '/', que es el separador de lineKey (evita claves ambiguas). */
const validId = (v: unknown): v is string => typeof v === 'string' && v !== '' && !v.includes('/')

const isLine = (x: unknown): x is CartLine => {
  const l = x as Record<string, unknown> | null
  return !!l && typeof l === 'object'
    && validId(l.eventId) && validId(l.photoId) && validId(l.productId)
    && typeof l.quantity === 'number' && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= MAX_QTY
    && typeof l.priceAtAdd === 'number' && Number.isFinite(l.priceAtAdd) && l.priceAtAdd >= 0
}

/** CU6: lee el JSON guardado; ignora lo corrupto/ajeno (nunca lanza) y fusiona claves repetidas. */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(data)) return []
  const out = new Map<string, CartLine>()
  for (const x of data) {
    if (!isLine(x)) continue
    const line: CartLine = { eventId: x.eventId, photoId: x.photoId, productId: x.productId, quantity: x.quantity, priceAtAdd: x.priceAtAdd }
    if (typeof x.productName === 'string') line.productName = x.productName.slice(0, 100)
    const k = lineKey(line)
    const prev = out.get(k)
    out.set(k, prev ? { ...prev, quantity: Math.min(MAX_QTY, prev.quantity + line.quantity) } : line)
  }
  return [...out.values()]
}

export type LineStatus = 'ok' | 'priceChanged' | 'productUnavailable' | 'photoUnavailable' | 'printOnly'
/** 'printOnly' (TASK-030): la foto se vende, pero solo impresa. */
export type PhotoAvailability = 'available' | 'unavailable' | 'printOnly'

export interface ReconciledLine {
  line: CartLine
  key: string
  status: LineStatus
  product: Product | null
  /** Precio vigente (el actual del catalogo); 0 si no hay producto. */
  unitPrice: number
  /** Cantidad efectiva: lo digital cuenta siempre 1, aunque el almacenamiento diga otra cosa. */
  quantity: number
  /** Importe de la linea; 0 si esta excluida del total. */
  subtotal: number
  counted: boolean
  /** TASK-029: digital de un evento cuyo precio sale de paquetes (el importe real esta en el desglose del grupo). */
  inPack: boolean
}

/** Fotos digitales vendibles de un evento con su mejor combinacion de paquetes (TASK-029). */
export interface DigitalGroup {
  eventId: string
  keys: string[]
  unitPrice: number
  pricing: PackPricing<Product>
}

export interface BreakdownItem { label: string; quantity: number; subtotal: number }

/** Desglose de un grupo: un renglon por paquete usado y uno por las sueltas. Suma = total del grupo. */
export function packBreakdown(g: DigitalGroup, lang: Locale = 'es'): BreakdownItem[] {
  const m = messagesFor(lang)
  const items = g.pricing.packs.map((u) => ({ label: productLabel(u.pack.name, m, lang), quantity: u.times, subtotal: (Math.round(u.pack.price * 100) * u.times) / 100 }))
  if (g.pricing.singles) items.push({ label: m.cart.singles, quantity: g.pricing.singles, subtotal: (Math.round(g.unitPrice * 100) * g.pricing.singles) / 100 })
  return items
}

/** CU7/CU8/CU9: contrasta las lineas con el catalogo activo y la disponibilidad de la foto. Foto no disponible prevalece. Lo digital de una foto solo impresion no cuenta (TASK-030). */
export function reconcile(lines: CartLine[], activeProducts: Product[], photos: Record<string, PhotoAvailability>): { lines: ReconciledLine[]; groups: DigitalGroup[]; total: number } {
  // Un paquete no se compra como linea: si una linea vieja apunta a uno, queda "no disponible".
  const byId = new Map(activeProducts.filter((p) => p.kind !== 'pack').map((p) => [p.id, p]))
  const out = lines.map((line): ReconciledLine => {
    const product = byId.get(line.productId) ?? null
    const photo = photos[`${line.eventId}/${line.photoId}`]
    let status: LineStatus = 'ok'
    if (photo === 'unavailable') status = 'photoUnavailable'
    else if (!product) status = 'productUnavailable'
    else if (photo === 'printOnly' && product.kind === 'digital') status = 'printOnly'
    else if (product.price !== line.priceAtAdd) status = 'priceChanged'
    const counted = status === 'ok' || status === 'priceChanged'
    const unitPrice = product?.price ?? 0
    const quantity = product?.kind === 'digital' ? 1 : line.quantity
    return { line, key: lineKey(line), status, product, unitPrice, quantity, subtotal: counted ? round2(unitPrice * quantity) : 0, counted, inPack: false }
  })
  // TASK-029: por evento, las digitales vendibles se cobran con la combinacion mas barata de paquetes activos + sueltas.
  const packs = activeProducts.filter((p) => p.kind === 'pack')
  const byEvent = new Map<string, ReconciledLine[]>()
  for (const r of out) if (r.counted && r.product?.kind === 'digital') byEvent.set(r.line.eventId, [...(byEvent.get(r.line.eventId) ?? []), r])
  const groups = [...byEvent].map(([eventId, rs]): DigitalGroup => {
    const pricing = digitalPackPricing(rs.length, packs, rs[0].unitPrice)
    if (pricing.packs.length) for (const r of rs) r.inPack = true
    return { eventId, keys: rs.map((r) => r.key), unitPrice: rs[0].unitPrice, pricing }
  })
  const savingsCents = groups.reduce((s, g) => s + g.pricing.savingsCents, 0)
  const linesCents = out.reduce((s, l) => s + Math.round(l.subtotal * 100), 0)
  return { lines: out, groups, total: (linesCents - savingsCents) / 100 }
}
