/** Logica pura de productos y ajustes de tienda (sin Firebase): validacion y normalizacion. */

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

export interface SettingsForm { shippingCost: string; pickupInfo: string }
export type SettingsErrors = Partial<Record<'shippingCost', string>>

/** CU7: 0 vale (envio gratis); negativo o no numerico se rechaza. */
export function validateSettingsForm(f: SettingsForm): SettingsErrors {
  return parseMoney(f.shippingCost) === null ? { shippingCost: SHIPPING_ERROR } : {}
}

export function settingsFields(f: SettingsForm) {
  return { shippingCost: parseMoney(f.shippingCost) as number, pickupInfo: f.pickupInfo.trim() }
}

export const formatMoney = (n: number) => n.toFixed(2)
