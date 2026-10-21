import type { DocumentReference, Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { makeCover } from "./image";
import { coverFilePath, coverPrefix, planCover, type CoverFields } from "./coverLogic";

const readCover = async (ref: DocumentReference) => {
  const s = await ref.get();
  return { snap: s, doc: s.exists ? (s.data() as CoverFields) : null };
};

/** Borra covers/{eventId}/* salvo el archivo de la portada vigente (releida ahora, por si cambio durante el trabajo). */
async function cleanupCovers(ref: DocumentReference, bucket: Bucket, eventId: string) {
  const { doc } = await readCover(ref);
  const id = doc?.coverPhotoId;
  const keep = typeof id === "string" && id ? coverFilePath(eventId, id) : undefined;
  const [files] = await bucket.getFiles({ prefix: coverPrefix(eventId) });
  await Promise.all(files.filter((f) => f.name !== keep).map((f) => f.delete({ ignoreNotFound: true })));
}

/** Quita coverPath solo si el evento no cambio desde que se leyo; si cambio, el disparo de ese cambio reconcilia. */
async function removeCoverPath(ref: DocumentReference, updateTime: Timestamp | undefined) {
  try {
    await ref.update({ coverPath: FieldValue.delete() }, updateTime ? { lastUpdateTime: updateTime } : undefined);
  } catch (e) {
    logger.info("cover.sync: evento cambiado durante la limpieza, se omite", { path: ref.path, error: String(e) });
  }
}

/**
 * TASK-028: reconcilia la portada dedicada de events/{eventId} con su coverPhotoId. `after` es el documento del
 * disparo (atajo: si no hay nada que hacer no se lee nada); el plan real se toma del documento releido.
 * Nunca lanza: una foto no lista o sin original deja coverPath ausente y se registra.
 */
export async function syncCover(db: Firestore, bucket: Bucket, eventId: string, after: CoverFields | null): Promise<string> {
  if (planCover(eventId, after).kind === "none") return "none";
  const ref = db.doc(`events/${eventId}`);
  try {
    const { snap, doc } = await readCover(ref);
    const plan = planCover(eventId, doc);
    if (plan.kind === "none") return "none";
    if (plan.kind === "purge" || plan.kind === "clear") {
      if (plan.kind === "clear" && plan.removeField) await removeCoverPath(ref, snap.updateTime);
      await cleanupCovers(ref, bucket, eventId);
      logger.info("cover.sync", { eventId, result: plan.kind });
      return plan.kind;
    }

    const photo = await db.doc(`events/${eventId}/photos/${plan.photoId}`).get();
    const originalPath = photo.get("originalPath");
    const [exists] = photo.get("status") === "ready" && typeof originalPath === "string"
      ? await bucket.file(originalPath).exists()
      : [false];
    if (!exists) {
      logger.warn("cover.sync: foto no lista o sin original, sin portada dedicada", { eventId, photoId: plan.photoId });
      if (doc?.coverPath !== undefined) await removeCoverPath(ref, snap.updateTime);
      await cleanupCovers(ref, bucket, eventId);
      return "skipped";
    }

    const [original] = await bucket.file(originalPath).download();
    await bucket.file(plan.path).save(await makeCover(original), { contentType: "image/jpeg", resumable: false });
    const written = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get("coverPhotoId") !== plan.photoId) return false; // cambio otra vez: lo resuelve su propio disparo
      tx.update(ref, { coverPath: plan.path });
      return true;
    });
    await cleanupCovers(ref, bucket, eventId);
    logger.info("cover.sync", { eventId, photoId: plan.photoId, result: written ? "generated" : "superseded" });
    return written ? "generated" : "superseded";
  } catch (e) {
    logger.error("cover.sync failed", { eventId, error: String(e) });
    return "error";
  }
}
