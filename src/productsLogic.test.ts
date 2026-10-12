// Prevents: guardar precios/costos invalidos (vacio, 0, negativo, texto) que romperian el total de un pedido.
import { describe, it, expect } from 'vitest'
import { SHIPPING_ERROR, PERMISSION_MESSAGE, NETWORK_MESSAGE, saveErrorMessage, settingsToForm, sortByName, parseMoney, validateProductForm, validateSettingsForm, productFields, settingsFields, PRICE_ERROR, NAME_ERROR } from './productsLogic'

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
    expect(settingsToForm(null)).toEqual({ shippingCost: '', pickupInfo: '' })
    expect(settingsToForm({ watermarkText: 'X' } as never)).toEqual({ shippingCost: '', pickupInfo: '' })
    expect(settingsToForm({ shippingCost: 3 })).toEqual({ shippingCost: '3.00', pickupInfo: '' })
    expect(settingsToForm({ shippingCost: 0, pickupInfo: 'a' })).toEqual({ shippingCost: '0.00', pickupInfo: 'a' })
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
})
