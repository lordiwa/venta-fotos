/**
 * TASK-042: idioma de la tienda publica. Sin libreria: un `locale` reactivo, deteccion por navegador, recuerdo en localStorage
 * (con try/catch: el almacenamiento puede estar bloqueado) y `<html lang>`. El admin no lo usa.
 */
import { computed, ref } from 'vue'
import { isLocale, messagesFor, type Locale } from './messages'

export { LOCALES, messagesFor, type Locale, type Messages } from './messages'
export const LOCALE_KEY = 'venta-fotos:locale'

/** Lo guardado gana; sin eleccion previa, un navegador en ingles ("en", "en-US"…) abre en ingles y todo lo demas en espanol. */
export function detectLocale(navigatorLanguage: string | null | undefined, stored: string | null | undefined): Locale {
  if (isLocale(stored)) return stored
  return /^en(?:[-_]|$)/i.test((navigatorLanguage ?? '').trim()) ? 'en' : 'es'
}

/** null si no hay nada guardado, lo guardado es invalido o el almacenamiento falla (entonces se vuelve a detectar). */
export function readStoredLocale(storage?: Pick<Storage, 'getItem'>): Locale | null {
  try {
    const v = (storage ?? localStorage).getItem(LOCALE_KEY)
    return isLocale(v) ? v : null
  } catch { return null }
}

export function writeStoredLocale(locale: Locale, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? localStorage).setItem(LOCALE_KEY, locale) } catch { /* sin almacenamiento: la eleccion vale solo en esta visita */ }
}

const initial = (): Locale => detectLocale(typeof navigator === 'undefined' ? undefined : navigator.language, readStoredLocale())

export const locale = ref<Locale>(initial())
const applyHtmlLang = (l: Locale) => { if (typeof document !== 'undefined') document.documentElement.lang = l }
applyHtmlLang(locale.value)

export function setLocale(next: Locale): void {
  if (!isLocale(next)) return
  locale.value = next
  writeStoredLocale(next)
  applyHtmlLang(next)
}

const messages = computed(() => messagesFor(locale.value))

/** `t` es un computed: en plantillas se usa `t.cart.title`; en script, `t.value.cart.title`. */
export function useI18n() {
  return { t: messages, locale, setLocale }
}
