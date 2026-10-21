// Prevents: cobrar mas de lo debido por no elegir la combinacion de paquetes mas barata, y que la copia del servidor se desvie de la del cliente.
import { describe, it, expect } from 'vitest'
import { digitalPackPricing } from './packPricing'
import { digitalPackPricing as serverPricing } from '../functions/src/packPricing'

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
})
