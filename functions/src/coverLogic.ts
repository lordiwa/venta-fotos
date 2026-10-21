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

const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && !v.includes("/");

export function planCover(eventId: string, doc: CoverFields | null): CoverPlan {
  if (!doc) return { kind: "purge" };
  if (!validId(doc.coverPhotoId)) {
    return doc.coverPath === undefined ? { kind: "none" } : { kind: "clear", removeField: true };
  }
  const path = coverFilePath(eventId, doc.coverPhotoId);
  return doc.coverPath === path ? { kind: "none" } : { kind: "generate", photoId: doc.coverPhotoId, path };
}
