/** Logica pura de la subida en lote (sin Firebase): validacion de archivos y cola con reintento individual. */

export const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png']

export function validateFile(f: { name: string; type: string; size: number }): string | null {
  if (!ALLOWED.includes(f.type)) return `"${f.name}": solo se aceptan imágenes JPEG o PNG.`
  if (f.size > MAX_BYTES) return `"${f.name}": supera el máximo de 50 MB.`
  if (f.size === 0) return `"${f.name}": el archivo está vacío.`
  return null
}

export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed' | 'rejected'

export interface UploadItem {
  key: number
  file: { name: string; type: string; size: number }
  /** Id de la foto = nombre del original en Storage; se conserva al reintentar para sobrescribir el mismo archivo. */
  photoId: string
  status: UploadStatus
  progress: number
  error?: string
}

/** Marca los fallidos como pendientes; los ya subidos y los rechazados no se tocan. */
export function requeueFailed(items: UploadItem[]) {
  for (const it of items) if (it.status === 'failed') Object.assign(it, { status: 'queued', progress: 0, error: undefined })
}

/**
 * Sube los items 'queued' con concurrencia limitada. Un fallo marca solo ese item como 'failed' y los demas siguen.
 * Es seguro llamarla de nuevo despues de requeueFailed: solo procesa lo pendiente.
 */
export async function runQueue(
  items: UploadItem[],
  upload: (item: UploadItem, onProgress: (fraction: number) => void) => Promise<void>,
  concurrency = 3,
) {
  const pending = items.filter((i) => i.status === 'queued')
  const worker = async () => {
    for (let it = pending.shift(); it; it = pending.shift()) {
      it.status = 'uploading'
      try {
        await upload(it, (p) => (it.progress = p))
        it.progress = 1
        it.status = 'uploaded'
      } catch (e) {
        it.status = 'failed'
        it.error = `No se pudo subir "${it.file.name}"${e instanceof Error && e.message ? `: ${e.message}` : ''}. Puedes reintentar.`
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
}
