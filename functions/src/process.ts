import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { makeDerivatives } from "./image";

const ORIGINAL_RE = /^originals\/([^/]+)\/([^/]+)\.(jpe?g|png)$/i;

export const ERROR_MESSAGE = "No se pudo procesar la imagen (archivo dañado o no válido).";

/** originals/{eventId}/{photoId}.{ext} -> ids; null para cualquier otra ruta (no se procesa). */
export function parseOriginalPath(path: string): { eventId: string; photoId: string } | null {
  const m = ORIGINAL_RE.exec(path);
  return m ? { eventId: m[1], photoId: m[2] } : null;
}

export const previewPath = (eventId: string, photoId: string) => `previews/${eventId}/${photoId}.jpg`;
export const thumbPath = (eventId: string, photoId: string) => `thumbs/${eventId}/${photoId}.jpg`;

/** Borra previews/thumbs/originals de una foto (ignora los que no existan). */
export async function deletePhotoFiles(bucket: Bucket, eventId: string, photoId: string): Promise<void> {
  const [originals] = await bucket.getFiles({ prefix: `originals/${eventId}/${photoId}.` });
  await Promise.all([
    ...originals.map((f) => f.delete({ ignoreNotFound: true })),
    bucket.file(previewPath(eventId, photoId)).delete({ ignoreNotFound: true }),
    bucket.file(thumbPath(eventId, photoId)).delete({ ignoreNotFound: true }),
  ]);
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
    const { thumb, preview, width, height } = await makeDerivatives(original, settings.get("watermarkText"));
    await Promise.all([
      bucket.file(previewPath(eventId, photoId)).save(preview, { contentType: "image/jpeg", resumable: false }),
      bucket.file(thumbPath(eventId, photoId)).save(thumb, { contentType: "image/jpeg", resumable: false }),
    ]);
    await ref.update({
      status: "ready",
      previewPath: previewPath(eventId, photoId),
      thumbPath: thumbPath(eventId, photoId),
      width,
      height,
    });
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
