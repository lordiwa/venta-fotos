// Prevents: guardar precios/costos invalidos (vacio, 0, negativo, texto) que romperian el total de un pedido.
import { describe, it, expect, vi } from 'vitest'
import { offeredProducts, hasPrintOffer, packFields, validatePackForm, PACK_DUPLICATE_ERROR, PACK_QUANTITY_ERROR, withOfflineNotice, SHIPPING_ERROR, PERMISSION_MESSAGE, NETWORK_MESSAGE, saveErrorMessage, settingsToForm, sortByName, parseMoney, validateProductForm, validateSettingsForm, productFields, settingsFields, PRICE_ERROR, NAME_ERROR } from './productsLogic'

describe('productsLogic', () => {
  it('CU1/CU2: precio valido se normaliza (coma o punto)', () => {
    expect(productFields({ name: ' 10x15 ', price: '5.00' })).toEqual({ name: '10x15', price: 5 })
    expect(parseMoney('6,5')).toBe(6.5)
  })
  it.each(['', '0', '0.00', '-1', 'abc', '1e3', '5.555'])('CU4: precio %j rechazado', (price) => {
    expect(validateProductForm({ name: 'x', price }).price).toBe(PRICE_ERROR)
  })
  it('CU5: nombre vacio rechazado; el digital no lo exige', () => {
    expect(validateProductForm({ name: '  ', price: '1' }).name).toBe(NAME_ERROR)
    expect(validateProductForm({ name: '', price: '3.00' }, { requireName: false })).toEqual({})
  })
  it('CU7: envio 0 aceptado, negativo y no numerico rechazados', () => {
    expect(validateSettingsForm({ shippingCost: '0', pickupInfo: '' })).toEqual({})
    expect(settingsFields({ shippingCost: '4.50', pickupInfo: ' Estudio ' })).toEqual({ shippingCost: 4.5, pickupInfo: 'Estudio' })
    expect(validateSettingsForm({ shippingCost: '-1', pickupInfo: '' }).shippingCost).toBe(SHIPPING_ERROR)
    expect(validateSettingsForm({ shippingCost: 'x', pickupInfo: '' }).shippingCost).toBe(SHIPPING_ERROR)
    expect(validateSettingsForm({ shippingCost: '', pickupInfo: '' }).shippingCost).toBe(SHIPPING_ERROR)
  })

  // Prevents: pagina de ajustes rota ("no se pudo cargar") o falso error de red cuando settings/store esta incompleto.
  it('settingsToForm tolera documentos incompletos', () => {
    expect(settingsToForm(null)).toEqual({ shippingCost: '', pickupInfo: '', whatsappPhone: '' })
    expect(settingsToForm({ watermarkText: 'X' } as never)).toEqual({ shippingCost: '', pickupInfo: '', whatsappPhone: '' })
    expect(settingsToForm({ shippingCost: 3 })).toEqual({ shippingCost: '3.00', pickupInfo: '', whatsappPhone: '' })
    expect(settingsToForm({ shippingCost: 0, pickupInfo: 'a' })).toEqual({ shippingCost: '0.00', pickupInfo: 'a', whatsappPhone: '' })
  })
  // Prevents: decirle al admin "revisa tu conexion" cuando en realidad su sesion/permiso fallo.
  it('saveErrorMessage distingue permission-denied de red', () => {
    expect(saveErrorMessage({ code: 'permission-denied' })).toBe(PERMISSION_MESSAGE)
    expect(saveErrorMessage(new Error('x'))).toBe(NETWORK_MESSAGE)
  })
  // Prevents: lista de tamanos desordenada ("20x25" antes que "9x13").
  it('sortByName ordena numericamente', () => {
    expect(sortByName([{ name: '20x25' }, { name: '9x13' }, { name: '10x15' }]).map((p) => p.name)).toEqual(['9x13', '10x15', '20x25'])
  })

  // Prevents: boton en "Guardando..." para siempre sin aviso cuando Firestore encola la escritura sin red.
  describe('withOfflineNotice', () => {
    it('lento: avisa una vez y, al resolver, devuelve el valor; rapido: no avisa; rechazo: propaga', async () => {
      vi.useFakeTimers()
      try {
        const onSlow = vi.fn()
        let done!: (v: string) => void
        const slow = withOfflineNotice(new Promise<string>((r) => (done = r)), onSlow, 6000)
        vi.advanceTimersByTime(5999)
        expect(onSlow).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onSlow).toHaveBeenCalledTimes(1)
        done('ok')
        await expect(slow).resolves.toBe('ok')

        const fast = vi.fn()
        await withOfflineNotice(Promise.resolve(1), fast, 6000)
        vi.advanceTimersByTime(10000)
        expect(fast).not.toHaveBeenCalled()

        const rej = vi.fn()
        await expect(withOfflineNotice(Promise.reject(new Error('boom')), rej, 6000)).rejects.toThrow('boom')
        vi.advanceTimersByTime(10000)
        expect(rej).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })
  // Previene: vender el archivo digital de una foto "solo impresion" desde el lightbox, o elegir un paquete como si fuera un producto por foto.
  it('TASK-030: una foto printOnly solo ofrece impresiones; los paquetes nunca se ofrecen por foto', () => {
    const xs = [{ id: 'a4', kind: 'print' }, { id: 'digital', kind: 'digital' }, { id: 'p5', kind: 'pack' }]
    expect(offeredProducts(xs, false).map((p) => p.id)).toEqual(['a4', 'digital'])
    expect(offeredProducts(xs, true).map((p) => p.id)).toEqual(['a4'])
    expect(offeredProducts([{ id: 'digital', kind: 'digital' }], true)).toEqual([])
  })
  // Daño: mostrar la explicacion fine art sin impresiones a la venta, u ocultarla cuando si las hay.
  it('TASK-040: hasPrintOffer es true solo si hay alguna impresion', () => {
    expect(hasPrintOffer([{ kind: 'digital' }, { kind: 'print' }])).toBe(true)
    expect(hasPrintOffer([{ kind: 'digital' }])).toBe(false)
    expect(hasPrintOffer([{ kind: 'pack' }])).toBe(false)
    expect(hasPrintOffer([])).toBe(false)
  })
  // Previene: guardar paquetes de 1 foto, fraccionarios o gratis, o dos paquetes de la misma cantidad que vuelven ambiguo el desglose.
  it('TASK-029: paquete con cantidad entera 2..100 sin repetir y precio > 0; el nombre sale de la cantidad', () => {
    expect(validatePackForm({ quantity: '5', price: '12' })).toEqual({})
    for (const q of ['1', '2.5', '', 'cinco', '101']) expect(validatePackForm({ quantity: q, price: '12' }).quantity).toBe(PACK_QUANTITY_ERROR)
    expect(validatePackForm({ quantity: '5', price: '12' }, [3, 5]).quantity).toBe(PACK_DUPLICATE_ERROR)
    expect(validatePackForm({ quantity: '5', price: '0' }).price).toBe(PRICE_ERROR)
    expect(packFields({ quantity: ' 5 ', price: '12,5' })).toEqual({ name: 'Paquete 5 fotos digitales', quantity: 5, price: 12.5 })
  })
})
