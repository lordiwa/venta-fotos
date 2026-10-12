import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { DownloadResult } from './downloadsLogic'

/** Enlaces nuevos al original de las fotos digitales de un pedido (numero + correo del comprador). */
export async function getDownloadLinks(number: string, email: string): Promise<DownloadResult> {
  return (await httpsCallable<unknown, DownloadResult>(functions, 'getDownloadLinks')({ number, email })).data
}

/** Mensaje para el comprador: el de la Function (no encontrado, demasiados intentos) o uno generico si fue red/interno. */
export function downloadErrorMessage(e: unknown): string {
  const x = e as { code?: string; message?: string }
  return x.code && !['functions/internal', 'functions/unavailable', 'functions/unknown'].includes(x.code) && x.message
    ? x.message
    : 'No pudimos generar los enlaces. Intenta de nuevo.'
}
