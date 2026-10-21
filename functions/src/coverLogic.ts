/** TASK-028: logica pura de la portada dedicada (sin Firebase). */

export const coverFilePath = (eventId: string, photoId: string) => `covers/${eventId}/${photoId}.jpg`;
export const coverPrefix = (eventId: string) => `covers/${eventId}/`;

export interface CoverFields {
  coverPhotoId?: unknown;
  coverPath?: unknown;
}

/**
 * Que hacer con la portada segun el estado del evento (null = evento borrado). Es una reconciliacion, no una
 * reaccion al cambio: el estado deseado se deduce del documento, asi que la escritura de coverPath que hace la
 * propia Function produce "none" (sin bucle) y disparos desordenados convergen al estado final.
 * - purge: evento borrado -> borrar todo covers/{eventId}/.
 * - clear: sin portada -> borrar los archivos y, si existe, el campo coverPath.
 * - generate: la portada elegida no tiene su archivo dedicado (o coverPath apunta a otra) -> generarlo.
 */
export type CoverPlan =
  | { kind: "none" }
  | { kind: "purge" }
  | { kind: "clear"; removeField: boolean }
  | { kind: "generate"; photoId: string; path: string };

/** Id de documento seguro para usar en una ruta de Storage (L-8): ids automaticos de Firestore y newPhotoId. */
export const validId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v) && !/^__.*__$/.test(v);

/**
 * Error que un reintento no arregla (L-9): gRPC INVALID_ARGUMENT(3), PERMISSION_DENIED(7), FAILED_PRECONDITION(9)
 * de Firestore; HTTP 400/403 de Storage. Se registra y no se relanza (si no, el trigger reintentaria ~24 h).
 */
export function isPermanentError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 3 || code === 7 || code === 9 || code === 400 || code === 403;
}

export function planCover(eventId: string, doc: CoverFields | null): CoverPlan {
  if (!doc) return { kind: "purge" };
  if (!validId(doc.coverPhotoId)) {
    return doc.coverPath === undefined ? { kind: "none" } : { kind: "clear", removeField: true };
  }
  const path = coverFilePath(eventId, doc.coverPhotoId);
  return doc.coverPath === path ? { kind: "none" } : { kind: "generate", photoId: doc.coverPhotoId, path };
}

export interface CoverPhoto {
  status?: unknown;
  visible?: unknown;
  originalPath?: unknown;
  thumbPath?: unknown;
}

/**
 * Ruta del original desde la que se puede generar la portada, o null si la foto no sirve: no existe, no esta lista,
 * esta OCULTA (una foto oculta nunca debe acabar publica en 1920px sin marca) o su originalPath no es el suyo.
 */
export function coverSource(photo: CoverPhoto | null, eventId: string, photoId: string, parse: (p: string) => { eventId: string; photoId: string } | null): string | null {
  if (!photo || photo.status !== "ready" || photo.visible !== true || typeof photo.originalPath !== "string") return null;
  const ids = parse(photo.originalPath);
  return ids && ids.eventId === eventId && ids.photoId === photoId ? photo.originalPath : null;
}

const couldBeCover = (p: CoverPhoto) => p.status === "ready" && p.visible === true;

/**
 * Un cambio de la foto que puede cambiar su portada (ocultar/mostrar, reprocesar, reemplazar el original). Filtro
 * barato sin leer el evento (L-3), que solo descarta casos donde no hay nada que generar NI que retirar:
 * - ni antes ni despues podia ser portada (oculta o no lista en ambos lados: si la hubo, ya se retiro);
 * - foto recien subida (nunca estuvo lista: sin thumbPath previo), que el admin aun no pudo elegir como portada.
 */
export function photoChangeAffectsCover(before: CoverPhoto, after: CoverPhoto): boolean {
  if (before.visible === after.visible && before.status === after.status && before.originalPath === after.originalPath) return false;
  if (!couldBeCover(before) && !couldBeCover(after)) return false;
  if (before.status !== "ready" && before.thumbPath === undefined) return false;
  return true;
}

/**
 * Archivos de covers/{eventId}/ a borrar: nunca la portada vigente (coverPath y la de coverPhotoId, releidos despues
 * de listar). Quien llama borra con ifGenerationMatch del listado, asi un archivo regenerado despues no se toca (M-1).
 * `drop`: archivo de una foto que ya no puede ser portada (oculta, no lista): se borra aunque siga elegida, salvo que
 * coverPath releido vuelva a apuntarle (la mostraron y otra invocacion ya la regenero y publico: M-5).
 */
export function coversToDelete(files: { name: string }[], eventId: string, doc: CoverFields | null, drop?: string): string[] {
  const keep = new Set<unknown>([doc?.coverPath]);
  if (validId(doc?.coverPhotoId)) keep.add(coverFilePath(eventId, doc.coverPhotoId));
  if (drop && doc?.coverPath !== drop) keep.delete(drop);
  return files.filter((f) => !keep.has(f.name)).map((f) => f.name);
}
