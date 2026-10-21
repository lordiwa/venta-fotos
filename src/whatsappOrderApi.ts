/** Pedido por WhatsApp (TASK-037): alta en el servidor, estado publico y apertura de WhatsApp tras una llamada. */
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { CartLine } from './cartLogic'
import { toOrderLines } from './checkoutLogic'
import { whatsappLinkAttrs, type CreatedOrder, type LinkEnv } from './whatsappLogic'
import type { OrderStatus } from './types'

/** CU1/CU2: el servidor pone precio desde el catalogo y crea el pedido pendiente de pago. */
export async function createWhatsappOrder(lines: CartLine[], customer: { name: string; phone: string; email?: string }): Promise<CreatedOrder> {
  return (await httpsCallable<unknown, CreatedOrder>(functions, 'createWhatsappOrder')({ lines: toOrderLines(lines), customer })).data
}

/** Lo que devuelve getOrderStatus: sin telefono ni correo completos. */
export interface PublicOrder {
  number: string
  status: OrderStatus
  total: number
  savings: number
  lines: { productName: string; quantity: number; unitPrice: number }[]
  packs: { name: string; times: number; price: number }[]
  createdAt: number | null
  expiresAt: number | null
  customer: { name: string; phone: string; email: string }
  /** Tiene fotos digitales (se descargan en Mis descargas una vez pagado). */
  hasDigital: boolean
}

export async function getOrderStatus(number: string): Promise<PublicOrder> {
  return (await httpsCallable<unknown, PublicOrder>(functions, 'getOrderStatus')({ number })).data
}

/**
 * Abre WhatsApp despues de un await. Escritorio: la pestaña se abre YA, dentro del clic (si no, el bloqueador de popups la
 * frena), y recibe la URL al terminar; si la llamada falla se cierra. Movil: misma pestaña, para que abra la app (TASK-036).
 */
export function whatsappOpener(env: LinkEnv | undefined) {
  const tab = whatsappLinkAttrs(env).target && typeof window !== 'undefined' ? window.open('', '_blank') : null
  return {
    go(url: string) {
      if (tab && !tab.closed) { tab.opener = null; tab.location.href = url } else window.location.assign(url)
    },
    cancel() { tab?.close() },
  }
}

/** Mensaje de la Function si es de negocio; uno generico si fue un fallo interno o de red. */
export function orderErrorMessage(e: unknown): string {
  const x = e as { code?: string; message?: string }
  return x.code && !['functions/internal', 'functions/unavailable', 'functions/unknown', 'functions/deadline-exceeded'].includes(x.code) && x.message
    ? x.message
    : 'No pudimos registrar tu pedido. Revisa tu conexión e intenta de nuevo.'
}
