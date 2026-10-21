/** getDownloadLinks (TASK-019): enlaces temporales al original de las fotos digitales de un pedido, con numero + correo. */
import { createHash, randomUUID } from "crypto";
import * as admin from "firebase-admin";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  addFailure, AttemptState, contentDisposition, digitalPhotos, emailsMatch, expiresAtMs, isBlocked, isPaidStatus, normalizeNumber,
} from "./downloadsLogic";

export interface DownloadFile { eventId: string; photoId: string; name: string; url: string; expiresAt: number }
export interface DownloadResult { files: DownloadFile[]; message?: string }

const NOT_FOUND = "No encontramos un pedido con esos datos";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Contadores de fallos por IP y por numero de pedido (downloadAttempts/{hash}); solo las Functions los tocan. */
function counters(db: Firestore, ip: string, number: string) {
  return [`ip-${hash(ip)}`, `num-${hash(number)}`].map((id) => db.doc(`downloadAttempts/${id}`));
}

export async function recordFailure(db: Firestore, refs: FirebaseFirestore.DocumentReference[], now: number) {
  await Promise.all(refs.map((ref) => db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as AttemptState | undefined;
    tx.set(ref, { ...addFailure(cur, now), updatedAt: FieldValue.serverTimestamp() });
  })));
}

/** Firma el original (privado). En el emulador no hay credenciales para firmar: se usa un token de descarga, sin vencimiento real. */
async function linkFor(bucket: ReturnType<admin.storage.Storage["bucket"]>, path: string, filename: string, expires: number): Promise<string> {
  const file = bucket.file(path);
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
    return `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  const [url] = await file.getSignedUrl({
    version: "v4", action: "read", expires,
    responseDisposition: contentDisposition(filename, path),
  });
  return url;
}

/** Correo del pedido: customer (WhatsApp, TASK-037) o buyer (PayPal). */
const orderEmail = (d: FirebaseFirestore.DocumentSnapshot): unknown => d.get("customer.email") ?? d.get("buyer.email");

export async function getDownloadLinks(db: Firestore, input: { number?: unknown; email?: unknown }, ip: string, days: number): Promise<DownloadResult> {
  const number = normalizeNumber(input.number);
  const now = Date.now();
  const refs = counters(db, ip, number);
  if ((await Promise.all(refs.map((r) => r.get()))).some((s) => isBlocked(s.data() as AttemptState | undefined, now))) {
    throw new HttpsError("resource-exhausted", "Demasiados intentos. Prueba más tarde.");
  }
  // CU5: un solo mensaje y un solo codigo para "no existe" y "correo distinto".
  const found = number
    ? (await db.collection("orders").where("number", "==", number).limit(5).get()).docs.find((d) => isPaidStatus(d.get("status")) && emailsMatch(orderEmail(d), input.email))
    : undefined;
  if (!found) {
    await recordFailure(db, refs, now);
    throw new HttpsError("not-found", NOT_FOUND);
  }

  const photos = digitalPhotos(found.get("lines") ?? []);
  if (!photos.length) return { files: [], message: "Este pedido no incluye archivos digitales." };
  const bucket = admin.storage().bucket(admin.app().options.storageBucket ?? `${process.env.GCLOUD_PROJECT}.appspot.com`);
  const expiresAt = expiresAtMs(now, days);
  const files: DownloadFile[] = [];
  for (const p of photos) {
    // La ruta sale del documento de la foto, nunca de lo que mande el cliente. printOnly (TASK-030) no se mira: solo
    // frena ventas nuevas; quien ya pago conserva la descarga (decision del humano, 2026-10-21).
    const snap = await db.doc(`events/${p.eventId}/photos/${p.photoId}`).get();
    const path = snap.get("originalPath");
    if (typeof path !== "string" || !path.startsWith(`originals/${p.eventId}/`)) continue;
    const name = String(snap.get("name") ?? p.photoId);
    files.push({ ...p, name, url: await linkFor(bucket, path, name, expiresAt), expiresAt });
  }
  return { files, ...(files.length < photos.length ? { message: "Algunas fotos ya no están disponibles. Contáctanos." } : {}) };
}
