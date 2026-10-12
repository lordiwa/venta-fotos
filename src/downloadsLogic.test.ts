// Prevents: ofrecer un enlace ya vencido como si sirviera, o no ofrecer descargas a pedidos que si traen digital.
import { describe, it, expect } from 'vitest'
import { hasDigital, isExpired, normalizeNumber } from './downloadsLogic'

describe('downloadsLogic', () => {
  it('CU3: el enlace vence exactamente en expiresAt', () => {
    expect(isExpired(1000, 999)).toBe(false)
    expect(isExpired(1000, 1000)).toBe(true)
  })
  it('CU1: solo los pedidos con linea digital piden enlaces', () => {
    expect(hasDigital([{ productId: 'a4' }, { productId: 'digital' }])).toBe(true)
    expect(hasDigital([{ productId: 'a4' }, {}])).toBe(false)
  })
  it('CU4: el numero se normaliza (espacios, minusculas)', () => {
    expect(normalizeNumber(' abcd2345 ')).toBe('ABCD2345')
  })
})
