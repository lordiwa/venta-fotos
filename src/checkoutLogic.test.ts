// Prevents: dejar pasar un checkout sin contacto/direccion validos, mostrar un total sin envio, o mandar al servidor precios/nombres del cliente.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyCaptureError, loadSummary, saveSummary, toOrderLines, totalWithShipping, validateCheckoutForm, type CheckoutForm } from './checkoutLogic'

const ok: CheckoutForm = { name: 'Ana', email: 'a@b.co', phone: '123 4567', method: 'retiro', address: '' }

describe('checkoutLogic', () => {
  it('CU2: mensaje por campo para nombre vacio, correo mal formado y telefono con < 7 digitos', () => {
    expect(validateCheckoutForm(ok, true)).toEqual({})
    expect(Object.keys(validateCheckoutForm({ ...ok, name: ' ', email: 'a@b', phone: '12345-6' }, true)).sort()).toEqual(['email', 'name', 'phone'])
  })
  it('CU4: la direccion solo se exige con envio y carrito con impresiones', () => {
    expect(validateCheckoutForm({ ...ok, method: 'envio' }, true).address).toBeTruthy()
    expect(validateCheckoutForm({ ...ok, method: 'envio', address: 'Calle 1' }, true)).toEqual({})
    expect(validateCheckoutForm({ ...ok, method: 'envio' }, false)).toEqual({})
  })
  it('CU3/CU4: el total suma el envio solo con envio e impresiones, sin error de punto flotante', () => {
    expect(totalWithShipping(0.3, 'retiro', true, 4.5)).toBe(0.3)
    expect(totalWithShipping(0.1 + 0.2, 'envio', true, 4.5)).toBe(4.8)
    expect(totalWithShipping(10, 'envio', false, 4.5)).toBe(10)
  })
  it('CU7: al servidor solo van ids y cantidad', () => {
    const l = { eventId: 'e', photoId: 'p', productId: 'a', quantity: 2, priceAtAdd: 0.01, productName: 'Gratis' }
    expect(toOrderLines([l])).toEqual([{ eventId: 'e', photoId: 'p', productId: 'a', quantity: 2 }])
  })
  describe('resumen del pedido (sessionStorage)', () => {
    afterEach(() => vi.unstubAllGlobals())
    it('CU5: ida y vuelta; sin resumen o corrupto devuelve null', () => {
      const m = new Map<string, string>()
      vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) })
      const s = { number: 'ABCD2345', lines: [{ productName: 'A4', unitPrice: 5, quantity: 1 }], total: 5, delivery: { method: 'retiro' as const } }
      saveSummary(s)
      expect(loadSummary('ABCD2345')).toEqual(s)
      expect(loadSummary('OTRO')).toBeNull()
      m.set('venta-fotos:order:BAD', '{no json')
      expect(loadSummary('BAD')).toBeNull()
    })
  })
  // Prevents: reintentar o volver a cobrar cuando el dinero ya se tomo (final), o crear otra orden tras un corte de red (retry).
  it('R-1: clasifica fallos de captura en final / retry / definitive', () => {
    expect(classifyCaptureError({ code: 'functions/failed-precondition', details: { final: true } })).toBe('final')
    expect(classifyCaptureError({ code: 'functions/internal' })).toBe('retry')
    expect(classifyCaptureError(new TypeError('Failed to fetch'))).toBe('retry')
    expect(classifyCaptureError({ code: 'functions/failed-precondition' })).toBe('definitive')
  })
})
