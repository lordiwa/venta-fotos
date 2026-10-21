import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { assertSimulationAllowed, CheckoutError, CheckoutSnapshot, classifyCapture, extractCapture } from "./checkout";
import { getDownloadLinks as buildDownloadLinks } from "./downloads";
import { clientIp, ttlDays } from "./downloadsLogic";
import { AdvanceError, isAdmin, planAdvance } from "./orderStatus";
import { assertNoPrintOnlyDigital, computeSnapshot, finalizeOrder, saveCheckout, updateCheckout } from "./orders";
import { capturePaypalOrder, createPaypalOrder, getPaypalOrder } from "./paypal";
import { deletePhotoFiles, processOriginal } from "./process";
import { syncCover, syncCoverForPhoto } from "./cover";

admin.initializeApp();

// Misma region que Firestore y Storage (southamerica-east1); el cliente en src/firebase.ts debe coincidir.
setGlobalOptions({ region: "southamerica-east1" });

// ---- TASK-017: checkout con PayPal ----

/**
 * TASK-027: sin PAYPAL_ENABLED=true no se exportan createOrder/captureOrder. La CLI valida los secretos de TODOS
 * los endpoints exportados al analizar el deploy, asi que sin PayPal no deben existir (ni declarar secretos).
 */
const PAYPAL_ENABLED = process.env.PAYPAL_ENABLED === "true";
/** Sandbox por defecto; en produccion: https://api-m.paypal.com */
const PAYPAL_BASE_URL = defineString("PAYPAL_BASE_URL", { default: "https://api-m.sandbox.paypal.com" });
const SIMULATED_PREFIX = "SIMULADO-";

function toHttpsError(e: unknown, op: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof CheckoutError) return new HttpsError(e.code, e.message, e.final ? { final: true } : undefined);
  logger.error(`${op} failed`, e);
  return new HttpsError("internal", "No pudimos procesar el pago. Intenta de nuevo.");
}

function buildPaypalFunctions() {
  const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
  const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
  const callOpts = { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] };
  const paypalConfig = () => ({ baseUrl: PAYPAL_BASE_URL.value(), clientId: PAYPAL_CLIENT_ID.value(), clientSecret: PAYPAL_CLIENT_SECRET.value() });

  /** Recalcula el total en el servidor, crea la orden de PayPal (o una simulada en emuladores) y guarda el snapshot. */
  const createOrder = onCall(callOpts, async (request) => {
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
  const captureOrder = onCall(callOpts, async (request) => {
    try {
      const id = request.data?.paypalOrderId;
      if (typeof id !== "string" || !id || id.includes("/")) throw new HttpsError("invalid-argument", "Falta la orden de pago.");
      const db = admin.firestore();
      const checkout = await db.doc(`checkouts/${id}`).get();
      if (!checkout.exists) throw new HttpsError("not-found", "No encontramos esa orden de pago.");
      const snap = checkout.data() as CheckoutSnapshot;
      // Antes de cobrar: la foto pudo marcarse "solo impresion" despues de createOrder (TASK-030). Un reintento de
      // un checkout ya cobrado o con pedido no se rechaza: finalizeOrder es idempotente y no debe quedar cobro sin pedido.
      // M-2: si la foto se marco despues, antes de rechazar se consulta PayPal; una orden ya COMPLETED sigue el flujo normal.
      if (checkout.get("status") === "creado" && !checkout.get("capture")) {
        const simulated = id.startsWith(SIMULATED_PREFIX);
        await assertNoPrintOnlyDigital(db, snap, simulated ? undefined : async () => (await getPaypalOrder(paypalConfig(), id))?.status === "COMPLETED");
      }
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

  return { createOrder, captureOrder };
}

const paypalFunctions = PAYPAL_ENABLED ? buildPaypalFunctions() : undefined;
// Un export undefined no es un endpoint: la CLI lo ignora.
export const createOrder = paypalFunctions?.createOrder;
export const captureOrder = paypalFunctions?.captureOrder;

// ---- TASK-019: descarga del archivo digital ----

/** Dias de vigencia del enlace (1..7, tope de las URLs firmadas v4). Cambiar con el parametro DOWNLOAD_TTL_DAYS. */
const DOWNLOAD_TTL_DAYS = defineInt("DOWNLOAD_TTL_DAYS", { default: 7 });

/** Con numero de pedido + correo devuelve enlaces nuevos al original de sus fotos digitales. Sin cuenta; con limite de intentos. */
export const getDownloadLinks = onCall(async (request) => {
  const ip = clientIp(request.rawRequest?.headers?.["x-forwarded-for"], request.rawRequest?.ip);
  return buildDownloadLinks(admin.firestore(), request.data ?? {}, ip, ttlDays(DOWNLOAD_TTL_DAYS.value()));
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

// ---- TASK-028: portada dedicada del evento ----

/**
 * events/{id} escrito -> reconcilia covers/{id}/{coverPhotoId}.jpg (1920px, sin marca) y el campo coverPath.
 * Escribe en el mismo documento que la dispara: planCover devuelve "none" cuando coverPath ya corresponde (sin bucle).
 * retry: los fallos transitorios se relanzan y se reintentan (la reconciliacion es idempotente).
 */
export const syncEventCover = onDocumentWritten({ document: "events/{eventId}", memory: "1GiB", timeoutSeconds: 300, retry: true }, async (event) => {
  const after = event.data?.after;
  await syncCover(admin.firestore(), admin.storage().bucket(), event.params.eventId, after?.exists ? after.data() ?? null : null);
});

/** Foto actualizada: si es la portada y cambia visible/status/originalPath, se regenera o se retira (ocultarla la saca de la portada). */
export const syncPhotoCover = onDocumentUpdated({ document: "events/{eventId}/photos/{photoId}", memory: "1GiB", timeoutSeconds: 300, retry: true }, async (event) => {
  const { eventId, photoId } = event.params;
  const before = event.data?.before.data() ?? {};
  const after = event.data?.after.data() ?? {};
  await syncCoverForPhoto(admin.firestore(), admin.storage().bucket(), eventId, photoId, before, after);
});
