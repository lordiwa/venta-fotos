import { collection, getDocs, limit, orderBy, query, doc, getDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, functions, storage } from './firebase'
import type { Order, OrderStatus, Photo } from './types'
import type { OrderRow } from './ordersLogic'

export const ORDERS_LIMIT = 200

/** Los pedidos mas recientes (solo admin lo permite). Se filtra en el cliente: sin indices compuestos. */
export async function listOrders(): Promise<OrderRow[]> {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ORDERS_LIMIT)))
  return snap.docs.map((d) => {
    const o = d.data() as Order
    return { id: d.id, number: o.number ?? d.id, status: o.status, delivery: o.delivery, lines: o.lines, eventIds: o.eventIds ?? [], total: o.total, buyer: o.buyer, createdAt: o.createdAt?.toDate() ?? null }
  })
}

export async function advanceOrder(orderId: string, from: OrderStatus): Promise<OrderStatus> {
  return (await httpsCallable<unknown, { status: OrderStatus }>(functions, 'advanceOrder')({ orderId, from })).data.status
}

export async function getPhoto(eventId: string, photoId: string): Promise<Photo | null> {
  const s = await getDoc(doc(db, 'events', eventId, 'photos', photoId))
  return s.exists() ? ({ id: s.id, eventId, ...s.data() } as Photo) : null
}

/** Descarga del original: privado en Storage, lo lee solo el admin (storage.rules). */
export const originalUrl = (originalPath: string) => getDownloadURL(storageRef(storage, originalPath))
