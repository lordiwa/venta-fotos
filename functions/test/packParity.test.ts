// Previene: que carrito, mensaje de WhatsApp y servidor den totales o desgloses de paquetes distintos (TASK-029).
// Vive en functions/test porque importa checkout.ts (node): vue-tsc compila los tests de src/ sin tipos de node.
import { describe, it, expect } from 'vitest'
import { buildSnapshot, type CatalogPack } from '../src/checkout'
import { reconcile, type CartLine } from '../../src/cartLogic'
import { buildWhatsAppMessage, whatsappFromCart } from '../../src/whatsappLogic'
import type { Product } from '../../src/types'

describe('paquetes digitales: carrito = WhatsApp = servidor', () => {
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
