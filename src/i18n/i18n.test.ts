// Previene: que la tienda en ingles quede incompleta, que el idioma elegido se pierda o rompa la pagina, o que el admin cambie de idioma (TASK-042).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DICTIONARIES } from './messages'
import { detectLocale, LOCALE_KEY, readStoredLocale, setLocale, locale, writeStoredLocale } from './index'
import { formatDeadline, formatMoney, productLabel } from './format'
import { ADMIN_TITLE, isAdminRoute, pageMeta } from './pageMeta'
import { downloadErrorMessage, downloadNotice, orderErrorMessage, statusErrorMessage } from '../serverErrors'

/** Todas las hojas del diccionario: "a.b.c" o "a.b[2].c" -> tipo ('string' | 'function' | 'null'); las listas aportan ademas su largo. */
function leaves(v: unknown, path = ''): Record<string, string> {
  if (typeof v === 'function') return { [path]: 'function' }
  if (Array.isArray(v)) return Object.assign({}, ...v.map((x, i) => leaves(x, `${path}[${i}]`)), { [`${path}.length`]: String(v.length) })
  if (v && typeof v === 'object') return Object.assign({}, ...Object.entries(v).map(([k, x]) => leaves(x, path ? `${path}.${k}` : k)))
  return { [path]: v === null ? 'null' : 'string' }
}

const brokenStorage = {
  getItem: () => { throw new DOMException('denied', 'SecurityError') },
  setItem: () => { throw new DOMException('denied', 'SecurityError') },
}

describe('i18n', () => {
  afterEach(() => { vi.unstubAllGlobals(); setLocale('es') })

  // Daño: un visitante de habla inglesa abre la tienda en espanol (o al reves) y se va; una eleccion guardada ignorada.
  it('CU1 detectLocale: lo guardado manda; sin eleccion, "en*" abre en ingles y lo demas en espanol', () => {
    expect(detectLocale('en-US', null)).toBe('en')
    expect(detectLocale('EN', null)).toBe('en')
    expect(detectLocale('es-EC', null)).toBe('es')
    expect(detectLocale('fr-FR', null)).toBe('es')
    expect(detectLocale('entzia', null)).toBe('es') // "en" como prefijo de otra lengua no cuenta
    expect(detectLocale(undefined, null)).toBe('es')
    expect(detectLocale('en-US', 'es')).toBe('es')
    expect(detectLocale('es-EC', 'en')).toBe('en')
    expect(detectLocale('es-EC', 'de')).toBe('es') // valor guardado invalido: se vuelve a detectar
  })

  // Daño: con el almacenamiento bloqueado (modo privado, cookies off) la tienda lanza un error y deja la pantalla en blanco.
  it('CU1 almacenamiento roto: leer devuelve null (se vuelve a detectar), escribir no lanza y setLocale actualiza <html lang>', () => {
    expect(readStoredLocale(brokenStorage)).toBeNull()
    expect(() => writeStoredLocale('en', brokenStorage)).not.toThrow()
    expect(readStoredLocale({ getItem: () => 'xx' })).toBeNull()
    expect(readStoredLocale({ getItem: (k: string) => (k === LOCALE_KEY ? 'en' : null) })).toBe('en')
    const doc = { documentElement: { lang: 'es' } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('localStorage', brokenStorage)
    expect(() => setLocale('en')).not.toThrow()
    expect(locale.value).toBe('en')
    expect(doc.documentElement.lang).toBe('en')
  })

  // Daño: una clave que existe en un idioma y no en el otro muestra "undefined" o un hueco en la tienda.
  it('CU9 paridad ES/EN: mismas claves, mismo tipo de valor, mismos largos de lista y ningun texto vacio', () => {
    const es = leaves(DICTIONARIES.es)
    const en = leaves(DICTIONARIES.en)
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
    for (const k of Object.keys(es)) expect(en[k], k).toBe(es[k])
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string') expect(v.trim(), path).not.toBe('')
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`))
    }
    walk(DICTIONARIES.en, 'en')
    expect(Object.keys(es).length).toBeGreaterThan(100)
  })

  // Daño: texto en espanol colado en el ingles por copiar/pegar sin traducir (los nombres propios de organizaciones no se traducen).
  it('CU3/CU4 el ingles no lleva acentos ni signos del espanol fuera de nombres propios', () => {
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string') {
        if (path.startsWith('lang.') || /^photographer\.(experience|education)\[\d]\.(org|title)$/.test(path)) return
        expect(v.replace(/Sebastián Rodríguez/g, ''), path).not.toMatch(/[áéíóúñ¿¡]/i) // nombre propio
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k))
    }
    walk(DICTIONARIES.en, '')
    // Los textos largos no pueden ser identicos al espanol (se olvidaron de traducir).
    const es = leaves(DICTIONARIES.es)
    const text = (v: unknown, p: string, out: Record<string, string>) => {
      if (typeof v === 'string') out[p] = v
      else if (Array.isArray(v)) v.forEach((x, i) => text(x, `${p}[${i}]`, out))
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => text(x, p ? `${p}.${k}` : k, out))
      return out
    }
    const a = text(DICTIONARIES.es, '', {}), b = text(DICTIONARIES.en, '', {})
    for (const [k, v] of Object.entries(a)) if (v.length > 30 && !/\.org$/.test(k)) expect(b[k], k).not.toBe(v)
    expect(Object.keys(es).length).toBeGreaterThan(100)
  })

  // Daño: precios con formato de otro idioma en los mensajes de WhatsApp o en el carrito; el admin cambia de formato por accidente.
  it('CU5 formatos: espanol igual que siempre ("10.00"), ingles con miles ("1,250.00"), hora de Ecuador en los dos', () => {
    expect(formatMoney(10)).toBe('10.00')
    expect(formatMoney(1250, 'es')).toBe('1250.00')
    expect(formatMoney(1250, 'en')).toBe('1,250.00')
    const ms = Date.UTC(2026, 9, 22, 20, 30) // 15:30 en Ecuador
    expect(formatDeadline(ms, 'es')).toMatch(/22 de octubre, 03:30\sp\.\s?m\./)
    expect(formatDeadline(ms, 'en')).toMatch(/Thursday, October 22.*03:30\sPM/)
  })

  // Daño: el nombre del producto del sistema queda en espanol en el ingles, o un producto cargado por el admin se "traduce" mal.
  it('productLabel: traduce solo "Archivo digital" y "Paquete N fotos digitales"; el resto tal cual', () => {
    const en = DICTIONARIES.en
    expect(productLabel('Archivo digital', en, 'en')).toBe('Digital file')
    expect(productLabel('Paquete 5 fotos digitales', en, 'en')).toBe('Pack of 5 digital photos')
    expect(productLabel('20x30 Fine art', en, 'en')).toBe('20x30 Fine art')
    expect(productLabel('Archivo digital', DICTIONARIES.es, 'es')).toBe('Archivo digital')
  })

  // Daño: en ingles el comprador ve el texto crudo en espanol del servidor (CU7); en espanol cambia lo que ya funcionaba.
  it('CU7 errores del servidor: por codigo en ingles, texto de la Function en espanol, generico si es de red', () => {
    const rate = { code: 'functions/resource-exhausted', message: 'Hiciste muchos pedidos seguidos. Espera unos minutos o escríbenos por WhatsApp.' }
    const empty = { code: 'functions/invalid-argument', message: 'El carrito está vacío.' }
    const gone = { code: 'functions/not-found', message: 'No encontramos ese pedido.' }
    expect(orderErrorMessage(rate, 'es')).toBe(rate.message)
    expect(orderErrorMessage(rate, 'en')).toMatch(/several orders in a row/)
    for (const e of [rate, empty, gone, { code: 'functions/failed-precondition', message: 'Una foto del carrito solo se vende impresa.' }, { code: 'functions/internal' }, new Error('boom')]) {
      expect(orderErrorMessage(e, 'en'), JSON.stringify(e)).not.toMatch(/[áéíóúñ¿¡]|\b(pedido|carrito|foto|intent)/i)
    }
    expect(orderErrorMessage(empty, 'en')).toMatch(/isn’t valid/)
    expect(orderErrorMessage({ code: 'functions/unavailable', message: 'x' }, 'es')).toMatch(/^No pudimos registrar tu pedido/)
    expect(downloadErrorMessage({ code: 'functions/not-found', message: 'No encontramos un pedido con esos datos [404]' }, 'es')).toBe('No encontramos un pedido con esos datos')
    expect(downloadErrorMessage({ code: 'functions/not-found', message: 'No encontramos un pedido con esos datos' }, 'en')).toBe('We couldn’t find an order with those details.')
    expect(statusErrorMessage({ code: 'functions/resource-exhausted' }, 'en')).toBe('Too many attempts. Please try again later.')
    expect(downloadNotice('Algunas fotos ya no están disponibles. Contáctanos.', 'en')).toBe('Some photos are no longer available. Please contact us.')
    expect(downloadNotice('Mensaje nuevo del servidor', 'en')).not.toMatch(/servidor/)
    expect(downloadNotice('Este pedido no incluye archivos digitales.', 'es')).toBe('Este pedido no incluye archivos digitales.')
  })

  // Daño: el panel de administracion hereda el titulo de la tienda en ingles (CU8); una vista publica sin titulo/descripcion (CU3).
  it('CU3/CU8 pageMeta: cada vista publica tiene titulo y descripcion en los dos idiomas; el admin es siempre espanol', () => {
    for (const name of ['home', 'event', 'event-photo', 'cart', 'checkout', 'downloads', 'order', 'not-found', 'photographer']) {
      for (const lang of ['es', 'en'] as const) {
        const m = pageMeta(name, lang)
        expect(m?.title, `${name} ${lang}`).toMatch(/Martial Photo/)
        expect(m?.description.length, `${name} ${lang}`).toBeGreaterThan(20)
      }
    }
    expect(pageMeta('photographer', 'en')?.title).toBe('Mauricio Reinoso · Photographer in Quito | Martial Photo')
    expect(pageMeta('event', 'en', 'Quito Run 2026')?.title).toBe('Quito Run 2026 | Martial Photo') // el nombre del evento no se traduce
    expect(pageMeta('admin-orders', 'en')).toBeNull()
    expect(isAdminRoute('admin-not-found') && isAdminRoute('admin-login') && !isAdminRoute('not-found')).toBe(true)
    expect(ADMIN_TITLE).toMatch(/^Administración/)
  })
})
