/** Logica pura de descargas (TASK-019): vencimiento de enlaces y seleccion de lineas digitales. */
import { DIGITAL_ID } from './productsLogic'

export interface DownloadFile { eventId: string; photoId: string; name: string; url: string; expiresAt: number }
export interface DownloadResult { files: DownloadFile[]; message?: string }

/** CU3: un enlace vencido no se ofrece; en su lugar "Generar un enlace nuevo". */
export const isExpired = (expiresAt: number, nowMs: number): boolean => nowMs >= expiresAt

export const hasDigital = (lines: { productId?: string }[]): boolean => lines.some((l) => l.productId === DIGITAL_ID)

/** Numero de pedido como lo escribe la gente: sin espacios y en mayusculas (el servidor lo normaliza igual). */
export const normalizeNumber = (v: string): string => v.trim().toUpperCase()
