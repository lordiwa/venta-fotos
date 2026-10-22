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
/** Un gesto cambia de foto solo con un dedo y sin la pagina ampliada (pinch-zoom): ahi el dedo mueve la imagen. */
export function swipeAction(dx: number, dy: number, g: { multi: boolean; scale?: number }): 'next' | 'prev' | null {
  if (g.multi || (g.scale ?? 1) > 1.01) return null
  return swipeDirection(dx, dy)
}

export const eventPath = (eventId: string) => `/eventos/${encodeURIComponent(eventId)}`
export const photoPath = (eventId: string, photoId: string) => `${eventPath(eventId)}/fotos/${encodeURIComponent(photoId)}`

/** TASK-041: texto de la etiqueta que marca en la galeria y el visor las fotos que solo se venden impresas. */
export const PRINT_ONLY_LABEL = 'Solo impresión'
/** TASK-041: solo con printOnly === true (undefined o false = foto normal). */
export const isPrintOnly = (photo: { printOnly?: boolean } | null | undefined): boolean => photo?.printOnly === true

/** Estado de la pagina de evento: un evento ausente/no publicado es "unavailable"; publicado sin fotos listas es "empty". */
export function galleryState(s: { loading: boolean; error?: boolean; eventFound: boolean; photoCount: number }): 'loading' | 'error' | 'unavailable' | 'empty' | 'ready' {
  if (s.loading) return 'loading'
  if (s.error) return 'error' // fallo de carga (red, etc.): nunca se confunde con "sin fotos" ni "no disponible"
  if (!s.eventFound) return 'unavailable'
  return s.photoCount === 0 ? 'empty' : 'ready'
}
