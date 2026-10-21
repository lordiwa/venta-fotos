/** Logica pura de pedidos (TASK-018, TASK-037): estados, filtros, pestañas, recordatorio y lista de impresion. Sin Firebase ni DOM. */
import type { Delivery, OrderLine, OrderPack, OrderStatus } from './types'
import { DIGITAL_ID } from './productsLogic'

export interface OrderRow {
  id: string
  number: string
  status: OrderStatus
  /** TASK-037: ausente = PayPal. */
  channel?: 'whatsapp'
  /** Solo PayPal; los pedidos por WhatsApp acuerdan la entrega en el chat. */
  delivery?: Delivery
  lines: OrderLine[]
  eventIds: string[]
  total: number
  packs?: OrderPack[]
  /** Contacto: buyer (PayPal) o customer (WhatsApp, telefono en digitos con codigo de pais). */
  buyer: { name: string; email?: string; phone?: string }
  createdAt: Date | null
  expiresAt?: Date | null
  reminderSentAt?: Date | null
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', en_preparacion: 'En preparación', impreso: 'Impreso', listo_retiro: 'Listo para retiro',
  enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', anulado: 'Anulado',
}
export const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[]

/** CU8: Activos = todo lo que aun hay que cobrar, preparar o entregar; Historial = cerrados. */
export const HISTORY_STATUSES: OrderStatus[] = ['entregado', 'cancelado', 'anulado']
export type OrderTab = 'activos' | 'historial'
export const orderTab = (s: OrderStatus): OrderTab => (HISTORY_STATUSES.includes(s) ? 'historial' : 'activos')
export const tabStatuses = (t: OrderTab): OrderStatus[] => STATUSES.filter((s) => orderTab(s) === t)

const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
/** CU8: busca por numero de pedido o nombre del cliente, sin distinguir mayusculas ni tildes. Vacio = todos. */
export const searchOrders = (orders: OrderRow[], q: string): OrderRow[] => {
  const t = fold(q)
  return t ? orders.filter((o) => fold(o.number).includes(t) || fold(o.buyer.name ?? '').includes(t)) : orders
}

/**
 * TASK-029: ahorro por paquetes de un pedido = lineas (a precio suelto) + envio - total, como el descuento enviado a PayPal.
 * 0 si el pedido no tiene paquetes (pedidos anteriores incluidos).
 */
export function packSavings(o: { lines: { unitPrice: number; quantity: number }[]; total: number; delivery?: Delivery; packs?: unknown[] }): number {
  if (!o.packs?.length) return 0
  const lines = o.lines.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.quantity, 0)
  const ship = o.delivery?.method === 'envio' ? Math.round(o.delivery.cost * 100) : 0
  return Math.max(0, lines + ship - Math.round(o.total * 100)) / 100
}

export const isPrintLine = (l: Pick<OrderLine, 'productId'>) => l.productId !== DIGITAL_ID
export const hasPrints = (o: Pick<OrderRow, 'lines'>) => o.lines.some(isPrintLine)

type StatusInput = Pick<OrderRow, 'status' | 'delivery' | 'lines' | 'channel'>
const WHATSAPP_NEXT: Partial<Record<OrderStatus, OrderStatus>> = { pendiente_pago: 'pagado', pagado: 'en_preparacion', en_preparacion: 'entregado' }

/** CU4/CU5: siguiente estado del flujo (null si el pedido ya esta cerrado). Debe coincidir con functions/src/orderStatus.ts. */
export function nextStatus(o: StatusInput): OrderStatus | null {
  if (o.channel === 'whatsapp') return WHATSAPP_NEXT[o.status] ?? null
  switch (o.status) {
    case 'pagado': return hasPrints(o) ? 'impreso' : 'entregado'
    case 'impreso': return o.delivery?.method === 'envio' ? 'enviado' : 'listo_retiro'
    case 'listo_retiro':
    case 'enviado': return 'entregado'
    default: return null
  }
}

/** TASK-037: el siguiente y, en pedidos por WhatsApp pendientes o pagados, cancelado. anulado solo lo pone expireOrders. */
export function allowedTransitions(o: StatusInput): OrderStatus[] {
  const next = nextStatus(o)
  return [...(next ? [next] : []), ...(o.channel === 'whatsapp' && (o.status === 'pendiente_pago' || o.status === 'pagado') ? ['cancelado' as const] : [])]
}

/** Texto del boton que lleva a cada estado. */
export const ACTION_LABEL: Partial<Record<OrderStatus, string>> = { pagado: 'Marcar pagado', en_preparacion: 'En preparación', entregado: 'Entregado', cancelado: 'Cancelar' }

/** Pasadas estas horas sin pago, el pedido se marca "recordar pago" (debe coincidir con la mitad de ORDER_TTL_MS del servidor). */
export const REMINDER_AFTER_MS = 12 * 60 * 60 * 1000

/** CU6: pendiente de pago, con 12 h o mas desde el alta y sin recordatorio enviado. */
export const needsReminder = (o: Pick<OrderRow, 'status' | 'createdAt' | 'reminderSentAt'>, now: number): boolean =>
  o.status === 'pendiente_pago' && !!o.createdAt && now >= o.createdAt.getTime() + REMINDER_AFTER_MS && !o.reminderSentAt

/** CU3: "Quedan 5 h 20 min" hasta la anulacion; "Vencido" si ya paso (la Function lo anula en la siguiente corrida). */
export function timeLeftText(expiresAt: Date | null | undefined, now: number): string {
  if (!expiresAt) return ''
  const ms = expiresAt.getTime() - now
  if (ms <= 0) return 'Vencido: se anulará en unos minutos'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `Quedan ${h ? `${h} h ` : ''}${m} min para pagar`
}

export interface OrderFilters { eventId: string; status: string; method: string } // '' = todos

/** CU2: los filtros se combinan (AND). */
export const filterOrders = (orders: OrderRow[], f: OrderFilters): OrderRow[] =>
  orders.filter((o) => (!f.eventId || o.eventIds.includes(f.eventId)) && (!f.status || o.status === f.status) && (!f.method || o.delivery?.method === f.method))

export interface PrintGroup {
  productId: string
  productName: string
  total: number
  /** Una entrada por foto (suma de copias de todos los pedidos pendientes). */
  photos: { eventId: string; photoId: string; quantity: number }[]
}

/** Estados cuyas copias hay que imprimir: pagado (PayPal y WhatsApp) y en_preparacion (WhatsApp, TASK-037). */
export const PRINT_STATUSES: OrderStatus[] = ['pagado', 'en_preparacion']

/** CU6/CU7: copias de lineas NO digitales de pedidos por imprimir (PRINT_STATUSES), agrupadas por producto (tamano). */
export function printList(orders: OrderRow[]): PrintGroup[] {
  const groups = new Map<string, PrintGroup>()
  for (const o of orders) {
    if (!PRINT_STATUSES.includes(o.status)) continue
    for (const l of o.lines.filter(isPrintLine)) {
      const g = groups.get(l.productId) ?? { productId: l.productId, productName: l.productName, total: 0, photos: [] }
      groups.set(l.productId, g)
      g.total += l.quantity
      const p = g.photos.find((x) => x.eventId === l.eventId && x.photoId === l.photoId)
      if (p) p.quantity += l.quantity
      else g.photos.push({ eventId: l.eventId, photoId: l.photoId, quantity: l.quantity })
    }
  }
  return [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName))
}

/** Nombre de archivo para el original descargado: evento-nombre, siempre con extension (el nombre guardado puede no traerla). */
export const downloadName = (eventId: string, name: string): string => {
  const base = `${eventId}-${name}`.replace(/[\\/:*?"<>|]/g, '_')
  return /\.[A-Za-z0-9]{2,5}$/.test(base) ? base : `${base}.jpg`
}
