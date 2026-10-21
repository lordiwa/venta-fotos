// Prevents: despachar mal los pedidos (saltar estados, imprimir lo digital, mezclar filtros) y que la copia del servidor se desvie de la del cliente.
import { describe, it, expect } from 'vitest'
import {
  allowedTransitions, canRemind, downloadName, filterOrders, needsReminder, nextStatus, orderTab, packSavings, printList, REMINDER_AFTER_MS, searchOrders, STATUSES, timeLeftText,
  type OrderRow,
} from './ordersLogic'
import { allowedTransitions as serverAllowed, isAdmin, nextStatus as serverNext, planAdvance } from '../functions/src/orderStatus'
import { isPaidStatus } from '../functions/src/downloadsLogic'
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
  // Prevents: que un comprador anonimo o una cuenta sin claim cambie estados de pedidos (p.ej. marcar "entregado" un pedido ajeno).
  it('CU8: solo admin === true booleano autoriza advanceOrder', () => {
    expect(isAdmin({ token: { admin: true } })).toBe(true)
    for (const auth of [undefined, null, {}, { token: {} }, { token: { admin: 'true' } }, { token: { admin: 1 } }, { token: { admin: false } }]) expect(isAdmin(auth)).toBe(false)
  })
  // Prevents: descargar un original sin extension (el SO no lo abre) o con caracteres que rompen el nombre.
  it('downloadName agrega .jpg si falta la extension y limpia caracteres invalidos', () => {
    expect(downloadName('e1', 'IMG_1.png')).toBe('e1-IMG_1.png')
    expect(downloadName('e1', 'p1')).toBe('e1-p1.jpg')
    expect(downloadName('e1', 'a/b:c')).toBe('e1-a_b_c.jpg')
  })
  // Previene: un recibo o un detalle de admin cuyas lineas no cuadran con el total cuando hubo paquetes (M-1, TASK-029).
  it('TASK-029: ahorro por paquetes = lineas + envio - total; sin packs (pedidos anteriores) es 0', () => {
    const pk = { eventId: 'e1', productId: 'pk2', name: 'Paquete 2 fotos digitales', quantity: 2, price: 15, times: 1 }
    const lines = [line('digital', 1, 'p1'), line('digital', 1, 'p2')].map((l) => ({ ...l, unitPrice: 10 }))
    expect(packSavings(order({ lines, total: 16, delivery: envio, packs: [pk] }))).toBe(5)
    expect(packSavings(order({ lines, total: 20 }))).toBe(0)
  })
  // Previene: saltarse el cobro (pendiente -> entregado), cancelar algo entregado o que el admin "anule" a mano; y que cliente y servidor difieran.
  it('TASK-037 CU4: WhatsApp pendiente_pago -> pagado -> en_preparacion -> entregado; cancelar solo pendiente/pagado; igual en el servidor', () => {
    const wa = (status: OrderStatus) => order({ status, channel: 'whatsapp', delivery: undefined })
    expect(allowedTransitions(wa('pendiente_pago'))).toEqual(['pagado', 'cancelado'])
    expect(allowedTransitions(wa('pagado'))).toEqual(['en_preparacion', 'cancelado'])
    expect(allowedTransitions(wa('en_preparacion'))).toEqual(['entregado'])
    for (const s of ['entregado', 'cancelado', 'anulado'] as const) expect(allowedTransitions(wa(s))).toEqual([])
    for (const s of STATUSES) for (const o of [wa(s), order({ status: s })]) expect(serverAllowed(o)).toEqual(allowedTransitions(o))
    expect(planAdvance(wa('pendiente_pago'), 'pendiente_pago', 'cancelado')).toBe('cancelado')
    expect(() => planAdvance(wa('pendiente_pago'), 'pendiente_pago', 'entregado')).toThrow()
    expect(() => planAdvance(wa('pendiente_pago'), 'pendiente_pago', 'anulado')).toThrow()
    expect(() => planAdvance(wa('anulado'), 'pendiente_pago', 'pagado')).toThrow() // la anulacion gano
    expect(() => planAdvance(order(), 'pagado', 'cancelado')).toThrow() // PayPal no se cancela desde aqui
  })
  // Previene: dar descargas o imprimir copias de un pedido que nadie pago (o que se cancelo/anulo).
  it('TASK-037 CU5: solo pagado y posteriores dan descargas y entran a la lista de impresion', () => {
    const wa = (status: OrderStatus) => order({ id: status, status, channel: 'whatsapp', delivery: undefined, lines: [line('a4', 2)] })
    expect(printList([wa('pendiente_pago'), wa('cancelado'), wa('anulado'), wa('entregado')])).toEqual([])
    expect(printList([wa('pagado'), wa('en_preparacion')]).map((g) => g.total)).toEqual([4])
    for (const s of ['pendiente_pago', 'cancelado', 'anulado']) expect(isPaidStatus(s)).toBe(false)
    for (const s of ['pagado', 'en_preparacion', 'entregado']) expect(isPaidStatus(s)).toBe(true)
  })
  // Previene: perder de vista un pedido por cobrar (o mezclarlo con los cerrados) y no poder encontrarlo por nombre o numero.
  it('TASK-037 CU8: Activos/Historial y busqueda por numero o nombre sin tildes ni mayusculas', () => {
    expect((['pendiente_pago', 'pagado', 'en_preparacion'] as const).map(orderTab)).toEqual(['activos', 'activos', 'activos'])
    expect((['entregado', 'cancelado', 'anulado'] as const).map(orderTab)).toEqual(['historial', 'historial', 'historial'])
    const os = [order({ id: '1', number: 'ABCD2345', buyer: { name: 'José Pérez' } }), order({ id: '2', number: 'ZZZZ9999', buyer: { name: 'Ana' } })]
    expect(searchOrders(os, 'jose').map((o) => o.id)).toEqual(['1'])
    expect(searchOrders(os, ' zzz').map((o) => o.id)).toEqual(['2'])
    expect(searchOrders(os, '')).toHaveLength(2)
  })
  // Previene: recordar antes de tiempo, dos veces o un pedido ya pagado, o mostrar un plazo distinto al que anula el servidor.
  it('TASK-037 CU3/CU6: "recordar pago" desde las 12 h (la paridad con el plazo del servidor esta en functions/test/whatsappOrder.test.ts) y sin recordatorio enviado; tiempo restante', () => {
    const p = order({ status: 'pendiente_pago', channel: 'whatsapp', createdAt: new Date(0), expiresAt: new Date(2 * REMINDER_AFTER_MS) })
    expect(needsReminder(p, REMINDER_AFTER_MS - 1)).toBe(false)
    expect(needsReminder(p, REMINDER_AFTER_MS)).toBe(true)
    expect(needsReminder({ ...p, reminderSentAt: new Date(1) }, REMINDER_AFTER_MS)).toBe(false)
    expect(needsReminder({ ...p, status: 'pagado' }, REMINDER_AFTER_MS)).toBe(false)
    // L-2: pasada la hora limite ya no se marca ni se ofrece el boton (el servidor tambien lo rechaza).
    expect(needsReminder(p, 2 * REMINDER_AFTER_MS)).toBe(false)
    expect([canRemind(p, 2 * REMINDER_AFTER_MS - 1), canRemind(p, 2 * REMINDER_AFTER_MS)]).toEqual([true, false])
    expect(timeLeftText(new Date(2 * REMINDER_AFTER_MS), REMINDER_AFTER_MS + 20 * 60000)).toBe('Quedan 11 h 40 min para pagar')
    expect(timeLeftText(new Date(1000), 1000)).toMatch(/^Vencido/)
  })
})
