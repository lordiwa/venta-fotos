/** Logica pura de las descargas digitales (TASK-019): propiedad del pedido, plazo del enlace y limite de intentos. Sin Firebase ni red. */

import { DIGITAL_ID } from "./orderStatus";

/** Plazo por defecto del enlace. Los enlaces firmados v4 de Cloud Storage admiten como maximo 7 dias. */
export const DEFAULT_TTL_DAYS = 7;
export const MAX_TTL_DAYS = 7;
/** Intentos fallidos permitidos por ventana (por IP y por numero de pedido). */
export const MAX_FAILURES = 10;
export const WINDOW_MS = 60 * 60 * 1000;

/**
 * Estados posteriores al pago. TASK-037: en_preparacion (WhatsApp) cuenta; pendiente_pago, cancelado y anulado no dan
 * descargas (un pedido por WhatsApp existe antes de pagarse). Tambien protege ante estados futuros como reembolsado.
 */
const PAID = ["pagado", "en_preparacion", "impreso", "listo_retiro", "enviado", "entregado"];
export const isPaidStatus = (s: unknown): boolean => typeof s === "string" && PAID.includes(s);

export const normalizeEmail = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");
export const normalizeNumber = (v: unknown): string => (typeof v === "string" ? v.trim().toUpperCase() : "");

/** Correo igual sin distinguir mayusculas ni espacios; vacio nunca coincide. */
export const emailsMatch = (a: unknown, b: unknown): boolean => {
  const x = normalizeEmail(a);
  return x !== "" && x === normalizeEmail(b);
};

/** Linea digital: por `kind` (lineas desde TASK-030); las de pedidos anteriores, sin kind, por el id fijo del producto digital. */
export const isDigitalLine = (l: { productId: string; kind?: string }): boolean => (l.kind === undefined ? l.productId === DIGITAL_ID : l.kind === "digital");

/** Fotos digitales del pedido, sin repetir. Solo lineas digitales: las impresiones nunca dan acceso al original. */
export function digitalPhotos(lines: { eventId: string; photoId: string; productId: string; kind?: string }[]): { eventId: string; photoId: string }[] {
  const seen = new Set<string>();
  const out: { eventId: string; photoId: string }[] = [];
  for (const l of lines) {
    const k = `${l.eventId}/${l.photoId}`;
    if (!isDigitalLine(l) || seen.has(k)) continue;
    seen.add(k);
    out.push({ eventId: l.eventId, photoId: l.photoId });
  }
  return out;
}

/**
 * IP real del cliente para el limite de intentos. Se toma la ULTIMA entrada de X-Forwarded-For: es la que agrega
 * Google Front End con la IP que realmente se conecto; las anteriores las puede escribir el cliente (suplantables).
 * Supone que ningun balanceador HTTPS externo precede a la funcion (con uno, la ultima entrada seria la IP del balanceador y todos compartirian un solo contador).
 * No se usa rawRequest.ip: sin "trust proxy" en Express devuelve la IP del proxy, no la del cliente.
 */
export const clientIp = (xff: unknown, fallback?: string): string => {
  const last = typeof xff === "string" ? xff.split(",").pop()?.trim() : "";
  return last || fallback || "unknown";
};

/** Content-Disposition RFC 6266: `filename` ASCII de respaldo + `filename*` UTF-8 con porcentaje; el nombre lleva la extension del archivo. */
export function contentDisposition(name: string, path: string): string {
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(path)?.[0] ?? "";
  const full = ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? name + ext : name;
  const ascii = full.replace(/[^ -~]|["\\%;]/g, "_");
  const utf8 = encodeURIComponent(full).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** Dias de vigencia validos: entero 1..7; cualquier otro valor usa el defecto. */
export const ttlDays = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_TTL_DAYS ? v : DEFAULT_TTL_DAYS);
export const expiresAtMs = (nowMs: number, days: number): number => nowMs + days * 24 * 60 * 60 * 1000;

export interface AttemptState { count: number; windowStart: number }

/** Hay bloqueo si en la ventana vigente ya se llego al maximo. max/windowMs: los de descargas por defecto; TASK-037 usa otros para crear pedidos. */
export const isBlocked = (s: AttemptState | undefined, nowMs: number, max = MAX_FAILURES, windowMs = WINDOW_MS): boolean =>
  !!s && nowMs - s.windowStart < windowMs && s.count >= max;

/** Registra un intento (fallo de descarga o pedido creado): abre ventana nueva si no hay o ya vencio. */
export const addFailure = (s: AttemptState | undefined, nowMs: number, windowMs = WINDOW_MS): AttemptState =>
  s && nowMs - s.windowStart < windowMs ? { count: s.count + 1, windowStart: s.windowStart } : { count: 1, windowStart: nowMs };
