import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { deletePhotoFiles, processOriginal } from "./process";

admin.initializeApp();

// Placeholder de checkout (se reemplaza en las tareas de pago). Adaptado a la API v2 de firebase-functions v6.
export const createCheckoutSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to make a purchase.");
  }
  if (!request.data?.photoId) {
    throw new HttpsError("invalid-argument", "photoId is required.");
  }
  // TODO: Integrate with PayPal SDK or Ecwid
  return { sessionId: `session_${Date.now()}`, status: "pending" };
});

// ---- TASK-013: procesamiento de fotos ----

/** Original subido -> miniatura + vista previa con marca de agua + documento photo (processing/ready/error). */
export const processPhoto = onObjectFinalized({ memory: "1GiB", timeoutSeconds: 300 }, async (event) => {
  const { name, metadata } = event.data;
  await processOriginal(admin.firestore(), admin.storage().bucket(event.data.bucket), name, metadata?.originalName);
});

/** Documento photo borrado (desde el panel o al borrar el evento) -> se borran original, vista previa y miniatura. */
export const cleanupPhotoFiles = onDocumentDeleted("events/{eventId}/photos/{photoId}", async (event) => {
  const { eventId, photoId } = event.params;
  await deletePhotoFiles(admin.storage().bucket(), eventId, photoId);
});
