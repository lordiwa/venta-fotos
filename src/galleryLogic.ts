/** Logica pura de la galeria publica (TASK-015). Orden de fotos: createdAt ascendente (orden de subida), desempate por id de documento. */
export const PAGE_SIZE = 30
export const SWIPE_THRESHOLD = 50

export interface PhotoNav {
  index: number
  prevId: string | null
  nextId: string | null
  /** El siguiente no esta cargado todavia pero hay mas paginas: hay que pedirla antes de poder avanzar. */
  needsMore: boolean
  found: boolean
}

/** Anterior/siguiente segun el orden de la cuadricula, incluso al cruzar el limite de una pagina cargada. */
export function photoNav(ids: string[], photoId: string, hasMore: boolean): PhotoNav {
  const index = ids.indexOf(photoId)
  if (index < 0) return { index, prevId: null, nextId: null, needsMore: hasMore, found: false }
  const last = index === ids.length - 1
  return { index, prevId: ids[index - 1] ?? null, nextId: ids[index + 1] ?? null, needsMore: last && hasMore, found: true }
}

/** Deslizar horizontal: ignora gestos cortos o mas verticales que horizontales (scroll). Izquierda = siguiente. */
export function swipeDirection(dx: number, dy: number): 'next' | 'prev' | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return null
  return dx < 0 ? 'next' : 'prev'
}

export const eventPath = (eventId: string) => `/eventos/${encodeURIComponent(eventId)}`
export const photoPath = (eventId: string, photoId: string) => `${eventPath(eventId)}/fotos/${encodeURIComponent(photoId)}`

/** Estado de la pagina de evento: un evento ausente/no publicado es "unavailable"; publicado sin fotos listas es "empty". */
export function galleryState(s: { loading: boolean; eventFound: boolean; photoCount: number }): 'loading' | 'unavailable' | 'empty' | 'ready' {
  if (s.loading) return 'loading'
  if (!s.eventFound) return 'unavailable'
  return s.photoCount === 0 ? 'empty' : 'ready'
}
