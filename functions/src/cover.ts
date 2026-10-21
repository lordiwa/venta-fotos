import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { makeCover } from "./image";
import { parseOriginalPath } from "./process";
import { coverFilePath, coverPrefix, coverSource, coversToDelete, planCover, photoChangeAffectsCover, isPermanentError, type CoverFields, type CoverPhoto, type CoverPlan } from "./coverLogic";

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
 * Una foto oculta, no lista o sin original no es un error: deja coverPath ausente ("skipped"); un original corrupto
 * tampoco ("error", sin relanzar). Los fallos de Firestore/Storage SI se relanzan (M-7): los triggers tienen retry y
 * la reconciliacion es idempotente, asi un borrado fallido no deja publica la portada de una foto oculta.
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
    if (plan.kind === "none") {
      // Reintento tras un fallo de limpieza (clear, o generate ya publicado): el plan ya es "none" pero pueden quedar
      // archivos viejos (M-7/M-8). Solo se llega aqui si el atajo de `after` no era "none".
      if (!recheck && doc) await cleanupCovers(ref, bucket, eventId);
      return "none";
    }
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
    let cover: Buffer;
    try {
      cover = await makeCover(original);
    } catch (e) {
      // Original corrupto: permanente, reintentar no lo arregla. Se registra y no se relanza.
      logger.error("cover.sync: original no valido, sin portada dedicada", { eventId, photoId: plan.photoId, error: String(e) });
      return "error";
    }
    const out = bucket.file(plan.path);
    await out.save(cover, { contentType: "image/jpeg", resumable: false });
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
    if (saved) {
      // M-6: un commit ambiguo pudo publicar coverPath igual; solo se borra lo guardado si el evento NO le apunta.
      const s = saved;
      await ref.get()
        .then((cur) => (cur.get("coverPath") !== s.path ? deleteGeneration(bucket, s.path, s.generation) : undefined))
        .catch(() => undefined); // si no se puede releer, no se borra: el reintento reconcilia
    }
    if (isPermanentError(e)) {
      logger.error("cover.sync error permanente", { eventId, error: String(e) }); // L-9: reintentar no lo arregla
      return "error";
    }
    logger.warn("cover.sync: fallo transitorio, se reintenta", { eventId });
    throw e;
  }
}

/** La foto cambio (visible/status/originalPath): si es la portada vigente, se regenera o se retira (R-1). */
export async function syncCoverForPhoto(db: Firestore, bucket: Bucket, eventId: string, photoId: string, before: CoverPhoto, after: CoverPhoto): Promise<string> {
  if (!photoChangeAffectsCover(before, after)) return "none";
  const ev = await db.doc(`events/${eventId}`).get();
  if (!ev.exists || ev.get("coverPhotoId") !== photoId) return "none";
  return syncCover(db, bucket, eventId, ev.data() as CoverFields, true);
}
