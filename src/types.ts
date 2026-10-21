/** Modelo de datos de Firestore. Fechas como Timestamp de Firestore; importes en la moneda de la tienda. */
import type { Timestamp } from 'firebase/firestore'

/** events/{eventId} */
export interface Event {
  id: string
  name: string
  date: Timestamp
  published: boolean
  place?: string
  description?: string
  coverPhotoId?: string
  /** Portada dedicada (~1920px, sin marca) en covers/{eventId}/{coverPhotoId}.{hash}.webp (TASK-033; .jpg antes del backfill). Solo la escribe la Function syncEventCover (TASK-028). */
  coverPath?: string
}

export type PhotoStatus = 'processing' | 'ready' | 'error'

/** events/{eventId}/photos/{photoId}. Los archivos viven en Storage: originals|previews|thumbs/{eventId}/{photoId}. */
export interface Photo {
  id: string
  eventId: string
  visible: boolean
  /**
   * Consulta publica (TASK-015): las reglas solo dejan leer fotos con evento published == true, visible == true
   * y status == 'ready'; la query debe filtrar por visible y por status (y el evento por published).
   */
  /** La crea la Function al recibir el original: processing -> ready | error. */
  status: PhotoStatus
  /** Nombre del archivo subido. */
  name?: string
  width?: number
  height?: number
  errorMessage?: string
  /** Rutas de Storage (el original nunca es publico). */
  originalPath: string
  previewPath?: string
  thumbPath?: string
  /** TASK-030: la foto solo se vende impresa (sin archivo digital, ni suelto ni en paquete). Ausente = false. */
  printOnly?: boolean
  createdAt: Timestamp
}

export type ProductKind = 'print' | 'digital' | 'pack'

/** products/{productId}: tamano de impresion, archivo digital o paquete de N fotos digitales (TASK-029). */
export interface Product {
  id: string
  name: string
  kind: ProductKind
  price: number
  active?: boolean
  /** Solo en paquetes: cantidad de fotos digitales del mismo evento (entero 2..100). */
  quantity?: number
}

/** Paquete aplicado en un pedido (TASK-029): las OrderLine siguen siendo por foto a precio suelto; esto explica el descuento. */
export interface OrderPack {
  eventId: string
  productId: string
  name: string
  quantity: number
  price: number
  times: number
}

/** settings/store */
export interface StoreSettings {
  /** Pueden faltar: TASK-013 crea el documento solo con watermarkText. */
  shippingCost?: number
  pickupInfo?: string
  /** Texto de la marca de agua de las vistas previas. Si falta o queda vacio, la Function usa "MUESTRA". */
  watermarkText?: string
  /** Numero de WhatsApp para pedidos ("+" y digitos). Si falta, la app usa +593998565995. */
  whatsappPhone?: string
}

/** orders/{orderId}: solo escribible por Cloud Functions. */
export interface OrderLine {
  eventId: string
  photoId: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  /** Desde TASK-030; ausente en pedidos anteriores (lo digital se reconoce entonces por productId 'digital'). */
  kind?: ProductKind
}

/**
 * PayPal: pagado -> impreso -> listo_retiro | enviado -> entregado.
 * WhatsApp (TASK-037): pendiente_pago -> pagado -> en_preparacion -> entregado; cancelado (admin) y anulado (24 h sin pago).
 */
export type OrderStatus =
  | 'pendiente_pago' | 'pagado' | 'en_preparacion' | 'impreso' | 'listo_retiro' | 'enviado' | 'entregado' | 'cancelado' | 'anulado'

export type Delivery =
  | { method: 'retiro' }
  | { method: 'envio'; address: string; cost: number }

export interface Order {
  /** Id del documento = id de la orden de PayPal (idempotencia de captureOrder); WA-<number> en los pedidos por WhatsApp. */
  id: string
  /** Numero de pedido corto y no secuencial (8 caracteres) que ve el comprador en /pedido/<number>. */
  number: string
  lines: OrderLine[]
  /** Ids de evento de las lineas, sin repetir (desnormalizado al crear el pedido). Permite `eventIds array-contains <id>`; TASK-012 lo usa para bloquear la baja de eventos con pedidos. */
  eventIds: string[]
  total: number
  /** TASK-029: solo si se aplicaron paquetes digitales; total = suma de lineas - ahorro + envio. Ausente en pedidos anteriores. */
  packs?: OrderPack[]
  status: OrderStatus
  /** Solo PayPal: en los pedidos por WhatsApp la entrega se acuerda en el chat. */
  delivery?: Delivery
  /** Comprador de PayPal. */
  buyer?: { name: string; email: string; phone?: string }
  /** TASK-037: ausente = PayPal. */
  channel?: 'whatsapp'
  /** Cliente de WhatsApp: telefono en digitos con codigo de pais; correo solo si hay fotos digitales. */
  customer?: { name: string; phone: string; email?: string }
  /** TASK-037: ahorro por paquetes guardado al crear el pedido. */
  savings?: number
  /** TASK-037: createdAt + 24 h; vencido y sin pagar, expireOrders lo anula. */
  expiresAt?: Timestamp
  reminderSentAt?: Timestamp
  anuladoAt?: Timestamp
  paypalOrderId?: string
  createdAt: Timestamp
  /** Cambios de estado hechos por advanceOrder (el alta no genera entrada). */
  statusHistory?: { status: OrderStatus; at: Timestamp; by: string }[]
}
