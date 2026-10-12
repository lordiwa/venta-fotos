import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { CheckoutError, CheckoutSnapshot, verifyCapture } from "./checkout";
import { computeSnapshot, finalizeOrder, saveCheckout } from "./orders";
import { capturePaypalOrder, createPaypalOrder } from "./paypal";
import { deletePhotoFiles, processOriginal } from "./process";

admin.initializeApp();

// ---- TASK-017: checkout con PayPal ----

const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
/** Sandbox por defecto; en produccion: https://api-m.paypal.com */
const PAYPAL_BASE_URL = defineString("PAYPAL_BASE_URL", { default: "https://api-m.sandbox.paypal.com" });
const SIMULATED_PREFIX = "SIMULADO-";
const callOpts = { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] };

/** El modo simulado solo existe con el emulador de Functions; en produccion se rechaza. */
const inEmulator = () => process.env.FUNCTIONS_EMULATOR === "true";
const paypalConfig = () => ({ baseUrl: PAYPAL_BASE_URL.value(), clientId: PAYPAL_CLIENT_ID.value(), clientSecret: PAYPAL_CLIENT_SECRET.value() });

function toHttpsError(e: unknown, op: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof CheckoutError) return new HttpsError(e.code, e.message);
  logger.error(`${op} failed`, e);
  return new HttpsError("internal", "No pudimos procesar el pago. Intenta de nuevo.");
}

/** Recalcula el total en el servidor, crea la orden de PayPal (o una simulada en emuladores) y guarda el snapshot. */
export const createOrder = onCall(callOpts, async (request) => {
  try {
    const simulated = request.data?.simulated === true;
    if (simulated && !inEmulator()) throw new HttpsError("permission-denied", "El pago simulado no está disponible.");
    const db = admin.firestore();
    const snap = await computeSnapshot(db, request.data ?? {});
    const paypalOrderId = simulated ? `${SIMULATED_PREFIX}${randomUUID().slice(0, 12)}` : await createPaypalOrder(paypalConfig(), snap);
    await saveCheckout(db, paypalOrderId, snap);
    logger.info("createOrder", { paypalOrderId, totalCents: snap.totalCents, simulated });
    return { paypalOrderId };
  } catch (e) {
    throw toHttpsError(e, "createOrder");
  }
});

/** Captura el pago, verifica el monto contra el snapshot del servidor y crea el pedido pagado (idempotente). */
export const captureOrder = onCall(callOpts, async (request) => {
  try {
    const id = request.data?.paypalOrderId;
    if (typeof id !== "string" || !id || id.includes("/")) throw new HttpsError("invalid-argument", "Falta la orden de pago.");
    const db = admin.firestore();
    const checkout = await db.doc(`checkouts/${id}`).get();
    if (!checkout.exists) throw new HttpsError("not-found", "No encontramos esa orden de pago.");
    const snap = checkout.data() as CheckoutSnapshot;
    if (id.startsWith(SIMULATED_PREFIX)) {
      if (!inEmulator()) throw new HttpsError("permission-denied", "El pago simulado no está disponible.");
    } else {
      verifyCapture(await capturePaypalOrder(paypalConfig(), id), snap);
    }
    const order = await finalizeOrder(db, id, snap);
    logger.info("captureOrder", { paypalOrderId: id, number: order.number });
    return order;
  } catch (e) {
    throw toHttpsError(e, "captureOrder");
  }
});

// ---- TASK-013: procesamiento de fotos ----

/** Original subido -> miniatura + vista previa con marca de agua + documento photo (processing/ready/error). */
export const processPhoto = onObjectFinalized({ memory: "2GiB", timeoutSeconds: 300 }, async (event) => {
  const { name, metadata } = event.data;
  await processOriginal(admin.firestore(), admin.storage().bucket(event.data.bucket), name, metadata?.originalName);
});

/** Documento photo borrado (desde el panel o al borrar el evento) -> se borran original, vista previa y miniatura. */
export const cleanupPhotoFiles = onDocumentDeleted("events/{eventId}/photos/{photoId}", async (event) => {
  const { eventId, photoId } = event.params;
  await deletePhotoFiles(admin.storage().bucket(), eventId, photoId);
});
