/** Texto de paquetes de la pagina del evento (TASK-034). Sin Firebase. */
import { digitalPackPricing, validPack } from './packPricing'
import { DIGITAL_ID } from './productsLogic'

interface ProductLike { id: string; kind: string; price: number; active?: boolean; quantity?: number }
export interface PackRow { quantity: number; price: number; savings: number }
export interface PacksInfo { unitPrice: number; packs: PackRow[] }

const cents = (n: number) => Math.round(n * 100)

/**
 * Foto digital suelta + paquetes activos con su ahorro frente a sueltas, por cantidad ascendente.
 * Solo se muestra un paquete si el carrito lo usaria para exactamente su cantidad de fotos (misma regla que digitalPackPricing):
 * asi se descartan los dominados, los sin ahorro y las cantidades repetidas. null si lo digital esta inactivo o no queda ningun paquete.
 */
export function packsInfo(products: ProductLike[]): PacksInfo | null {
  const active = products.filter((p) => p.active === true)
  const digital = active.find((p) => p.kind === 'digital' || p.id === DIGITAL_ID)
  if (!digital || !(typeof digital.price === 'number' && Number.isFinite(digital.price) && digital.price > 0)) return null
  const unit = cents(digital.price)
  const packs = active.filter((p): p is ProductLike & { quantity: number } => p.kind === 'pack' && validPack(p))
  const rows = packs
    .filter((p) => {
      const r = digitalPackPricing(p.quantity, packs, digital.price)
      return r.packs.length === 1 && r.packs[0].pack === p && r.packs[0].times === 1 && r.singles === 0 && r.totalCents === cents(p.price)
    })
    .map((p) => ({ quantity: p.quantity, price: p.price, savings: (p.quantity * unit - cents(p.price)) / 100 }))
    .sort((a, b) => a.quantity - b.quantity)
  return rows.length ? { unitPrice: digital.price, packs: rows } : null
}
