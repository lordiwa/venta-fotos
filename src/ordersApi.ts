import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryDocumentSnapshot } from 'firebase/firestore'
import { getBlob, ref as storageRef } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, functions, storage } from './firebase'
import type { Order, OrderStatus, Photo } from './types'
import { PRINT_STATUSES, type OrderRow } from './ordersLogic'

export const ORDERS_LIMIT = 200

function toRow(d: QueryDocumentSnapshot): OrderRow {
  const o = d.data() as Order
  return {
    id: d.id, number: o.number ?? d.id, status: o.status, ...(o.channel ? { channel: o.channel } : {}), ...(o.delivery ? { delivery: o.delivery } : {}),
    lines: o.lines, eventIds: o.eventIds ?? [], total: o.total, ...(o.packs?.length ? { packs: o.packs } : {}),
    buyer: o.customer ?? o.buyer ?? { name: '' }, createdAt: o.createdAt?.toDate() ?? null,
    expiresAt: o.expiresAt?.toDate() ?? null, reminderSentAt: o.reminderSentAt?.toDate() ?? null,
  }
}

/** Los pedidos mas recientes (solo admin lo permite). Se filtra en el cliente: sin indices compuestos. `capped`: puede haber mas de ORDERS_LIMIT. */
export async function listOrders(): Promise<{ orders: OrderRow[]; capped: boolean }> {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ORDERS_LIMIT)))
  return { orders: snap.docs.map(toRow), capped: snap.size >= ORDERS_LIMIT }
}

/** Todos los pedidos por imprimir (pagado / en_preparacion; la lista de impresion no puede depender del tope de listOrders). Sin orderBy: no pide indice compuesto. */
export async function listPaidOrders(): Promise<OrderRow[]> {
  return (await getDocs(query(collection(db, 'orders'), where('status', 'in', PRINT_STATUSES)))).docs.map(toRow)
}

/** Sin `to`: el siguiente estado del flujo. Con `to` (TASK-037): el estado elegido, que la Function valida. */
export async function advanceOrder(orderId: string, from: OrderStatus, to?: OrderStatus): Promise<OrderStatus> {
  return (await httpsCallable<unknown, { status: OrderStatus }>(functions, 'advanceOrder')({ orderId, from, ...(to ? { to } : {}) })).data.status
}

/** CU6: registra que el admin envio el recordatorio de pago; devuelve la fecha guardada. */
export async function markOrderReminder(orderId: string): Promise<Date> {
  return new Date((await httpsCallable<unknown, { reminderSentAt: number }>(functions, 'markOrderReminder')({ orderId })).data.reminderSentAt)
}

export async function getPhoto(eventId: string, photoId: string): Promise<Photo | null> {
  const s = await getDoc(doc(db, 'events', eventId, 'photos', photoId))
  return s.exists() ? ({ id: s.id, eventId, ...s.data() } as Photo) : null
}

/** Descarga del original sin URL con token: getBlob respeta storage.rules (solo admin) y no deja un enlace publico. */
export async function downloadOriginal(originalPath: string, filename: string): Promise<void> {
  const url = URL.createObjectURL(await getBlob(storageRef(storage, originalPath)))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // revocar al instante cancela la descarga en Firefox/Safari
}
