/**
 * TASK-033: rutas versionadas de los derivados publicos (miniatura, vista previa, portada). Logica pura.
 * El nombre lleva un hash corto del CONTENIDO: `{dir}/{eventId}/{photoId}.{hash}.webp`. Contenido nuevo (otro
 * original, otra marca de agua) -> nombre nuevo, asi el Cache-Control de un ano con `immutable` nunca sirve una
 * version vieja. Mismo contenido -> mismo nombre (regenerar es idempotente).
 */
import { createHash } from "crypto";
import { WATERMARK_VERSION } from "./watermark";

export const CACHE_CONTROL = "public, max-age=31536000, immutable";
export type DerivedDir = "thumbs" | "previews" | "covers";

/** Opciones de subida de todo derivado: WebP + cache largo (seguro: el nombre cambia con el contenido). */
export const DERIVED_SAVE = { contentType: "image/webp", resumable: false, metadata: { cacheControl: CACHE_CONTROL } } as const;

const VERSION_RE = /^[0-9a-f]{12}\.webp$/;
const versionTag = (buf: Buffer) => createHash("sha256").update(buf).digest("hex").slice(0, 12);

/** Prefijo de todos los archivos de la foto en `dir` (el .jpg viejo y cada version .webp). El id no lleva puntos. */
export const derivedPrefix = (dir: DerivedDir, eventId: string, photoId: string) => `${dir}/${eventId}/${photoId}.`;

export const derivedPath = (dir: DerivedDir, eventId: string, photoId: string, buf: Buffer) =>
  `${derivedPrefix(dir, eventId, photoId)}${versionTag(buf)}.webp`;

/** Ruta en el formato actual (webp versionado) de esa foto. */
export function isDerivedPath(path: unknown, dir: DerivedDir, eventId: string, photoId: string): path is string {
  const pre = derivedPrefix(dir, eventId, photoId);
  return typeof path === "string" && path.startsWith(pre) && VERSION_RE.test(path.slice(pre.length));
}

/** Archivo propio de la foto en `dir` (jpg viejo o webp): lo unico que se borra al reemplazarlo. */
export function ownsPath(path: unknown, dir: DerivedDir, eventId: string, photoId: string): path is string {
  const pre = derivedPrefix(dir, eventId, photoId);
  return typeof path === "string" && path.startsWith(pre) && !path.slice(pre.length).includes("/");
}

export interface DerivedPhoto {
  status?: unknown;
  originalPath?: unknown;
  thumbPath?: unknown;
  previewPath?: unknown;
  watermarkVersion?: unknown;
}

/**
 * Backfill: por que hay que rehacer los derivados de la foto lista con original. "format": la miniatura o la vista
 * previa no esta aun en webp versionado; "watermark" (TASK-035): ya lo esta, pero la vista previa se hizo con otra
 * marca de agua (`watermarkVersion` distinto del actual o ausente). null: nada que hacer.
 */
export function webpReason(photo: DerivedPhoto, eventId: string, photoId: string): "format" | "watermark" | null {
  if (photo.status !== "ready" || typeof photo.originalPath !== "string") return null;
  if (!(isDerivedPath(photo.thumbPath, "thumbs", eventId, photoId) && isDerivedPath(photo.previewPath, "previews", eventId, photoId))) {
    return "format";
  }
  return photo.watermarkVersion === WATERMARK_VERSION ? null : "watermark";
}

export const needsWebp = (photo: DerivedPhoto, eventId: string, photoId: string) => webpReason(photo, eventId, photoId) !== null;

/**
 * Backfill: .jpg viejos de thumbs/, previews/ o covers/ que ningun documento referencia (los que dejo una conversion
 * cortada). Seguro: desde TASK-033 nadie escribe .jpg, asi que uno sin referencia no puede estar por publicarse.
 */
export const legacyToDelete = (names: string[], referenced: Set<unknown>) =>
  names.filter((n) => /^(thumbs|previews|covers)\/[^/]+\/[^/]+\.jpg$/.test(n) && !referenced.has(n));
