import { describe, it, expect } from 'vitest'
import { paymentMode } from './paymentMode'

describe('paymentMode', () => {
  // Daño: mostrar "Ir a pagar" (callejon sin salida) cuando PayPal no esta configurado, o esconderlo cuando si lo esta.
  it('solo un client id no vacio activa paypal', () => {
    for (const v of [undefined, null, '', '   ', 42]) expect(paymentMode(v)).toBe('whatsapp')
    expect(paymentMode('AbC123')).toBe('paypal')
  })
})
