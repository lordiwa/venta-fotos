import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { makeDerivatives } from "./image";
import { DERIVED_SAVE, derivedPath, derivedPrefix, ownsPath, type DerivedPhoto } from "./derived";

const ORIGINAL_RE = /^originals\/([^/]+)\/([^/]+)\.(jpe?g|png)$/i;

export const ERROR_MESSAGE = "No se pudo procesar la imagen (archivo dañado o no válido).";

/** originals/{eventId}/{photoId}.{ext} -> ids; null para cualquier otra ruta (no se procesa). */
export function parseOriginalPath(path: string): { eventId: string; photoId: string } | null {
  const m = ORIGINAL_RE.exec(path);
  return m ? { eventId: m[1], photoId: m[2] } : null;
}

/**
 * Borra originals/previews/thumbs de una foto y su portada dedicada si la tenia (ignora los que no existan).
 * TASK-033: por prefijo `{photoId}.`, asi caen el .jpg viejo y toda version .webp.
 */
export async function deletePhotoFiles(bucket: Bucket, eventId: string, photoId: string): Promise<void> {
  const lists = await Promise.all(
    [`originals/${eventId}/${photoId}.`, ...(["previews", "thumbs", "covers"] as const).map((d) => derivedPrefix(d, eventId, photoId))]
      .map((prefix) => bucket.getFiles({ prefix })),
  );
  await Promise.all(lists.flatMap(([files]) => files.map((f) => f.delete({ ignoreNotFound: true }))));
}

/**
 * TASK-033: genera miniatura y vista previa WebP versionadas, las sube y las publica en el documento (transaccion);
 * recien despues borra las que reemplazo (jpg viejo o version anterior), nunca antes. Asi el documento nunca apunta a
 * un archivo borrado. `accept`: condicion sobre el documento releido (el backfill no pisa una foto reprocesada
 * entretanto); si no se cumple no se publica y lo subido NO se borra: otra escritura con el mismo contenido tiene la
 * misma ruta y puede estar por publicarla (R-3); a lo sumo queda un huerfano. Lanza si la foto ya no existe.
 */
export async function publishDerivatives(
  db: Firestore,
  bucket: Bucket,
  eventId: string,
  photoId: string,
  original: Buffer,
  watermarkText: unknown,
  accept?: (cur: DerivedPhoto) => boolean,
): Promise<boolean> {
  const { thumb, preview, width, height } = await makeDerivatives(original, watermarkText);
  const out = { thumbPath: derivedPath("thumbs", eventId, photoId, thumb), previewPath: derivedPath("previews", eventId, photoId, preview) };
  await Promise.all([bucket.file(out.previewPath).save(preview, DERIVED_SAVE), bucket.file(out.thumbPath).save(thumb, DERIVED_SAVE)]);
  const ref = db.doc(`events/${eventId}/photos/${photoId}`);
  const { cur, written } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`La foto events/${eventId}/photos/${photoId} ya no existe`);
    const data = (snap.data() ?? {}) as DerivedPhoto;
    if (accept && !accept(data)) return { cur: data, written: false };
    tx.update(ref, { status: "ready", ...out, width, height });
    return { cur: data, written: true };
  });
  if (!written) return false;
  const live: unknown[] = [out.thumbPath, out.previewPath];
  const doomed = [cur.thumbPath, cur.previewPath].filter(
    (p): p is string => !live.includes(p) && (ownsPath(p, "thumbs", eventId, photoId) || ownsPath(p, "previews", eventId, photoId)),
  );
  // R-2: la foto ya esta publicada y bien; un fallo al borrar lo reemplazado solo deja un huerfano, no un error.
  await Promise.all(doomed.map((p) => bucket.file(p).delete({ ignoreNotFound: true }).catch((e) => {
    logger.warn("photo.derivatives: no se pudo borrar la version reemplazada", { eventId, photoId, path: p, error: String(e) });
  })));
  return true;
}

/**
 * Procesa un original recien subido: crea/actualiza events/{e}/photos/{id} (processing -> ready | error).
 * Nunca lanza por un archivo malo: ese caso queda en status 'error' sin afectar a las demas fotos.
 */
export async function processOriginal(
  db: Firestore,
  bucket: Bucket,
  path: string,
  originalName?: string,
): Promise<"ready" | "error" | "skipped"> {
  const ids = parseOriginalPath(path);
  if (!ids) return "skipped";
  const { eventId, photoId } = ids;
  const ref = db.doc(`events/${eventId}/photos/${photoId}`);

  if (!(await db.doc(`events/${eventId}`).get()).exists) {
    await bucket.file(path).delete({ ignoreNotFound: true }); // evento borrado durante la subida: no dejar huerfanos
    return "skipped";
  }

  if ((await ref.get()).exists) {
    await ref.update({ status: "processing", originalPath: path, errorMessage: FieldValue.delete() });
  } else {
    await ref.set({
      eventId,
      visible: true,
      status: "processing",
      name: originalName ?? `${photoId}`,
      originalPath: path,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  try {
    const [original] = await bucket.file(path).download();
    const settings = await db.doc("settings/store").get();
    await publishDerivatives(db, bucket, eventId, photoId, original, settings.get("watermarkText"));
    return "ready";
  } catch (err) {
    console.error(`Fallo al procesar ${path}`, err);
    try {
      await ref.update({ status: "error", errorMessage: ERROR_MESSAGE });
    } catch {
      // La foto se borro mientras se procesaba: limpiar lo que se haya escrito.
      await deletePhotoFiles(bucket, eventId, photoId);
    }
    return "error";
  }
}
