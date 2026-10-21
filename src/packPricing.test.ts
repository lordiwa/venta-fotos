// Prevents: cobrar mas de lo debido por no elegir la combinacion de paquetes mas barata, y que carrito, WhatsApp y servidor den totales distintos.
import { describe, it, expect } from 'vitest'
import { digitalPackPricing } from './packPricing'
import { digitalPackPricing as serverPricing } from '../functions/src/packPricing'
import { buildSnapshot, type CatalogPack } from '../functions/src/checkout'
import { reconcile, type CartLine } from './cartLogic'
import { buildWhatsAppMessage, whatsappFromCart } from './whatsappLogic'
import type { Product } from './types'

const pack = (quantity: number, price: number) => ({ id: `p${quantity}`, quantity, price })

/** Fuerza bruta: costo minimo probando todas las combinaciones (solo para cantidades chicas). */
function brute(n: number, packs: { quantity: number; price: number }[], unit: number): number {
  if (n === 0) return 0
  let best = Math.round(unit * 100) + brute(n - 1, packs, unit)
  for (const p of packs) if (p.quantity <= n) best = Math.min(best, Math.round(p.price * 100) + brute(n - p.quantity, packs, unit))
  return best
}

describe('digitalPackPricing', () => {
  it('elige la combinacion mas barata (7 fotos con paquetes 3/5/10 y suelta 3.00) y coincide con la fuerza bruta', () => {
    const packs = [pack(10, 20), pack(3, 7.5), pack(5, 11)]
    const r = digitalPackPricing(7, packs, 3)
    // 5 + 2 sueltas = 17.00; 3 + 3 + 1 = 18.00; 7 sueltas = 21.00. Un paquete de 10 nunca cubre 7.
    expect(r).toMatchObject({ packs: [{ pack: { quantity: 5 }, times: 1 }], singles: 2, totalCents: 1700, savingsCents: 400 })
    for (let n = 0; n <= 14; n++) {
      const x = digitalPackPricing(n, packs, 3)
      expect(x.totalCents).toBe(brute(n, packs, 3))
      const covered = x.singles + x.packs.reduce((s, u) => s + u.pack.quantity * u.times, 0)
      expect(covered).toBe(n)
    }
    // Sin paquetes (o con paquetes invalidos) todo es suelto.
    expect(digitalPackPricing(4, [pack(1, 1), { quantity: 2.5, price: 1 }, pack(2, 0)], 3)).toMatchObject({ packs: [], singles: 4, totalCents: 1200, savingsCents: 0 })
  })

  it('la copia del servidor da exactamente el mismo resultado que la del cliente', () => {
    let seed = 7
    const rnd = (m: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % m
    for (let t = 0; t < 300; t++) {
      const packs = Array.from({ length: rnd(4) }, () => pack(2 + rnd(9), (100 + rnd(3000)) / 100))
      const n = rnd(40)
      const unit = (50 + rnd(500)) / 100
      expect(serverPricing(n, packs, unit)).toEqual(digitalPackPricing(n, packs, unit))
    }
  })

  it('carrito, mensaje de WhatsApp y servidor dan el mismo total y el mismo desglose, por evento', () => {
    const products: Product[] = [
      { id: 'digital', name: 'Archivo digital', kind: 'digital', price: 3, active: true },
      { id: 'a4', name: 'A4', kind: 'print', price: 5, active: true },
      { id: 'p3', name: 'Paquete 3 fotos digitales', kind: 'pack', quantity: 3, price: 7.5, active: true },
      { id: 'p5', name: 'Paquete 5 fotos digitales', kind: 'pack', quantity: 5, price: 11, active: true },
    ]
    // e1: 7 digitales (5 + 2 sueltas = 17.00) + 2 A4; e2: 3 digitales (paquete 3 = 7.50). Juntas serian un paquete 5 + paquete 5.
    const digital = (eventId: string, n: number) => Array.from({ length: n }, (_, i): CartLine => ({ eventId, photoId: `f${i}`, productId: 'digital', priceAtAdd: 3, quantity: 1 }))
    const lines: CartLine[] = [...digital('e1', 7), { eventId: 'e1', photoId: 'f0', productId: 'a4', priceAtAdd: 5, quantity: 2 }, ...digital('e2', 3)]
    const view = reconcile(lines, products, {})
    expect(view.total).toBe(34.5)

    const byId = Object.fromEntries(products.map((p) => [p.id, p]))
    const snap = buildSnapshot({
      lines: lines.map(({ eventId, photoId, productId, quantity }) => ({ eventId, photoId, productId, quantity })),
      buyer: { name: 'A', email: 'a@b.co', phone: '1234567' }, deliveryInput: { method: 'retiro' }, settings: {},
      products: byId, publicPhotos: new Set(lines.map((l) => `${l.eventId}/${l.photoId}`)),
      packs: products.filter((p) => p.kind === 'pack') as CatalogPack[],
    })
    expect(snap.totalCents).toBe(3450)
    expect(snap.packs?.map((p) => [p.eventId, p.name, p.times])).toEqual(view.groups.flatMap((g) => g.pricing.packs.map((u) => [g.eventId, u.pack.name, u.times])))

    const msg = buildWhatsAppMessage(whatsappFromCart(view, (id) => id.toUpperCase(), (_, p) => p))
    expect(msg).toContain('• E1 – Paquete 5 fotos digitales × 1 – 11.00')
    expect(msg).toContain('• E1 – Fotos digitales sueltas × 2 – 6.00')
    expect(msg).toContain('• E2 – Paquete 3 fotos digitales × 1 – 7.50')
    expect(msg).toContain('• E1 – Foto f0 – Archivo digital × 1\n') // la foto en paquete va sin importe propio
    expect(msg).toContain('Total estimado: USD 34.50')
  })
})
