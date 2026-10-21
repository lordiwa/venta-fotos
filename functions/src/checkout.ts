/** Logica pura del checkout (TASK-017): validacion, recalculo del total en centavos enteros y verificacion de la captura. Sin Firebase ni red. */
import { randomInt } from "crypto";
import { digitalPackPricing } from "./packPricing";

/** Moneda unica de la tienda (codigo ISO 4217). Se usa en la orden de PayPal y al verificar la captura. */
export const CURRENCY = "USD";
export const MAX_QTY = 99;
export const MAX_LINES = 100;

/** Error de negocio con mensaje apto para mostrar al comprador. */
export class CheckoutError extends Error {
  constructor(public code: "invalid-argument" | "failed-precondition", message: string, public final = false) {
    super(message);
  }
}

export interface CartInputLine { eventId: string; photoId: string; productId: string; quantity: number }
export interface Buyer { name: string; email: string; phone: string }
export type Delivery = { method: "retiro" } | { method: "envio"; address: string; cost: number };
export interface CatalogProduct { name: string; kind: "print" | "digital" | "pack"; price: number; active?: boolean; quantity?: number }
/** Paquete digital activo (TASK-029), con su id de documento. */
export type CatalogPack = CatalogProduct & { id: string };
export interface StoreSettings { shippingCost?: number; pickupInfo?: string }
export interface SnapshotLine {
  eventId: string; photoId: string; productId: string; productName: string; unitPrice: number; quantity: number;
  /** Tipo del producto al vender (desde TASK-030); los pedidos anteriores no lo tienen (ver isDigitalLine). */
  kind?: CatalogProduct["kind"];
}
/** Paquete aplicado (TASK-029): las lineas siguen por foto a precio suelto y esto explica el descuento. */
export interface SnapshotPack { eventId: string; productId: string; name: string; quantity: number; price: number; times: number }

/** Lo que createOrder guarda en checkouts/{paypalOrderId}: captureOrder usa esto y nunca datos del cliente. */
export interface CheckoutSnapshot {
  lines: SnapshotLine[];
  /** Solo si se aplicaron paquetes (pedidos anteriores no lo tienen). totalCents = lineas - ahorro + envio. */
  packs?: SnapshotPack[];
  eventIds: string[];
  buyer: Buyer;
  delivery: Delivery;
  totalCents: number;
  currency: string;
}

export const toCents = (n: number): number => Math.round(n * 100);
/** Importe en el formato de PayPal ("12.50"), desde centavos enteros. */
export const centsToString = (c: number): string => (c / 100).toFixed(2);

// Ids de documento de Firestore: sin "/", ni "." / "..", ni "__x__" (reservados).
const validId = (v: unknown): v is string =>
  typeof v === "string" && v !== "" && v.length <= 200 && !v.includes("/") && v !== "." && v !== ".." && !/^__.*__$/.test(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Forma de las lineas que manda el cliente. Rechaza lo que no sea ids + cantidad entera 1..99, y lineas repetidas. */
export function parseCartInput(data: unknown): CartInputLine[] {
  if (!Array.isArray(data) || data.length === 0) throw new CheckoutError("invalid-argument", "El carrito está vacío.");
  if (data.length > MAX_LINES) throw new CheckoutError("invalid-argument", "El carrito tiene demasiadas líneas.");
  const seen = new Set<string>();
  return data.map((x) => {
    const l = x as Record<string, unknown> | null;
    if (!l || typeof l !== "object" || !validId(l.eventId) || !validId(l.photoId) || !validId(l.productId)
      || typeof l.quantity !== "number" || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY) {
      throw new CheckoutError("invalid-argument", "El carrito contiene una línea inválida.");
    }
    const key = `${l.eventId}/${l.photoId}/${l.productId}`;
    if (seen.has(key)) throw new CheckoutError("invalid-argument", "El carrito contiene líneas repetidas.");
    seen.add(key);
    return { eventId: l.eventId, photoId: l.photoId, productId: l.productId, quantity: l.quantity };
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBuyer(data: unknown): Buyer {
  const b = (data ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  const email = text(b.email, 200);
  const phone = text(b.phone, 40);
  if (!name) throw new CheckoutError("invalid-argument", "Escribe tu nombre.");
  if (!EMAIL.test(email)) throw new CheckoutError("invalid-argument", "Escribe un correo válido.");
  if (phone.replace(/\D/g, "").length < 7) throw new CheckoutError("invalid-argument", "Escribe un teléfono válido (mínimo 7 dígitos).");
  return { name, email, phone };
}

/** Entrega: envio exige direccion; el costo sale de settings/store, nunca del cliente. Un carrito solo digital no tiene envio. */
export function resolveDelivery(data: unknown, hasPrints: boolean, settings: StoreSettings): { delivery: Delivery; shippingCents: number } {
  if (!hasPrints) return { delivery: { method: "retiro" }, shippingCents: 0 };
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.method === "retiro") return { delivery: { method: "retiro" }, shippingCents: 0 };
  if (d.method !== "envio") throw new CheckoutError("invalid-argument", "Elige retiro en persona o envío a domicilio.");
  const address = text(d.address, 300);
  if (!address) throw new CheckoutError("invalid-argument", "Escribe la dirección de envío.");
  const cost = typeof settings.shippingCost === "number" && settings.shippingCost > 0 ? settings.shippingCost : 0;
  return { delivery: { method: "envio", address, cost }, shippingCents: toCents(cost) };
}

/** Lo que hace falta para poner precio a las lineas. TASK-037: lo comparten el checkout de PayPal y el pedido por WhatsApp. */
export interface PricingInput {
  lines: CartInputLine[];
  /** Catalogo leido por el servidor, por productId (undefined si no existe). */
  products: Record<string, CatalogProduct | undefined>;
  /** Claves "eventId/photoId" de fotos publicas (evento publicado, visible y lista). */
  publicPhotos: Set<string>;
  /** Claves "eventId/photoId" de fotos marcadas printOnly (TASK-030): su archivo digital no se vende. */
  printOnlyPhotos?: Set<string>;
  /** Paquetes digitales activos (TASK-029). */
  packs?: CatalogPack[];
}

export interface BuildInput extends PricingInput {
  buyer: Buyer;
  deliveryInput: unknown;
  settings: StoreSettings;
}

/** TASK-029: por evento, las lineas digitales se cobran con la combinacion mas barata de paquetes + sueltas (misma funcion que el carrito). */
export function applyPacks(lines: SnapshotLine[], products: Record<string, CatalogProduct | undefined>, packs: CatalogPack[]): { packs: SnapshotPack[]; savingsCents: number } {
  const byEvent = new Map<string, SnapshotLine[]>();
  for (const l of lines) if (products[l.productId]?.kind === "digital") byEvent.set(l.eventId, [...(byEvent.get(l.eventId) ?? []), l]);
  const used: SnapshotPack[] = [];
  let savingsCents = 0;
  for (const [eventId, ls] of byEvent) {
    const r = digitalPackPricing(ls.length, packs, ls[0].unitPrice);
    savingsCents += r.savingsCents;
    for (const u of r.packs) used.push({ eventId, productId: u.pack.id, name: u.pack.name, quantity: u.pack.quantity, price: u.pack.price, times: u.times });
  }
  return { packs: used, savingsCents };
}

export const PRINT_ONLY_MESSAGE = "Una foto del carrito solo se vende impresa.";

/** Lineas con precio del catalogo y paquetes aplicados, sin envio. linesCents va a precio suelto; savingsCents es el descuento por paquetes. */
export interface PricedLines { lines: SnapshotLine[]; packs: SnapshotPack[]; linesCents: number; savingsCents: number }

/** Recalcula las lineas desde el catalogo: precio y nombre salen de ahi; digital = 1 por foto; lineas no vendibles se rechazan. */
export function priceLines(i: PricingInput): PricedLines {
  const lines: SnapshotLine[] = i.lines.map((l) => {
    const p = i.products[l.productId];
    if (!p || p.active !== true || p.kind === "pack" || typeof p.price !== "number" || !(p.price > 0)) {
      throw new CheckoutError("failed-precondition", "Un producto del carrito ya no está disponible.");
    }
    if (!i.publicPhotos.has(`${l.eventId}/${l.photoId}`)) throw new CheckoutError("failed-precondition", "Una foto del carrito ya no está disponible.");
    if (p.kind === "digital" && i.printOnlyPhotos?.has(`${l.eventId}/${l.photoId}`)) throw new CheckoutError("failed-precondition", PRINT_ONLY_MESSAGE);
    if (p.kind === "digital" && l.quantity !== 1) throw new CheckoutError("invalid-argument", "El archivo digital se compra de a uno por foto.");
    return { eventId: l.eventId, photoId: l.photoId, productId: l.productId, productName: p.name, unitPrice: p.price, quantity: l.quantity, kind: p.kind };
  });
  const linesCents = lines.reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  const { packs, savingsCents } = applyPacks(lines, i.products, i.packs ?? []);
  return { lines, packs, linesCents, savingsCents };
}

/** Snapshot del checkout de PayPal: las lineas de priceLines + la entrega (el envio sale de settings/store). */
export function buildSnapshot(i: BuildInput): CheckoutSnapshot {
  const { lines, packs, linesCents, savingsCents } = priceLines(i);
  const hasPrints = lines.some((l) => l.kind === "print");
  const { delivery, shippingCents } = resolveDelivery(i.deliveryInput, hasPrints, i.settings);
  return {
    lines,
    ...(packs.length ? { packs } : {}),
    eventIds: [...new Set(lines.map((l) => l.eventId))],
    buyer: i.buyer,
    delivery,
    totalCents: linesCents - savingsCents + shippingCents,
    currency: CURRENCY,
  };
}

/** Respuesta de PayPal a la captura (solo los campos que se leen). */
export interface PaypalCaptureResponse {
  status?: string;
  purchase_units?: { payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string } }[] } }[];
}

export interface CaptureInfo { captureId: string | null; status: string | null; value: string | null; currency: string | null }

/** Datos de la captura de PayPal para dejar constancia en checkouts/{id}. */
export function extractCapture(res: PaypalCaptureResponse): CaptureInfo {
  const cap = res.purchase_units?.[0]?.payments?.captures?.[0];
  return { captureId: cap?.id ?? null, status: cap?.status ?? null, value: cap?.amount?.value ?? null, currency: cap?.amount?.currency_code ?? null };
}

export type CaptureOutcome = "pagado" | "captura_pendiente" | "captura_no_coincide";

/** CU8: COMPLETED con monto/moneda iguales a los del servidor -> pagado; igual pero distinto monto -> no_coincide; PENDING -> pendiente (dinero retenido, sin pedido). Sin captura -> error (no se cobro nada). */
export function classifyCapture(res: PaypalCaptureResponse, snap: Pick<CheckoutSnapshot, "totalCents" | "currency">): CaptureOutcome {
  const c = extractCapture(res);
  if (c.status === "PENDING") return "captura_pendiente";
  if (res.status !== "COMPLETED" || c.status !== "COMPLETED") throw new CheckoutError("failed-precondition", "El pago no se completó.");
  return c.currency === snap.currency && c.value === centsToString(snap.totalCents) ? "pagado" : "captura_no_coincide";
}

/** CU12: el pago simulado solo existe con el emulador de Functions; en produccion se rechaza. */
export function assertSimulationAllowed(env: Record<string, string | undefined>): void {
  if (env.FUNCTIONS_EMULATOR !== "true") throw new CheckoutError("failed-precondition", "El pago simulado no está disponible.");
}

// Base32 sin 0/O/1/I/L: facil de dictar por telefono.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** Numero de pedido: 8 caracteres aleatorios, no secuencial. */
export const newOrderNumber = (): string => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Documento orders/{id} (sin createdAt, que pone el servidor). eventIds es contrato de TASK-012. */
export function buildOrderDoc(snap: CheckoutSnapshot, paypalOrderId: string, number: string) {
  return {
    number,
    status: "pagado" as const,
    lines: snap.lines,
    ...(snap.packs?.length ? { packs: snap.packs } : {}),
    eventIds: [...new Set(snap.lines.map((l) => l.eventId))],
    total: snap.totalCents / 100,
    delivery: snap.delivery,
    buyer: snap.buyer,
    paypalOrderId,
  };
}
