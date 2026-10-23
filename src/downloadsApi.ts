import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { DownloadResult } from './downloadsLogic'

/** Enlaces nuevos al original de las fotos digitales de un pedido (numero + correo del comprador). */
export async function getDownloadLinks(number: string, email: string): Promise<DownloadResult> {
  return (await httpsCallable<unknown, DownloadResult>(functions, 'getDownloadLinks')({ number, email })).data
}
