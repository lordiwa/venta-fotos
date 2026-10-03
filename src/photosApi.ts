import { collection, deleteDoc, deleteField, doc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from './firebase'
import type { UploadItem } from './uploadLogic'

export const newPhotoId = (eventId: string) => doc(collection(db, 'events', eventId, 'photos')).id

/**
 * Sube el original a la ruta PRIVADA originals/{eventId}/{photoId}.{ext}. El documento photo lo crea la Function
 * al recibirlo (status 'processing' -> 'ready' | 'error').
 */
export function uploadOriginal(eventId: string, item: UploadItem & { file: File }, onProgress: (fraction: number) => void) {
  const ext = item.file.type === 'image/png' ? 'png' : 'jpg'
  const task = uploadBytesResumable(ref(storage, `originals/${eventId}/${item.photoId}.${ext}`), item.file, {
    contentType: item.file.type,
    customMetadata: { originalName: item.file.name },
  })
  return new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
  })
}

export const setPhotoVisible = (eventId: string, photoId: string, visible: boolean) =>
  updateDoc(doc(db, 'events', eventId, 'photos', photoId), { visible })

/** Borra el documento; la Function cleanupPhotoFiles elimina original, vista previa y miniatura. Si era la portada, la limpia. */
export async function deletePhoto(eventId: string, photoId: string, wasCover: boolean) {
  await deleteDoc(doc(db, 'events', eventId, 'photos', photoId))
  if (wasCover) await updateDoc(doc(db, 'events', eventId), { coverPhotoId: deleteField() })
}

/** Solo para miniaturas/previews (rutas publicas). Nunca se usa con originalPath (CU9). */
export const publicUrl = (path: string) => getDownloadURL(ref(storage, path))
