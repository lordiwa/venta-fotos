import { describe, it, expect } from 'vitest'
import { EDUCATION, PORTFOLIO, PORTRAIT, QUOTE_MESSAGE, contactLinks, displayPhone, mobileRows, photoSources } from './photographerLogic'
import { resolveWhatsappDigits } from './whatsappLogic'

// Archivos reales en public/fotografo (lo que sirve el hosting).
const files = new Set(Object.keys(import.meta.glob('../public/fotografo/*.webp')).map((k) => k.replace('../public', '')))

describe('photographerLogic', () => {
  // Daño: "Cotizar una sesión" abre otro numero que el de la tienda, un chat vacio o un Instagram/correo equivocado (CU4/CU5).
  it('contactLinks: WhatsApp de la tienda con el mensaje ya escrito, correo e Instagram exactos', () => {
    const l = contactLinks(resolveWhatsappDigits(null))
    expect(l.quote).toBe(`https://wa.me/593998565995?text=${encodeURIComponent(QUOTE_MESSAGE)}`)
    expect(decodeURIComponent(l.quote.split('text=')[1])).toContain('cotizar una sesión')
    expect(l.whatsapp.startsWith('https://wa.me/593998565995?text=')).toBe(true)
    expect(l.whatsappLabel).toBe('+593 99 856 5995')
    expect(l.email.startsWith('mailto:gulmork@gmail.com')).toBe(true)
    expect(l.instagram).toBe('https://instagram.com/mau_bujin')
    expect(contactLinks(resolveWhatsappDigits('+1 555 123 4567')).quote.startsWith('https://wa.me/15551234567?text=')).toBe(true)
    expect(displayPhone('15551234567')).toBe('+15551234567')
  })

  // Daño: una foto del portafolio sin archivo en public/ (cuadro roto en hosting) o un srcset que apunta a un tamaño inexistente (CU3).
  it('photoSources: cada foto del portafolio y el retrato existen en public/fotografo', () => {
    const photos = [PORTRAIT, ...PORTFOLIO.flatMap((c) => c.photos)]
    for (const p of photos) {
      const s = photoSources(p)
      for (const url of [s.src, s.full, ...(s.srcset?.split(', ').map((x) => x.split(' ')[0]) ?? [])]) expect(files.has(url), url).toBe(true)
      expect(p.alt.length).toBeGreaterThan(10)
    }
    expect(PORTFOLIO.map((c) => c.name)).toEqual(['Paisaje', 'Deportes', 'Retrato', 'Publicidad', 'Eventos sociales', 'Mascotas'])
    expect(EDUCATION[0]).toMatchObject({ when: '2025', org: expect.stringContaining('New York Institute of Photography') })
  })

  // Daño: en movil una horizontal queda achicada al lado de otra foto, una vertical queda sola a media pantalla, o 4+ verticales se apretan en una fila.
  it('mobileRows: horizontales solas, verticales de a dos y la que sobra sola', () => {
    const v = { width: 4, height: 5 }, h = { width: 3, height: 2 }, sq = { width: 1, height: 1 }
    expect(mobileRows([h, h])).toEqual([[0], [1]])
    expect(mobileRows([v, v, h])).toEqual([[0, 1], [2]])
    expect(mobileRows([v, v, sq])).toEqual([[0, 1], [2]])
    expect(mobileRows([v, h, v])).toEqual([[0], [1], [2]])
    expect(mobileRows([v, v, v, v, v])).toEqual([[0, 1], [2, 3], [4]])
  })
})
