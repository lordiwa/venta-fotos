/** Modelo de datos de Firestore. Fechas como Timestamp de Firestore; importes en la moneda de la tienda. */
import type { Timestamp } from 'firebase/firestore'

/** events/{eventId} */
export interface Event {
  id: string
  name: string
  date: Timestamp
  published: boolean
  description?: string
  coverPhotoId?: string
}

/** events/{eventId}/photos/{photoId}. Los archivos viven en Storage: originals|previews|thumbs/{eventId}/{photoId}. */
export interface Photo {
  id: string
  eventId: string
  visible: boolean
  /** Rutas de Storage (el original nunca es publico). */
  originalPath: string
  previewPath?: string
  thumbPath?: string
  createdAt: Timestamp
}

export type ProductKind = 'print' | 'digital'

/** products/{productId}: tamano de impresion o archivo digital. */
export interface Product {
  id: string
  name: string
  kind: ProductKind
  price: number
  active?: boolean
}

/** settings/store */
export interface StoreSettings {
  shippingCost: number
  pickupInfo: string
}

/** orders/{orderId}: solo escribible por Cloud Functions. */
export interface OrderLine {
  eventId: string
  photoId: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
}

export type OrderStatus = 'pagado' | 'impreso' | 'listo_retiro' | 'enviado' | 'entregado'

export type Delivery =
  | { method: 'retiro' }
  | { method: 'envio'; address: string; cost: number }

export interface Order {
  id: string
  lines: OrderLine[]
  total: number
  status: OrderStatus
  delivery: Delivery
  buyer: { name: string; email: string; phone?: string }
  paypalOrderId: string
  createdAt: Timestamp
}
