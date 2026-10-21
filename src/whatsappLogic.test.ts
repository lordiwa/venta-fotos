// Prevents: que un pedido por WhatsApp llegue a un numero equivocado, con el texto mal codificado o con lineas no vendibles.
import { describe, it, expect } from 'vitest'
import { settingsToForm } from './productsLogic'
import {
  buildWhatsAppMessage, customerPayload, DEFAULT_WHATSAPP_PHONE, normalizePhone, orderLink, parseStoredCustomer, phoneToStore, reminderMessage, resolveWhatsappDigits,
  validateCustomer, validateWhatsappPhone, whatsappLinkAttrs, whatsappOrderMessage, whatsappUrl,
} from './whatsappLogic'

describe('whatsappLogic', () => {
  it('normalizePhone: acepta +, espacios y guiones y devuelve solo digitos (8 a 15); rechaza letras y largos fuera de rango', () => {
    // Daño: guardar un numero invalido que rompe el enlace wa.me para todos los compradores.
    expect(normalizePhone('+593 99-856 5995')).toBe('593998565995')
    // M-1 (TASK-037): un 0 de discado nacional tras el 593 se quita; si no, wa.me abre un numero inexistente.
    expect(normalizePhone('+593 099 856 5995')).toBe('593998565995')
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

  // Previene: crear un pedido sin un WhatsApp donde recordarle el pago, o un pedido digital sin el correo con el que se descarga.
  it('TASK-037 CU1: nombre y WhatsApp con codigo de pais obligatorios; correo solo con digitales (y solo entonces viaja)', () => {
    const f = { name: ' Ana ', phone: '+593 99 856 5995', email: '' }
    expect(validateCustomer(f, false)).toEqual({})
    expect(validateCustomer(f, true)).toEqual({ email: 'Escribe tu correo: con él descargas tus fotos digitales.' })
    expect(Object.keys(validateCustomer({ name: '', phone: '099 856 5995', email: 'x' }, true)).sort()).toEqual(['email', 'name', 'phone'])
    expect(validateCustomer({ ...f, email: 'viejo-invalido' }, false)).toEqual({}) // oculto sin digitales: no bloquea
    expect(customerPayload({ ...f, email: 'a@b.co' }, false)).toEqual({ name: 'Ana', phone: '593998565995' })
    expect(customerPayload({ ...f, email: 'a@b.co' }, true)).toEqual({ name: 'Ana', phone: '593998565995', email: 'a@b.co' })
    expect(parseStoredCustomer('{roto')).toEqual({ name: '', phone: '+593 ', email: '' })
  })

  // Previene: un mensaje cuyo total no cuadra con el del servidor, sin numero de pedido o sin el link para seguirlo.
  it('TASK-037 CU1/CU6: mensaje del pedido y recordatorio con numero, total del servidor, hora limite y link', () => {
    const expiresAt = Date.UTC(2026, 9, 22, 20, 30) // 15:30 en Ecuador (UTC-5)
    const link = orderLink('https://fotos.example/', 'ABCD2345')
    expect(link).toBe('https://fotos.example/pedido/ABCD2345')
    const lines = [
      { eventId: 'e1', photoId: 'p1', productName: 'Digital', unitPrice: 10, quantity: 1 },
      { eventId: 'e1', photoId: 'p2', productName: 'Digital', unitPrice: 10, quantity: 1 },
      { eventId: 'e1', photoId: 'p3', productName: 'A4', unitPrice: 2.5, quantity: 2 },
    ]
    const msg = whatsappOrderMessage(
      { number: 'ABCD2345', total: 20, savings: 5, expiresAt, lines, packs: [{ eventId: 'e1', name: 'Paquete 2', times: 1, price: 15 }] },
      { name: 'Ana', link, eventName: () => 'Carrera', photoName: (_e, p) => p },
    )
    expect(msg).toContain('pedido ABCD2345')
    expect(msg).toContain('Total: USD 20.00')
    expect(msg).toContain('Ahorro por paquetes: −5.00')
    expect(msg).toMatch(/Pago hasta: jueves, 22 de octubre, 03:30\sp\.\s?m\./)
    expect(msg).toContain(`Mi pedido: ${link}`)
    const rem = reminderMessage({ name: 'Ana Pérez', number: 'ABCD2345', total: 20, expiresAt, link })
    expect(rem).toMatch(/^Hola Ana, te recordamos tu pedido ABCD2345 por USD 20\.00/)
    expect(rem).toMatch(/22 de octubre, 03:30\sp\.\s?m\./)
    expect(rem).toContain(link)
  })
})
