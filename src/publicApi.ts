import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import type { Event, Photo } from './types'
import { PAGE_SIZE } from './galleryLogic'

/** Consultas publicas: DEBEN filtrar como exigen las reglas (published; visible + status ready) o se deniegan. */
export interface PublicEvent extends Event { coverThumbPath?: string }

export async function listPublishedEvents(): Promise<PublicEvent[]> {
  const snap = await getDocs(query(collection(db, 'events'), where('published', '==', true), orderBy('date', 'desc')))
  return Promise.all(snap.docs.map(async (d) => {
    const ev = { id: d.id, ...d.data() } as PublicEvent
    if (ev.coverPhotoId) {
      try { // portada ausente/oculta/no lista -> sin portada (placeholder), no rompe la lista
        const p = await getDoc(doc(db, 'events', d.id, 'photos', ev.coverPhotoId))
        if (p.exists() && p.data().thumbPath) ev.coverThumbPath = p.data().thumbPath
      } catch { /* sin portada */ }
    }
    return ev
  }))
}

/** null si no existe o no esta publicado (permission-denied de las reglas tambien cuenta como no disponible). */
export async function getPublishedEvent(id: string): Promise<Event | null> {
  try {
    const s = await getDoc(doc(db, 'events', id))
    return s.exists() && s.data().published === true ? ({ id: s.id, ...s.data() } as Event) : null
  } catch (e) {
    // Solo "denegado" (evento no publicado) y "no existe" cuentan como no disponible; red u otros errores se propagan.
    const code = (e as { code?: string }).code
    if (code === 'permission-denied' || code === 'not-found') return null
    throw e
  }
}

export type PhotoCursor = QueryDocumentSnapshot | null

/** Pagina de fotos visibles y listas, por orden de subida (createdAt, luego id). */
export async function fetchPhotosPage(eventId: string, cursor: PhotoCursor) {
  const base = [where('visible', '==', true), where('status', '==', 'ready'), orderBy('createdAt'), orderBy('__name__')]
  const q = query(collection(db, 'events', eventId, 'photos'), ...base, ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE))
  const snap = await getDocs(q)
  return {
    photos: snap.docs.map((d) => ({ id: d.id, eventId, ...d.data() }) as Photo),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : cursor,
    hasMore: snap.docs.length === PAGE_SIZE,
  }
}
