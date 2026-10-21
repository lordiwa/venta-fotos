import type { DocumentReference, Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { makeCover } from "./image";
import { parseOriginalPath } from "./process";
import { coverPrefix, coverSource, coversToDelete, planCover, photoChangeAffectsCover, type CoverFields, type CoverPhoto, type CoverPlan } from "./coverLogic";

const readCover = async (ref: DocumentReference) => {
  const s = await ref.get();
  return { snap: s, doc: s.exists ? (s.data() as CoverFields) : null };
};

/** Borra covers/{eventId}/* salvo la portada vigente, releida justo antes de borrar, y lo creado tras empezar (M-1). */
async function cleanupCovers(ref: DocumentReference, bucket: Bucket, eventId: string, drop?: string) {
  const startedMs = Date.now();
  const [files] = await bucket.getFiles({ prefix: coverPrefix(eventId) });
  const { doc } = await readCover(ref);
  const listed = files.map((f) => ({ name: f.name, timeCreatedMs: Date.parse(String(f.metadata.timeCreated ?? "")) || 0 }));
  const doomed = new Set(coversToDelete(listed, eventId, doc, startedMs, drop));
  await Promise.all(files.filter((f) => doomed.has(f.name)).map((f) => f.delete({ ignoreNotFound: true })));
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
 * `recheck` (disparo desde la foto): regenera o retira aunque coverPath ya corresponda.
 * Nunca lanza: una foto oculta, no lista o sin original deja coverPath ausente y se registra.
 */
export async function syncCover(db: Firestore, bucket: Bucket, eventId: string, after: CoverFields | null, recheck = false): Promise<string> {
  if (!recheck && planCover(eventId, after).kind === "none") return "none";
  const ref = db.doc(`events/${eventId}`);
  try {
    const { snap, doc } = await readCover(ref);
    let plan: CoverPlan = planCover(eventId, doc);
    if (plan.kind === "none" && recheck && typeof doc?.coverPhotoId === "string" && typeof doc.coverPath === "string") {
      plan = { kind: "generate", photoId: doc.coverPhotoId, path: doc.coverPath };
    }
    if (plan.kind === "none") return "none";
    if (plan.kind === "purge" || plan.kind === "clear") {
      if (plan.kind === "clear" && plan.removeField) await removeCoverPath(ref, snap.updateTime);
      await cleanupCovers(ref, bucket, eventId);
      logger.info("cover.sync", { eventId, result: plan.kind });
      return plan.kind;
    }

    const photo = await db.doc(`events/${eventId}/photos/${plan.photoId}`).get();
    const source = coverSource(photo.exists ? (photo.data() as CoverPhoto) : null, eventId, plan.photoId, parseOriginalPath);
    const [exists] = source ? await bucket.file(source).exists() : [false];
    if (!source || !exists) {
      logger.warn("cover.sync: foto oculta, no lista o sin original, sin portada dedicada", { eventId, photoId: plan.photoId });
      if (doc?.coverPath !== undefined) await removeCoverPath(ref, snap.updateTime);
      await cleanupCovers(ref, bucket, eventId, plan.path);
      return "skipped";
    }

    const [original] = await bucket.file(source).download();
    const cover = await makeCover(original);
    await bucket.file(plan.path).save(cover, { contentType: "image/jpeg", resumable: false });
    const written = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get("coverPhotoId") !== plan.photoId) return false; // cambio otra vez: lo resuelve su propio disparo
      tx.update(ref, { coverPath: plan.path });
      return true;
    });
    await cleanupCovers(ref, bucket, eventId);
    // M-1: si una limpieza concurrente alcanzo a borrar el archivo vigente, se repone.
    if (written && !(await bucket.file(plan.path).exists())[0]) {
      await bucket.file(plan.path).save(cover, { contentType: "image/jpeg", resumable: false });
    }
    logger.info("cover.sync", { eventId, photoId: plan.photoId, result: written ? "generated" : "superseded" });
    return written ? "generated" : "superseded";
  } catch (e) {
    logger.error("cover.sync failed", { eventId, error: String(e) });
    return "error";
  }
}

/** La foto cambio (visible/status/originalPath): si es la portada vigente, se regenera o se retira (R-1). */
export async function syncCoverForPhoto(db: Firestore, bucket: Bucket, eventId: string, photoId: string, before: CoverPhoto, after: CoverPhoto): Promise<string> {
  if (!photoChangeAffectsCover(before, after)) return "none";
  const ev = await db.doc(`events/${eventId}`).get();
  if (!ev.exists || ev.get("coverPhotoId") !== photoId) return "none";
  return syncCover(db, bucket, eventId, ev.data() as CoverFields, true);
}
