import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { assertSimulationAllowed, CheckoutError, CheckoutSnapshot, classifyCapture, extractCapture } from "./checkout";
import { AdvanceError, isAdmin, planAdvance } from "./orderStatus";
import { computeSnapshot, finalizeOrder, saveCheckout, updateCheckout } from "./orders";
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

const paypalConfig = () => ({ baseUrl: PAYPAL_BASE_URL.value(), clientId: PAYPAL_CLIENT_ID.value(), clientSecret: PAYPAL_CLIENT_SECRET.value() });

function toHttpsError(e: unknown, op: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof CheckoutError) return new HttpsError(e.code, e.message, e.final ? { final: true } : undefined);
  logger.error(`${op} failed`, e);
  return new HttpsError("internal", "No pudimos procesar el pago. Intenta de nuevo.");
}

/** Recalcula el total en el servidor, crea la orden de PayPal (o una simulada en emuladores) y guarda el snapshot. */
export const createOrder = onCall(callOpts, async (request) => {
  try {
    const simulated = request.data?.simulated === true;
    if (simulated) assertSimulationAllowed(process.env);
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
      assertSimulationAllowed(process.env);
    } else {
      const res = await capturePaypalOrder(paypalConfig(), id);
      // R-1: desde aqui PayPal pudo haber cobrado; se deja constancia ANTES de verificar y todo error se registra.
      try {
        await updateCheckout(db, id, { capture: { ...extractCapture(res), capturedAtMs: Date.now() } });
        const outcome = classifyCapture(res, snap);
        if (outcome === "captura_pendiente") {
          await updateCheckout(db, id, { status: outcome });
          throw new CheckoutError("failed-precondition", `Tu pago está en revisión en PayPal (id ${id}). Te contactaremos.`, true);
        }
        if (outcome === "captura_no_coincide") {
          await updateCheckout(db, id, { status: outcome });
          throw new CheckoutError("failed-precondition", `Recibimos tu pago pero no pudimos confirmar el pedido. Guarda este código: ${id}.`, true);
        }
      } catch (e) {
        const notCaptured = e instanceof CheckoutError && !e.final; // DECLINED/FAILED: no hubo cobro
        if (notCaptured) logger.warn("captureOrder: captura no completada", { paypalOrderId: id, reason: e.message });
        else logger.error("captureOrder: cobro sin pedido", { paypalOrderId: id, error: String(e) });
        throw e;
      }
    }
    const order = await finalizeOrder(db, id, snap);
    await updateCheckout(db, id, { status: "pagado", orderNumber: order.number }).catch((e) => logger.error("captureOrder: no se pudo marcar el checkout", e));
    logger.info("captureOrder", { paypalOrderId: id, number: order.number });
    return order;
  } catch (e) {
    throw toHttpsError(e, "captureOrder");
  }
});

// ---- TASK-018: avance de estado de pedidos (solo admin) ----

/** Avanza el pedido al siguiente estado valido. `from` es el estado que veia el admin; si cambio, se rechaza. */
export const advanceOrder = onCall(async (request) => {
  if (!isAdmin(request.auth)) throw new HttpsError("permission-denied", "Solo el administrador puede cambiar el estado de un pedido.");
  const { orderId, from } = request.data ?? {};
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) throw new HttpsError("invalid-argument", "Falta el pedido.");
  const db = admin.firestore();
  const ref = db.doc(`orders/${orderId}`);
  try {
    const status = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "No encontramos ese pedido.");
      const next = planAdvance(snap.data() as Parameters<typeof planAdvance>[0], from);
      tx.update(ref, { status: next, statusHistory: FieldValue.arrayUnion({ status: next, at: Timestamp.now(), by: request.auth!.uid }) });
      return next;
    });
    logger.info("advanceOrder", { orderId, status });
    return { status };
  } catch (e) {
    if (e instanceof AdvanceError) throw new HttpsError("failed-precondition", e.message);
    throw e;
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
