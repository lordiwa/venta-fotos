import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { makeCover } from "./image";
import { parseOriginalPath } from "./process";
import { coverFilePath, coverPrefix, coverSource, coversToDelete, planCover, photoChangeAffectsCover, type CoverFields, type CoverPhoto, type CoverPlan } from "./coverLogic";

const readCover = async (ref: DocumentReference) => {
  const s = await ref.get();
  return s.exists ? (s.data() as CoverFields) : null;
};

/** Borra un archivo solo si sigue siendo la generacion indicada; si alguien lo regenero (o ya no existe), no se toca. */
async function deleteGeneration(bucket: Bucket, name: string, generation: unknown) {
  if (generation === undefined || generation === null) {
    logger.warn("cover.sync: sin generation, no se borra (nunca incondicional)", { name }); // L-7
    return;
  }
  try {
    await bucket.file(name).delete({ ifGenerationMatch: Number(generation) });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 404 && code !== 412) throw e; // 412: regenerado despues del listado; 404: ya borrado
  }
}

/**
 * Borra covers/{eventId}/* salvo la portada vigente (releida despues de listar). Cada borrado va condicionado a la
 * generacion listada, asi que nunca borra un archivo que otra invocacion regenero entretanto (M-1).
 */
async function cleanupCovers(ref: DocumentReference, bucket: Bucket, eventId: string, drop?: string) {
  const [files] = await bucket.getFiles({ prefix: coverPrefix(eventId) });
  const doomed = new Set(coversToDelete(files, eventId, await readCover(ref), drop));
  await Promise.all(files.filter((f) => doomed.has(f.name)).map((f) => deleteGeneration(bucket, f.name, f.metadata.generation)));
}

const photoData = (s: { exists: boolean; data(): unknown }) => (s.exists ? (s.data() as CoverPhoto) : null);

/**
 * TASK-028: reconcilia la portada dedicada de events/{eventId} con su coverPhotoId. `after` es el documento del
 * disparo (atajo: si no hay nada que hacer no se lee nada); el plan real se toma del documento releido.
 * `recheck` (disparo desde la foto): regenera o retira aunque coverPath ya corresponda.
 * Invariante: coverPath solo se escribe en una transaccion que ve la foto elegible (visible, lista, su original).
 * Nunca lanza: una foto oculta, no lista o sin original deja coverPath ausente y se registra.
 */
export async function syncCover(db: Firestore, bucket: Bucket, eventId: string, after: CoverFields | null, recheck = false): Promise<string> {
  if (!recheck && planCover(eventId, after).kind === "none") return "none";
  const ref = db.doc(`events/${eventId}`);
  let saved: { path: string; generation: unknown } | undefined; // L-5: lo guardado y aun no publicado
  try {
    const doc = await readCover(ref);
    let plan: CoverPlan = planCover(eventId, doc);
    if (plan.kind === "none" && recheck && typeof doc?.coverPhotoId === "string") {
      plan = { kind: "generate", photoId: doc.coverPhotoId, path: coverFilePath(eventId, doc.coverPhotoId) }; // L-4
    }
    if (plan.kind === "none") return "none";
    if (plan.kind === "purge" || plan.kind === "clear") {
      if (plan.kind === "clear") {
        // Solo si sigue sin portada elegida: si se eligio otra entretanto, su propio disparo la genera.
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(ref);
          const now = planCover(eventId, cur.exists ? (cur.data() as CoverFields) : null);
          if (now.kind === "clear" && now.removeField) tx.update(ref, { coverPath: FieldValue.delete() });
        });
      }
      await cleanupCovers(ref, bucket, eventId);
      logger.info("cover.sync", { eventId, result: plan.kind });
      return plan.kind;
    }

    const photoRef = db.doc(`events/${eventId}/photos/${plan.photoId}`);
    const source = coverSource(photoData(await photoRef.get()), eventId, plan.photoId, parseOriginalPath);
    const [originalExists] = source ? await bucket.file(source).exists() : [false];
    if (!source || !originalExists) {
      // M-3: primero se quita coverPath (transaccion: la foto sigue elegida y sigue sin servir), despues el archivo.
      const retired = await db.runTransaction(async (tx) => {
        const [cur, p] = await Promise.all([tx.get(ref), tx.get(photoRef)]);
        if (!cur.exists || cur.get("coverPhotoId") !== plan.photoId) return false;
        if (originalExists && coverSource(photoData(p), eventId, plan.photoId, parseOriginalPath)) return false; // volvio a servir: lo regenera su disparo
        if (cur.get("coverPath") !== undefined) tx.update(ref, { coverPath: FieldValue.delete() });
        return true;
      });
      logger.warn("cover.sync: foto oculta, no lista o sin original, sin portada dedicada", { eventId, photoId: plan.photoId, retired });
      if (!retired) return "superseded";
      await cleanupCovers(ref, bucket, eventId, plan.path);
      return "skipped";
    }

    const [original] = await bucket.file(source).download();
    const out = bucket.file(plan.path);
    await out.save(await makeCover(original), { contentType: "image/jpeg", resumable: false });
    const generation = out.metadata.generation;
    saved = { path: plan.path, generation };
    // R-2: la foto se relee DENTRO de la transaccion; si la ocultaron mientras se generaba, no se publica.
    const written = await db.runTransaction(async (tx) => {
      const [cur, p] = await Promise.all([tx.get(ref), tx.get(photoRef)]);
      if (!cur.exists || cur.get("coverPhotoId") !== plan.photoId) return false;
      if (coverSource(photoData(p), eventId, plan.photoId, parseOriginalPath) !== source) return false;
      tx.update(ref, { coverPath: plan.path });
      return true;
    });
    saved = undefined;
    if (written) {
      await cleanupCovers(ref, bucket, eventId);
    } else {
      // El archivo recien guardado no se publica: se borra esa generacion (cleanupCovers lo conservaria si sigue elegida).
      await deleteGeneration(bucket, plan.path, generation);
    }
    logger.info("cover.sync", { eventId, photoId: plan.photoId, result: written ? "generated" : "superseded" });
    return written ? "generated" : "superseded";
  } catch (e) {
    logger.error("cover.sync failed", { eventId, error: String(e) });
    if (saved) await deleteGeneration(bucket, saved.path, saved.generation).catch(() => undefined);
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
