// Prevents: cobrar/mostrar un total equivocado por lineas duplicadas, cantidades invalidas, precios viejos o productos/fotos ya no vendibles.
import { describe, it, expect } from 'vitest'
import { addToCart, parseQuantity, parseStoredCart, reconcile, setLineQuantity, removeLine, cartCount, lineKey, type CartLine } from './cartLogic'
import type { Product } from './types'

const ref = { eventId: 'e1', photoId: 'p1', productId: 'a', priceAtAdd: 5 }
const prod = (id: string, price: number, kind: Product['kind'] = 'print'): Product => ({ id, name: id, kind, price, active: true })

describe('cartLogic', () => {
  it('CU1/CU2: agregar la misma foto+producto fusiona en una linea (2 + 1 = 3)', () => {
    const l = addToCart(addToCart([], ref, 2, 'print'), ref, 1, 'print')
    expect(l).toEqual([{ ...ref, quantity: 3 }])
    expect(cartCount(l)).toBe(3)
    expect(addToCart(l, ref, 99, 'print')[0].quantity).toBe(99)
  })
  it('CU3: digital siempre cantidad 1, aunque se agregue de nuevo o con cantidad mayor', () => {
    const d = { ...ref, productId: 'dig' }
    expect(addToCart(addToCart([], d, 5, 'digital'), d, 1, 'digital')).toEqual([{ ...d, quantity: 1 }])
    // almacenamiento manipulado: el subtotal tampoco multiplica lo digital
    const r = reconcile([{ ...d, quantity: 5 }], [prod('dig', 3, 'digital')], {})
    expect(r.lines[0].quantity).toBe(1)
    expect(r.total).toBe(3)
  })
  it.each([0, -1, 100, 1.5, NaN, 'abc', '', '2x', null])('CU10: cantidad %j se revierte a la anterior', (v) => {
    expect(parseQuantity(v, 4)).toBe(4)
    expect(setLineQuantity([{ ...ref, quantity: 4 }], lineKey(ref), v)[0].quantity).toBe(4)
  })
  it('CU4/CU5: cantidad valida (numero o texto) se aplica; quitar elimina la linea', () => {
    expect(parseQuantity('7', 1)).toBe(7)
    const l = setLineQuantity([{ ...ref, quantity: 1 }], lineKey(ref), 3)
    expect(reconcile(l, [prod('a', 5)], {}).total).toBe(15)
    expect(removeLine(l, lineKey(ref))).toEqual([])
  })
  it('CU7: precio cambiado -> aviso, usa el precio actual en el total', () => {
    const r = reconcile([{ ...ref, quantity: 2 }], [prod('a', 6)], {})
    expect(r.lines[0].status).toBe('priceChanged')
    expect(r.total).toBe(12)
  })
  it('CU8: producto desactivado o inexistente -> excluido del total', () => {
    const lines: CartLine[] = [{ ...ref, quantity: 2 }, { ...ref, productId: 'b', quantity: 1 }]
    const r = reconcile(lines, [prod('b', 3)], {})
    expect(r.lines[0].status).toBe('productUnavailable')
    expect(r.total).toBe(3)
  })
  it('CU9: foto no disponible -> excluida del total (prevalece sobre el producto)', () => {
    const r = reconcile([{ ...ref, quantity: 2 }], [prod('a', 5)], { 'e1/p1': 'unavailable' })
    expect(r.lines[0].status).toBe('photoUnavailable')
    expect(r.total).toBe(0)
  })
  it('CU6: almacenamiento corrupto o ajeno se ignora sin lanzar; lineas validas se conservan y duplicadas se fusionan', () => {
    expect(parseStoredCart(null)).toEqual([])
    expect(parseStoredCart('{no json')).toEqual([])
    expect(parseStoredCart('{"a":1}')).toEqual([])
    const good = { ...ref, quantity: 2 }
    const raw = JSON.stringify([good, { ...ref, quantity: 0 }, { ...ref, quantity: '2' }, null, 5, { eventId: 'x' }, good])
    expect(parseStoredCart(raw)).toEqual([{ ...ref, quantity: 4 }])
    // ids con barra harian ambigua la clave de linea
    expect(parseStoredCart(JSON.stringify([{ ...ref, photoId: 'a/b', quantity: 1 }, { ...ref, eventId: 'e1/p1', photoId: 'x', quantity: 1 }]))).toEqual([])
    expect(parseStoredCart(JSON.stringify([{ ...good, productName: '10x15' }]))[0].productName).toBe('10x15')
  })
})
