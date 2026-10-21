// Prevents: que un pedido por WhatsApp llegue a un numero equivocado, con el texto mal codificado o con lineas no vendibles.
import { describe, it, expect } from 'vitest'
import { settingsToForm } from './productsLogic'
import { buildWhatsAppMessage, DEFAULT_WHATSAPP_PHONE, normalizePhone, phoneToStore, resolveWhatsappDigits, validateWhatsappPhone, whatsappLinkAttrs, whatsappUrl } from './whatsappLogic'

describe('whatsappLogic', () => {
  it('normalizePhone: acepta +, espacios y guiones y devuelve solo digitos (8 a 15); rechaza letras y largos fuera de rango', () => {
    // Daño: guardar un numero invalido que rompe el enlace wa.me para todos los compradores.
    expect(normalizePhone('+593 99-856 5995')).toBe('593998565995')
    expect(normalizePhone('12345678')).toBe('12345678')
    expect(normalizePhone('1234567')).toBeNull()
    expect(normalizePhone('1234567890123456')).toBeNull()
    expect(normalizePhone('+593abc98565995')).toBeNull()
    expect(normalizePhone('59+3998565995')).toBeNull()
    expect(validateWhatsappPhone('')).toBeNull()
    expect(validateWhatsappPhone('hola')).not.toBeNull()
    expect(phoneToStore('593 99 856 5995')).toBe('+593998565995')
  })
  it('normalizePhone: rechaza numeros que empiezan en 0 (locales sin codigo de pais)', () => {
    // Daño: guardar "0998565995" genera wa.me/0998565995, un enlace invalido que deja a todos los compradores sin contacto.
    for (const n of ['0998565995', '00593998565995', '+0998565995', '0 99-856 5995']) {
      expect(normalizePhone(n)).toBeNull()
      expect(validateWhatsappPhone(n)).not.toBeNull()
    }
  })
  it('valores no-string (p. ej. numero escrito a mano en la consola) cuentan como vacio y no lanzan', () => {
    // Daño: un TypeError en el submit bloquea el guardado de toda la Configuracion.
    const def = DEFAULT_WHATSAPP_PHONE.replace('+', '')
    expect(validateWhatsappPhone(null)).toBeNull()
    expect(() => validateWhatsappPhone(593998565995)).not.toThrow()
    expect(phoneToStore(undefined)).toBe('')
    expect(resolveWhatsappDigits(null)).toBe(def)
    expect(settingsToForm({ whatsappPhone: 593998565995 }).whatsappPhone).toBe('593998565995')
  })
  it('resolveWhatsappDigits: vacio, ausente o invalido usan el numero por defecto', () => {
    // Daño: carrito sin numero de contacto si el documento settings/store no tiene el campo.
    const def = DEFAULT_WHATSAPP_PHONE.replace('+', '')
    expect([resolveWhatsappDigits(undefined), resolveWhatsappDigits(''), resolveWhatsappDigits('x')]).toEqual([def, def, def])
    expect(resolveWhatsappDigits('+34 600 111 222')).toBe('34600111222')
  })
  it('buildWhatsAppMessage: una linea por producto con subtotal y el total estimado; sin red no hay precios ni total', () => {
    // Daño: mandar al fotografo un pedido ambiguo (sin evento/foto/cantidad) o con precios inventados.
    const m = buildWhatsAppMessage({
      lines: [
        { event: 'Boda', photo: 'img1.jpg', product: '15x21', quantity: 2, subtotal: 10 },
        { event: 'Boda', photo: 'img2.jpg', product: 'Archivo digital', quantity: 1, subtotal: 3 },
      ],
      total: 13,
    })
    expect(m).toContain('• Boda – Foto img1.jpg – 15x21 × 2 – 10.00')
    expect(m).toContain('• Boda – Foto img2.jpg – Archivo digital × 1 – 3.00')
    expect(m.endsWith('Total estimado: USD 13.00')).toBe(true)
    const off = buildWhatsAppMessage({ lines: [{ photo: 'p1', product: '15x21', quantity: 2 }] })
    expect(off).toContain('• Foto p1 – 15x21 × 2')
    expect(off).not.toContain('Total')
  })
  it('whatsappUrl: numero solo con digitos y texto codificado (saltos, tildes, & y #)', () => {
    // Daño: un "&" o "#" en el nombre del evento corta el mensaje; un "+" en la ruta rompe wa.me.
    const u = whatsappUrl('593998565995', 'Fiesta & más #1\nok')
    expect(u.startsWith('https://wa.me/593998565995?text=')).toBe(true)
    expect(u).not.toContain('wa.me/+')
    expect(u.split('?text=')[1]).not.toMatch(/[ \n&#]/)
    expect(decodeURIComponent(u.split('?text=')[1])).toBe('Fiesta & más #1\nok')
  })
  it('whatsappLinkAttrs: en movil misma pestaña sin target; en escritorio o sin window, pestaña nueva con noopener', () => {
    // Daño: abrir wa.me en pestaña nueva en el celular muestra "Descargar WhatsApp" en vez del chat con el pedido.
    const blank = { target: '_blank', rel: 'noopener' }
    expect(whatsappLinkAttrs({ coarsePointer: true, noHover: true, userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toEqual({})
    expect(whatsappLinkAttrs({ coarsePointer: false, noHover: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toEqual({})
    expect(whatsappLinkAttrs({ coarsePointer: true, noHover: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toEqual({}) // iPad "modo escritorio"
    expect(whatsappLinkAttrs({ coarsePointer: false, noHover: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toEqual(blank)
    expect(whatsappLinkAttrs({ coarsePointer: true, noHover: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual(blank) // laptop tactil con mouse
    expect(whatsappLinkAttrs(undefined)).toEqual(blank)
  })
})
