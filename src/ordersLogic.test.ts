// Prevents: despachar mal los pedidos (saltar estados, imprimir lo digital, mezclar filtros) y que la copia del servidor se desvie de la del cliente.
import { describe, it, expect } from 'vitest'
import { filterOrders, nextStatus, printList, type OrderRow } from './ordersLogic'
import { nextStatus as serverNext, planAdvance } from '../functions/src/orderStatus'
import type { OrderStatus } from './types'

const line = (productId: string, quantity = 1, photoId = 'p1', eventId = 'e1') => ({ eventId, photoId, productId, productName: productId.toUpperCase(), unitPrice: 5, quantity })
const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o', number: 'N', status: 'pagado', delivery: { method: 'retiro' }, lines: [line('a4')], eventIds: ['e1'], total: 5,
  buyer: { name: 'A', email: 'a@b.co' }, createdAt: null, ...over,
})
const envio = { method: 'envio' as const, address: 'x', cost: 1 }

describe('ordersLogic', () => {
  it('CU4: avanza solo al siguiente estado; retiro -> listo_retiro, envio -> enviado; entregado es final', () => {
    expect(nextStatus(order())).toBe('impreso')
    expect(nextStatus(order({ status: 'impreso' }))).toBe('listo_retiro')
    expect(nextStatus(order({ status: 'impreso', delivery: envio }))).toBe('enviado')
    expect(nextStatus(order({ status: 'listo_retiro' }))).toBe('entregado')
    expect(nextStatus(order({ status: 'enviado' }))).toBe('entregado')
    expect(nextStatus(order({ status: 'entregado' }))).toBeNull()
  })
  it('CU5: un pedido solo digital pasa de pagado directo a entregado', () => {
    expect(nextStatus(order({ lines: [line('digital')] }))).toBe('entregado')
    expect(nextStatus(order({ lines: [line('digital'), line('a4')] }))).toBe('impreso')
  })
  it('CU2: los filtros por evento, estado y entrega se combinan', () => {
    const os = [order({ id: '1' }), order({ id: '2', eventIds: ['e2'] }), order({ id: '3', status: 'impreso', delivery: envio })]
    expect(filterOrders(os, { eventId: '', status: '', method: '' })).toHaveLength(3)
    expect(filterOrders(os, { eventId: 'e1', status: '', method: '' }).map((o) => o.id)).toEqual(['1', '3'])
    expect(filterOrders(os, { eventId: 'e1', status: 'impreso', method: 'envio' }).map((o) => o.id)).toEqual(['3'])
    expect(filterOrders(os, { eventId: 'e2', status: 'impreso', method: '' })).toEqual([])
  })
  it('CU6/CU7: la lista de impresion agrupa por tamano, suma copias por foto y excluye digital y pedidos que no estan en pagado', () => {
    const os = [
      order({ id: '1', lines: [line('a4', 2, 'p1'), line('digital', 1, 'p1'), line('a5', 1, 'p2')] }),
      order({ id: '2', lines: [line('a4', 3, 'p1'), line('a4', 1, 'p9')] }),
      order({ id: '3', status: 'impreso', lines: [line('a4', 50)] }),
      order({ id: '4', lines: [line('digital')] }),
    ]
    const list = printList(os)
    expect(list.map((g) => [g.productId, g.total])).toEqual([['a4', 6], ['a5', 1]])
    expect(list[0].photos).toEqual([{ eventId: 'e1', photoId: 'p1', quantity: 5 }, { eventId: 'e1', photoId: 'p9', quantity: 1 }])
  })
  // Prevents: que la Function permita un salto que la pantalla no ofrece (o al reves).
  it('CU4/CU8: la maquina del servidor coincide con la del cliente y planAdvance rechaza estados viejos', () => {
    const statuses: OrderStatus[] = ['pagado', 'impreso', 'listo_retiro', 'enviado', 'entregado']
    for (const status of statuses) for (const delivery of [{ method: 'retiro' as const }, envio])
      for (const lines of [[line('a4')], [line('digital')]]) {
        const o = order({ status, delivery, lines })
        expect(serverNext(o)).toBe(nextStatus(o))
      }
    expect(planAdvance(order(), 'pagado')).toBe('impreso')
    expect(() => planAdvance(order({ status: 'impreso' }), 'pagado')).toThrow() // doble clic / pantalla vieja
    expect(() => planAdvance(order({ status: 'entregado' }), 'entregado')).toThrow()
  })
})
