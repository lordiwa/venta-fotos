/** Texto de paquetes de la pagina del evento (TASK-034). Sin Firebase. */
import { DIGITAL_ID } from './productsLogic'

interface ProductLike { id: string; kind: string; price: number; active?: boolean; quantity?: number }
export interface PackRow { quantity: number; price: number; savings: number }
export interface PacksInfo { unitPrice: number; packs: PackRow[] }

const cents = (n: number) => Math.round(n * 100)
const money = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * Foto digital suelta + paquetes activos con su ahorro frente a sueltas, por cantidad ascendente.
 * null si lo digital esta inactivo o no hay paquetes que ahorren (un paquete sin ahorro nunca lo aplica el carrito).
 */
export function packsInfo(products: ProductLike[]): PacksInfo | null {
  const active = products.filter((p) => p.active === true)
  const digital = active.find((p) => p.kind === 'digital' || p.id === DIGITAL_ID)
  if (!digital || !money(digital.price)) return null
  const unit = cents(digital.price)
  const seen = new Set<number>()
  const packs = active
    .filter((p) => p.kind === 'pack' && Number.isInteger(p.quantity) && p.quantity! >= 2 && money(p.price))
    .map((p) => ({ quantity: p.quantity!, price: p.price, savings: (p.quantity! * unit - cents(p.price)) / 100 }))
    .filter((r) => r.savings > 0)
    .sort((a, b) => a.quantity - b.quantity || a.price - b.price)
    .filter((r) => !seen.has(r.quantity) && !!seen.add(r.quantity)) // cantidad repetida: queda la mas barata
  return packs.length ? { unitPrice: digital.price, packs } : null
}
