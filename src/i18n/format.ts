/** TASK-042: montos y fechas segun el idioma. Siempre USD y hora de Ecuador, en cualquier idioma. */
import type { Locale, Messages } from './messages'

export const STORE_TIME_ZONE = 'America/Guayaquil'
const INTL: Record<Locale, string> = { es: 'es-EC', en: 'en-US' }

const moneyEn = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Espanol: "10.00" como siempre (igual que el admin). Ingles: "1,250.00". Sin simbolo: la moneda (USD) se rotula aparte. */
export const formatMoney = (n: number, lang: Locale = 'es'): string => (lang === 'en' ? moneyEn.format(n) : n.toFixed(2))

/** Fecha de un evento ("22 de octubre de 2026" / "October 22, 2026"), en la zona de la tienda. */
export const formatDate = (d: Date | number, lang: Locale = 'es'): string =>
  new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: STORE_TIME_ZONE })

/** Fecha corta (vencimiento de un enlace de descarga). */
export const formatShortDate = (d: Date | number, lang: Locale = 'es'): string =>
  new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'es', { timeZone: STORE_TIME_ZONE })

/** Hora limite de pago, en la hora de la tienda. */
export const formatDeadline = (ms: number, lang: Locale = 'es', timeZone = STORE_TIME_ZONE): string =>
  new Date(ms).toLocaleString(INTL[lang], { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const PACK_NAME_ES = /^Paquete (\d+) fotos digitales$/
/**
 * Nombre de un producto del sistema en el idioma activo. Los nombres vienen guardados en espanol; solo se traducen los dos
 * que crea la propia tienda ("Archivo digital" y "Paquete N fotos digitales"). Cualquier otro nombre se muestra tal como lo cargo el admin.
 */
export function productLabel(name: string, m: Messages, lang: Locale): string {
  if (lang === 'es') return name
  if (name === 'Archivo digital') return m.product.digital
  const pack = PACK_NAME_ES.exec(name)
  return pack ? m.product.pack(Number(pack[1])) : name
}
