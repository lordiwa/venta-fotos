/** TASK-042: los dos diccionarios y el tipo de idioma, sin Vue (los usa la logica pura: WhatsApp, validaciones, errores). */
import { en, type Messages } from './en'
import { es } from './es'

export type Locale = 'es' | 'en'
export type { Messages }
export const LOCALES: Locale[] = ['es', 'en']
export const DICTIONARIES: Record<Locale, Messages> = { es, en }
export const isLocale = (v: unknown): v is Locale => v === 'es' || v === 'en'
/** Idioma desconocido o ausente = espanol (el admin y el codigo anterior a TASK-042 nunca pasan idioma). */
export const messagesFor = (lang: Locale = 'es'): Messages => DICTIONARIES[isLocale(lang) ? lang : 'es']
