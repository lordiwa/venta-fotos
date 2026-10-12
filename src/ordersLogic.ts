/** Logica pura de pedidos (TASK-018): estados, filtros y lista de impresion. Sin Firebase ni DOM. */
import type { Delivery, OrderLine, OrderStatus } from './types'
import { DIGITAL_ID } from './productsLogic'

export interface OrderRow {
  id: string
  number: string
  status: OrderStatus
  delivery: Delivery
  lines: OrderLine[]
  eventIds: string[]
  total: number
  buyer: { name: string; email: string; phone?: string }
  createdAt: Date | null
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pagado: 'Pagado', impreso: 'Impreso', listo_retiro: 'Listo para retiro', enviado: 'Enviado', entregado: 'Entregado',
}
export const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[]

export const isPrintLine = (l: Pick<OrderLine, 'productId'>) => l.productId !== DIGITAL_ID
export const hasPrints = (o: Pick<OrderRow, 'lines'>) => o.lines.some(isPrintLine)

/** CU4/CU5: unico estado al que se puede avanzar (null si ya esta entregado). Debe coincidir con functions/src/orderStatus.ts. */
export function nextStatus(o: Pick<OrderRow, 'status' | 'delivery' | 'lines'>): OrderStatus | null {
  switch (o.status) {
    case 'pagado': return hasPrints(o) ? 'impreso' : 'entregado'
    case 'impreso': return o.delivery.method === 'envio' ? 'enviado' : 'listo_retiro'
    case 'listo_retiro':
    case 'enviado': return 'entregado'
    default: return null
  }
}

export interface OrderFilters { eventId: string; status: string; method: string } // '' = todos

/** CU2: los filtros se combinan (AND). */
export const filterOrders = (orders: OrderRow[], f: OrderFilters): OrderRow[] =>
  orders.filter((o) => (!f.eventId || o.eventIds.includes(f.eventId)) && (!f.status || o.status === f.status) && (!f.method || o.delivery.method === f.method))

export interface PrintGroup {
  productId: string
  productName: string
  total: number
  /** Una entrada por foto (suma de copias de todos los pedidos pendientes). */
  photos: { eventId: string; photoId: string; quantity: number }[]
}

/** CU6/CU7: copias de lineas NO digitales de pedidos en "pagado", agrupadas por producto (tamano). */
export function printList(orders: OrderRow[]): PrintGroup[] {
  const groups = new Map<string, PrintGroup>()
  for (const o of orders) {
    if (o.status !== 'pagado') continue
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
