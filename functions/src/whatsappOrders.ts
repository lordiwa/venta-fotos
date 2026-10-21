/** Pedidos por WhatsApp (TASK-037): alta con precio del servidor, cambios de estado del admin, recordatorio y anulacion a las 24 h. */
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { CheckoutError, newOrderNumber, parseCartInput, priceLines } from "./checkout";
import { hash, recordFailure } from "./downloads";
import { AttemptState, addFailure, isBlocked, normalizeNumber } from "./downloadsLogic";
import { loadPricing } from "./orders";
import { AdvanceError, planAdvance } from "./orderStatus";
import {
  canRemind, EMAIL_REQUIRED, ORDER_RATE_MAX_PER_IP, ORDER_RATE_MAX_PER_PHONE, ORDER_RATE_WINDOW_MS, ORDER_TTL_MS, parseCustomer, publicOrder, PublicOrder,
  shouldExpire,
} from "./whatsappOrderLogic";

type Db = Firestore;

export interface WhatsappOrderResult {
  number: string;
  total: number;
  savings: number;
  expiresAt: number;
  lines: { eventId: string; photoId: string; productName: string; unitPrice: number; quantity: number; kind?: string }[];
  packs: { eventId: string; name: string; times: number; price: number }[];
}

const RATE_MESSAGE = "Hiciste muchos pedidos seguidos. Espera unos minutos o escríbenos por WhatsApp.";

/** CU10: cuenta el pedido por IP y por telefono (cada uno con su tope) en una transaccion; si alguno llego al tope, se rechaza sin contar. */
async function takeOrderSlot(db: Db, ip: string, phone: string, now: number): Promise<void> {
  const refs = [`ip-${hash(ip)}`, `tel-${hash(phone)}`].map((id) => db.doc(`orderAttempts/${id}`));
  const max = [ORDER_RATE_MAX_PER_IP, ORDER_RATE_MAX_PER_PHONE];
  await db.runTransaction(async (tx) => {
    const states = (await Promise.all(refs.map((r) => tx.get(r)))).map((s) => s.data() as AttemptState | undefined);
    if (states.some((s, i) => isBlocked(s, now, max[i], ORDER_RATE_WINDOW_MS))) throw new HttpsError("resource-exhausted", RATE_MESSAGE);
    refs.forEach((r, i) => tx.set(r, { ...addFailure(states[i], now, ORDER_RATE_WINDOW_MS), updatedAt: FieldValue.serverTimestamp() }));
  });
}

const asHttps = (e: unknown): never => {
  if (e instanceof CheckoutError) throw new HttpsError(e.code, e.message);
  throw e;
};

/**
 * CU1/CU2/CU3: valida carrito y cliente, pone precio desde el catalogo (el total del cliente no se usa), recien entonces
 * cobra el limite anti-abuso (un carrito invalido o viejo no gasta cupo) y crea orders/WA-<numero> en pendiente_pago, con plazo de 24 h. `create` falla si el id existe: numero unico.
 */
export async function createWhatsappOrder(db: Db, data: { lines?: unknown; customer?: unknown }, ip: string, now = Date.now()): Promise<WhatsappOrderResult> {
  try {
    const input = parseCartInput(data.lines);
    const customer = parseCustomer(data.customer);
    const priced = priceLines(await loadPricing(db, input));
    if (priced.lines.some((l) => l.kind === "digital") && !customer.email) throw new CheckoutError("invalid-argument", EMAIL_REQUIRED);
    await takeOrderSlot(db, ip, customer.phone, now);
    const total = (priced.linesCents - priced.savingsCents) / 100;
    const savings = priced.savingsCents / 100;
    const base = {
      status: "pendiente_pago",
      channel: "whatsapp",
      customer,
      lines: priced.lines,
      ...(priced.packs.length ? { packs: priced.packs } : {}),
      eventIds: [...new Set(priced.lines.map((l) => l.eventId))],
      savings,
      total,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + ORDER_TTL_MS),
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = newOrderNumber();
      // Los pedidos de PayPal tienen otro id de documento: su numero se busca aparte.
      if (!(await db.collection("orders").where("number", "==", number).limit(1).get()).empty) continue;
      try {
        await db.doc(`orders/WA-${number}`).create({ ...base, number });
      } catch (e) {
        if ((e as { code?: number }).code === 6) continue; // ALREADY_EXISTS
        throw e;
      }
      return {
        number, total, savings, expiresAt: now + ORDER_TTL_MS,
        lines: priced.lines.map(({ eventId, photoId, productName, unitPrice, quantity, kind }) => ({ eventId, photoId, productName, unitPrice, quantity, kind })),
        packs: priced.packs.map(({ eventId, name, times, price }) => ({ eventId, name, times, price })),
      };
    }
    throw new Error("no se pudo generar un numero de pedido unico");
  } catch (e) {
    return asHttps(e);
  }
}

/** CU4: cambio de estado validado contra el estado real dentro de la transaccion (gana quien commitea primero). */
export async function advanceOrderTx(db: Db, orderId: string, from: unknown, to: unknown, uid: string): Promise<string> {
  const ref = db.doc(`orders/${orderId}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "No encontramos ese pedido.");
      const next = planAdvance(snap.data() as Parameters<typeof planAdvance>[0], from, to);
      const at = Timestamp.now();
      tx.update(ref, {
        status: next,
        ...(next === "pagado" ? { paidAt: at } : next === "cancelado" ? { canceladoAt: at } : {}),
        statusHistory: FieldValue.arrayUnion({ status: next, at, by: uid }),
      });
      return next;
    });
  } catch (e) {
    if (e instanceof AdvanceError) throw new HttpsError("failed-precondition", e.message);
    throw e;
  }
}

/** CU6: deja constancia de que el admin abrio el recordatorio. Solo en pedidos por WhatsApp pendientes y antes de la hora limite. */
export async function markReminderSent(db: Db, orderId: string, uid: string, now = Date.now()): Promise<number> {
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "No encontramos ese pedido.");
    if (snap.get("channel") !== "whatsapp" || snap.get("status") !== "pendiente_pago") {
      throw new HttpsError("failed-precondition", "El pedido ya no está pendiente de pago. Recarga la lista.");
    }
    if (!canRemind(snap.data() as Parameters<typeof canRemind>[0], now)) {
      throw new HttpsError("failed-precondition", "El plazo de pago de este pedido ya venció: se anulará en unos minutos.");
    }
    const at = Timestamp.fromMillis(now);
    tx.update(ref, { reminderSentAt: at, reminderSentBy: uid });
    return at.toMillis();
  });
}

/** Maximo de pedidos que se revisan por corrida (cada 15 min); los que queden van en la siguiente. */
export const EXPIRE_BATCH = 200;

/**
 * CU7: anula los pendiente_pago con expiresAt vencido. Cada uno se relee en su transaccion: si el admin lo marco pagado
 * entre la consulta y la escritura, se deja como esta. Idempotente: una segunda corrida no encuentra nada.
 */
export async function expireDueOrders(db: Db, now = Date.now()): Promise<string[]> {
  const due = await db.collection("orders").where("status", "==", "pendiente_pago").where("expiresAt", "<=", Timestamp.fromMillis(now)).limit(EXPIRE_BATCH).get();
  const done: string[] = [];
  for (const d of due.docs) {
    const expired = await db.runTransaction(async (tx) => {
      const snap = await tx.get(d.ref);
      if (!shouldExpire(snap.data() as Parameters<typeof shouldExpire>[0], now)) return false;
      const at = Timestamp.fromMillis(now);
      tx.update(d.ref, { status: "anulado", anuladoAt: at, statusHistory: FieldValue.arrayUnion({ status: "anulado", at, by: "expireOrders" }) });
      return true;
    });
    if (expired) done.push(d.id);
  }
  return done;
}

/** CU9: estado publico de un pedido por su numero. Numero inexistente cuenta como fallo por IP (mismo limite que /descargas). */
export async function getOrderStatus(db: Db, input: { number?: unknown }, ip: string): Promise<PublicOrder> {
  const number = normalizeNumber(input.number);
  const now = Date.now();
  const refs = [db.doc(`downloadAttempts/status-ip-${hash(ip)}`)];
  if (isBlocked((await refs[0].get()).data() as AttemptState | undefined, now)) throw new HttpsError("resource-exhausted", "Demasiados intentos. Prueba más tarde.");
  const found = number && number.length <= 40 ? (await db.collection("orders").where("number", "==", number).limit(1).get()).docs[0] : undefined;
  if (!found) {
    await recordFailure(db, refs, now);
    throw new HttpsError("not-found", "No encontramos ese pedido.");
  }
  return publicOrder(found.data());
}
