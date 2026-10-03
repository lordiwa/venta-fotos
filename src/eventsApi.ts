import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, orderBy, query, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Event } from './types'
import { deleteEventGuarded, editableFields, newEventData, type EventForm } from './eventsLogic'

const toEvent = (id: string, d: Record<string, unknown>) => ({ id, ...d }) as Event
const stamp = <T extends { date: Date }>(f: T) => ({ ...f, date: Timestamp.fromDate(f.date) })

export async function listEvents(): Promise<(Event & { photoCount: number })[]> {
  const snap = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')))
  // photoCount se cuenta al listar (CU3): sin campo desnormalizado que mantener ni que pueda desincronizarse.
  return Promise.all(
    snap.docs.map(async (d) => ({
      ...toEvent(d.id, d.data()),
      photoCount: (await getCountFromServer(collection(db, 'events', d.id, 'photos'))).data().count,
    })),
  )
}

export async function getEvent(id: string): Promise<Event | null> {
  const s = await getDoc(doc(db, 'events', id))
  return s.exists() ? toEvent(s.id, s.data()) : null
}

export async function createEvent(f: EventForm): Promise<string> {
  return (await addDoc(collection(db, 'events'), stamp(newEventData(f)))).id
}

export const updateEvent = (id: string, f: EventForm) => updateDoc(doc(db, 'events', id), stamp(editableFields(f)))
export const setPublished = (id: string, published: boolean) => updateDoc(doc(db, 'events', id), { published })
export const setCover = (id: string, photoId: string) => updateDoc(doc(db, 'events', id), { coverPhotoId: photoId })

export function deleteEvent(id: string) {
  return deleteEventGuarded(id, {
    // Pedidos: orders.eventIds (array) -> array-contains. Solo el admin puede consultarlo (reglas).
    countOrders: async (eventId) =>
      (await getCountFromServer(query(collection(db, 'orders'), where('eventIds', 'array-contains', eventId)))).data().count,
    // Se borran los documentos de fotos; la Function de TASK-013 limpia los archivos de Storage al verlos desaparecer.
    deletePhotos: async (eventId) => {
      const docs = (await getDocs(collection(db, 'events', eventId, 'photos'))).docs
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db)
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    },
    deleteEvent: (eventId) => deleteDoc(doc(db, 'events', eventId)),
  })
}
