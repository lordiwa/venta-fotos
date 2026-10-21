import { describe, expect, it } from 'vitest'
import { packsInfo } from './packsInfo'

const digital = { id: 'digital', kind: 'digital', price: 5, active: true }
const pack = (quantity: number, price: number, active = true) => ({ id: `p${quantity}-${price}`, kind: 'pack', quantity, price, active })
const print = { id: 'x', kind: 'print', price: 8, active: true }

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
    expect(packsInfo([digital, pack(3, 12, false), pack(5, 20)])?.packs.map((r) => r.quantity)).toEqual([5])
  })
})
