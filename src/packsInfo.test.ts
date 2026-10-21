import { describe, expect, it } from 'vitest'
import { packsInfo } from './packsInfo'

const digital = { id: 'digital', kind: 'digital', price: 5, active: true }
const pack = (quantity: number, price: number, active = true) => ({ id: `p${quantity}-${price}`, kind: 'pack', quantity, price, active })
const print = { id: 'x', kind: 'print', price: 8, active: true }
const qs = (xs: Parameters<typeof packsInfo>[0]) => packsInfo(xs)?.packs.map((r) => `${r.quantity}@${r.price}`)

describe('packsInfo (TASK-034)', () => {
  // Evita mostrar ahorros mal calculados o paquetes desordenados al comprador.
  it('calcula el ahorro frente a sueltas y ordena por cantidad', () => {
    expect(packsInfo([pack(5, 20), print, digital, pack(3, 12)])).toEqual({
      unitPrice: 5,
      packs: [{ quantity: 3, price: 12, savings: 3 }, { quantity: 5, price: 20, savings: 5 }],
    })
  })

  // Evita anunciar paquetes que el carrito no va a aplicar.
  it('sin paquetes activos, o sin digital activo, no hay bloque; los paquetes inactivos o sin ahorro se ignoran', () => {
    expect(packsInfo([digital, print])).toBeNull()
    expect(packsInfo([digital, pack(3, 12, false)])).toBeNull()
    expect(packsInfo([digital, pack(3, 15)])).toBeNull()
    expect(packsInfo([{ ...digital, active: false }, pack(3, 12)])).toBeNull()
    expect(packsInfo([pack(3, 12)])).toBeNull()
    expect(qs([digital, pack(3, 12, false), pack(5, 20)])).toEqual(['5@20'])
  })

  // Evita que el texto prometa un paquete distinto del que cobra el carrito (dominado, repetido o fuera de rango).
  it('solo muestra los paquetes que el carrito usaria: sin dominados, sin cantidades repetidas ni mayores a 100', () => {
    expect(qs([digital, pack(3, 12), pack(6, 25)])).toEqual(['3@12'])
    expect(qs([digital, pack(3, 13), pack(3, 12)])).toEqual(['3@12'])
    expect(qs([digital, pack(3, 12), pack(101, 100)])).toEqual(['3@12'])
  })

  // Evita ahorros con basura de coma flotante ("0.9700000000000006").
  it('redondea el ahorro a centavos', () => {
    expect(packsInfo([{ ...digital, price: 1.99 }, pack(3, 5)])?.packs[0].savings).toBe(0.97)
  })
})
