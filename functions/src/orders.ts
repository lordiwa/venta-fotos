/** Acceso a Firestore del checkout (TASK-017): lectura del catalogo, snapshot pendiente y creacion idempotente del pedido. */
import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  buildOrderDoc, buildSnapshot, CartInputLine, CatalogPack, CatalogProduct, CheckoutError, CheckoutSnapshot, newOrderNumber, parseBuyer, parseCartInput, PRINT_ONLY_MESSAGE, StoreSettings,
} from "./checkout";
import { DIGITAL_ID } from "./orderStatus";

type Db = Firestore;

export interface OrderSummary { number: string; lines: unknown[]; total: number; delivery: unknown }

/** Recalcula el pedido desde el catalogo y settings/store (nada del cliente salvo ids, cantidades, contacto y direccion). */
export async function computeSnapshot(db: Db, data: { lines?: unknown; buyer?: unknown; delivery?: unknown }): Promise<CheckoutSnapshot> {
  const lines: CartInputLine[] = parseCartInput(data.lines);
  const buyer = parseBuyer(data.buyer);
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const eventIds = [...new Set(lines.map((l) => l.eventId))];
  const photoKeys = [...new Set(lines.map((l) => `${l.eventId}/${l.photoId}`))];

  const [productSnaps, eventSnaps, photoSnaps, settingsSnap, activeSnap] = await Promise.all([
    db.getAll(...productIds.map((id) => db.doc(`products/${id}`))),
    db.getAll(...eventIds.map((id) => db.doc(`events/${id}`))),
    db.getAll(...photoKeys.map((k) => { const [e, p] = k.split("/"); return db.doc(`events/${e}/photos/${p}`); })),
    db.doc("settings/store").get(),
    db.collection("products").where("active", "==", true).get(),
  ]);
  const packs = activeSnap.docs.filter((d) => d.get("kind") === "pack").map((d) => ({ id: d.id, ...d.data() }) as CatalogPack);
  const products: Record<string, CatalogProduct | undefined> = {};
  productSnaps.forEach((s, i) => { products[productIds[i]] = s.exists ? (s.data() as CatalogProduct) : undefined; });
  const published = new Set(eventIds.filter((_, i) => eventSnaps[i].exists && eventSnaps[i].get("published") === true));
  const publicPhotos = new Set(photoKeys.filter((k, i) => {
    const s = photoSnaps[i];
    return published.has(k.split("/")[0]) && s.exists && s.get("visible") === true && s.get("status") === "ready";
  }));
  const printOnlyPhotos = new Set(photoKeys.filter((_, i) => photoSnaps[i].exists && photoSnaps[i].get("printOnly") === true));
  return buildSnapshot({
    lines, buyer, deliveryInput: data.delivery, products, publicPhotos, printOnlyPhotos, packs,
    settings: (settingsSnap.data() ?? {}) as StoreSettings,
  });
}

/** TASK-030: antes de cobrar, rechaza el snapshot si una foto con linea digital se marco printOnly despues de createOrder. */
export async function assertNoPrintOnlyDigital(db: Db, snap: Pick<CheckoutSnapshot, "lines">): Promise<void> {
  const digital = snap.lines.filter((l) => l.productId === DIGITAL_ID);
  if (!digital.length) return;
  const photos = await db.getAll(...digital.map((l) => db.doc(`events/${l.eventId}/photos/${l.photoId}`)));
  if (photos.some((s) => s.exists && s.get("printOnly") === true)) throw new CheckoutError("failed-precondition", PRINT_ONLY_MESSAGE);
}

/** Guarda el snapshot calculado; captureOrder lo lee de aqui y no confia en el cliente. */
export const saveCheckout = (db: Db, paypalOrderId: string, snap: CheckoutSnapshot) =>
  db.doc(`checkouts/${paypalOrderId}`).set({ ...snap, status: "creado", createdAt: FieldValue.serverTimestamp() });

const summarize = (d: FirebaseFirestore.DocumentData): OrderSummary => ({ number: d.number, lines: d.lines, total: d.total, delivery: d.delivery });

/** CU10: el pedido tiene como id el de PayPal y se crea en una transaccion; una segunda captura devuelve el mismo. */
export async function finalizeOrder(db: Db, paypalOrderId: string, snap: CheckoutSnapshot): Promise<OrderSummary> {
  const ref = db.doc(`orders/${paypalOrderId}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return summarize(existing.data()!);
    const doc = buildOrderDoc(snap, paypalOrderId, newOrderNumber());
    tx.set(ref, { ...doc, createdAt: FieldValue.serverTimestamp() });
    return summarize(doc);
  });
}

/** Estado del checkout (con captura de PayPal si la hubo) para que el fotografo pueda encontrar cobros sin pedido. Incluye buyer y total desde saveCheckout. */
export const updateCheckout = (db: Db, paypalOrderId: string, patch: Record<string, unknown>) =>
  db.doc(`checkouts/${paypalOrderId}`).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
