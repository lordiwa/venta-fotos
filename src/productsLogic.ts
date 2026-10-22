/** Logica pura de productos y ajustes de tienda (sin Firebase): validacion y normalizacion. */
import { MAX_PACK_QUANTITY } from './packPricing'

export const PRICE_ERROR = 'El precio debe ser un número mayor que 0'
export const NAME_ERROR = 'El nombre es obligatorio'
export const SHIPPING_ERROR = 'El costo de envío debe ser un número mayor o igual a 0'
export const DIGITAL_ID = 'digital' // id fijo: garantiza a lo sumo un producto digital
export const DIGITAL_NAME = 'Archivo digital'

/** Texto -> importe en dinero (2 decimales) o null si no es un numero decimal valido y no negativo. Acepta coma o punto. */
export function parseMoney(s: string): number | null {
  const t = s.trim()
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t.replace(',', '.')) * 100) / 100
}

export interface ProductForm { name: string; price: string }
export type ProductErrors = Partial<Record<'name' | 'price', string>>

/** CU4/CU5: precio > 0 y nombre obligatorio. */
export function validateProductForm(f: ProductForm, opts: { requireName?: boolean } = {}): ProductErrors {
  const errors: ProductErrors = {}
  if (opts.requireName !== false && !f.name.trim()) errors.name = NAME_ERROR
  const p = parseMoney(f.price)
  if (p === null || p <= 0) errors.price = PRICE_ERROR
  return errors
}

export function productFields(f: ProductForm) {
  return { name: f.name.trim(), price: parseMoney(f.price) as number }
}

export const PACK_QUANTITY_ERROR = `La cantidad debe ser un número entero de 2 a ${MAX_PACK_QUANTITY}`
export const PACK_DUPLICATE_ERROR = 'Ya hay un paquete con esa cantidad de fotos'
export const packName = (quantity: number) => `Paquete ${quantity} fotos digitales`

export interface PackForm { quantity: string; price: string }
export type PackErrors = Partial<Record<'quantity' | 'price', string>>

/** TASK-029: cantidad entera 2..100 (sin repetir otra existente) y precio > 0. */
export function validatePackForm(f: PackForm, otherQuantities: number[] = []): PackErrors {
  const errors: PackErrors = {}
  const q = /^\s*\d+\s*$/.test(f.quantity) ? Number(f.quantity) : NaN
  if (!(q >= 2 && q <= MAX_PACK_QUANTITY)) errors.quantity = PACK_QUANTITY_ERROR
  else if (otherQuantities.includes(q)) errors.quantity = PACK_DUPLICATE_ERROR
  const p = parseMoney(f.price)
  if (p === null || p <= 0) errors.price = PRICE_ERROR
  return errors
}

/** Documento del paquete: el nombre sale de la cantidad ("Paquete 5 fotos digitales"). */
export function packFields(f: PackForm) {
  const quantity = Number(f.quantity)
  return { name: packName(quantity), quantity, price: parseMoney(f.price) as number }
}

export interface SettingsForm { shippingCost: string; pickupInfo: string; whatsappPhone?: string }
export type SettingsErrors = Partial<Record<'shippingCost', string>>

/** CU7: 0 vale (envio gratis); negativo o no numerico se rechaza. */
export function validateSettingsForm(f: SettingsForm): SettingsErrors {
  return parseMoney(f.shippingCost) === null ? { shippingCost: SHIPPING_ERROR } : {}
}

export function settingsFields(f: SettingsForm) {
  const base = { shippingCost: parseMoney(f.shippingCost) as number, pickupInfo: f.pickupInfo.trim() }
  // Solo se escribe si el formulario lo trae: con merge:true no se pisan los demas campos.
  return f.whatsappPhone === undefined ? base : { ...base, whatsappPhone: f.whatsappPhone.trim() }
}

/** Documento settings/store (posiblemente incompleto) -> valores del formulario. */
export function settingsToForm(s: { shippingCost?: number; pickupInfo?: string; whatsappPhone?: unknown } | null): SettingsForm & { whatsappPhone: string } {
  return { shippingCost: s?.shippingCost == null ? '' : formatMoney(s.shippingCost), pickupInfo: s?.pickupInfo ?? '', whatsappPhone: String(s?.whatsappPhone ?? '') }
}

export const OFFLINE_NOTICE = 'Sin conexión. Mantén esta pestaña abierta: los cambios se guardarán al volver la conexión.'
export const OFFLINE_MS = 6000

/**
 * Firestore encola las escrituras sin red y la promesa no se resuelve ni rechaza hasta volver la conexion.
 * Si tarda mas de `ms`, avisa con onSlow (sin cancelar nada: la escritura sigue en cola). Resuelve/rechaza como `p`.
 */
export function withOfflineNotice<T>(p: Promise<T>, onSlow: () => void, ms = OFFLINE_MS): Promise<T> {
  const t = setTimeout(onSlow, ms)
  return p.finally(() => clearTimeout(t))
}

export const PERMISSION_MESSAGE = 'No tienes permiso para guardar. Vuelve a iniciar sesión.'
export const NETWORK_MESSAGE = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo; tus datos siguen en el formulario.'

/** CU10/CU11: distingue permiso denegado de un fallo de red al guardar. */
export function saveErrorMessage(e: unknown): string {
  return (e as { code?: string } | null)?.code === 'permission-denied' ? PERMISSION_MESSAGE : NETWORK_MESSAGE
}

/** Productos que se eligen para una foto: nunca paquetes (TASK-029, se aplican solos en el carrito); sin lo digital si la foto es solo impresion (TASK-030). */
export const offeredProducts = <T extends { kind: string }>(xs: T[], printOnly: boolean): T[] =>
  xs.filter((p) => (p.kind === 'print' || p.kind === 'digital') && !(printOnly && p.kind === 'digital'))

/** TASK-040: true si entre los productos ofrecidos hay alguna impresion (muestra la explicacion fine art). */
export const hasPrintOffer = (xs: { kind: string }[]): boolean => xs.some((p) => p.kind !== 'digital')

/** Orden numerico-aware por nombre: "9x13" antes que "20x25". */
export const sortByName = <T extends { name: string }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))

export const formatMoney = (n: number) => n.toFixed(2)
