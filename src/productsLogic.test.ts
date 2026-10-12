// Prevents: guardar precios/costos invalidos (vacio, 0, negativo, texto) que romperian el total de un pedido.
import { describe, it, expect } from 'vitest'
import { parseMoney, validateProductForm, validateSettingsForm, productFields, settingsFields, PRICE_ERROR, NAME_ERROR } from './productsLogic'

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
    expect(validateSettingsForm({ shippingCost: '-1', pickupInfo: '' }).shippingCost).toBeTruthy()
    expect(validateSettingsForm({ shippingCost: 'x', pickupInfo: '' }).shippingCost).toBeTruthy()
    expect(validateSettingsForm({ shippingCost: '', pickupInfo: '' }).shippingCost).toBeTruthy()
  })
})
