/** TASK-042: montos y fechas segun el idioma. Siempre USD y hora de Ecuador, en cualquier idioma. */
import { DIGITAL_NAME, packName } from '../productsLogic'
import type { Locale, Messages } from './messages'

export const STORE_TIME_ZONE = 'America/Guayaquil'
const INTL: Record<Locale, string> = { es: 'es-EC', en: 'en-US' }

/**
 * Fecha de un evento ("22 de octubre de 2026" / "October 22, 2026"). Es una fecha sin hora (el admin guarda la medianoche local
 * de su navegador), asi que se muestra en la zona del navegador: convertirla a otra zona cambiaria el dia. `timeZone` solo se usa en pruebas.
 */
export const formatDate = (d: Date | number, lang: Locale = 'es', timeZone?: string): string =>
  new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) })

/** Fecha corta de un instante (vencimiento de un enlace de descarga), en la hora de la tienda. */
export const formatShortDate = (d: Date | number, lang: Locale = 'es'): string =>
  new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'es', { timeZone: STORE_TIME_ZONE })

/** Hora limite de pago, en la hora de la tienda. */
export const formatDeadline = (ms: number, lang: Locale = 'es', timeZone = STORE_TIME_ZONE): string =>
  new Date(ms).toLocaleString(INTL[lang], { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: lang === 'en' ? 'numeric' : '2-digit', minute: '2-digit' })

/**
 * Nombre de un producto del sistema en el idioma activo. Los nombres vienen guardados en espanol; solo se traducen los dos
 * que crea la propia tienda ("Archivo digital" y "Paquete N fotos digitales"). Cualquier otro nombre se muestra tal como lo cargo el admin.
 */
export function productLabel(name: string, m: Messages, lang: Locale): string {
  if (lang === 'es') return name
  if (name === DIGITAL_NAME) return m.product.digital
  const n = Number(/\d+/.exec(name)?.[0])
  return n && packName(n) === name ? m.product.pack(n) : name
}
