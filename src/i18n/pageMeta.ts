/** TASK-042 CU3: titulo y meta description de cada vista publica, en el idioma activo. El admin queda en espanol. */
import { ref, watchEffect } from 'vue'
import type { Router } from 'vue-router'
import { locale } from './index'
import { messagesFor, type Locale } from './messages'

/** La pagina de un evento pone aqui el nombre del evento (cargado async) para usarlo como titulo; null = titulo generico. */
export const eventTitle = ref<string | null>(null)

const KEY: Record<string, 'home' | 'event' | 'cart' | 'checkout' | 'downloads' | 'order' | 'notFound' | 'photographer'> = {
  home: 'home', event: 'event', 'event-photo': 'event', cart: 'cart', checkout: 'checkout', downloads: 'downloads', order: 'order', 'not-found': 'notFound', photographer: 'photographer',
}
export const ADMIN_TITLE = 'Administración | Martial Photo'
export const isAdminRoute = (name: unknown): boolean => typeof name === 'string' && name.startsWith('admin')

/** null = ruta sin metadatos propios (admin: se maneja aparte). */
export function pageMeta(routeName: unknown, lang: Locale, eventName?: string | null): { title: string; description: string } | null {
  const k = typeof routeName === 'string' ? KEY[routeName] : undefined
  if (!k) return null
  const m = messagesFor(lang).meta
  const meta = m[k]
  return k === 'event' && eventName ? { title: m.eventNamed(eventName), description: meta.description } : meta
}

function setDescription(content: string | null) {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (content === null) { el?.remove(); return }
  if (!el) { el = document.createElement('meta'); el.name = 'description'; document.head.appendChild(el) }
  el.content = content
}

/** Mantiene <title>, la meta description y <html lang> al dia con la ruta y el idioma. En /admin siempre espanol. */
export function installPageMeta(router: Router): void {
  watchEffect(() => {
    const route = router.currentRoute.value
    if (isAdminRoute(route.name)) {
      document.documentElement.lang = 'es'
      document.title = ADMIN_TITLE
      setDescription(null)
      return
    }
    document.documentElement.lang = locale.value
    const meta = pageMeta(route.name, locale.value, eventTitle.value)
    if (!meta) return
    document.title = meta.title
    setDescription(meta.description)
  })
}
