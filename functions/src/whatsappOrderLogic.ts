/** Logica pura del pedido por WhatsApp (TASK-037): datos del cliente, plazos, anulacion y vista publica. Sin Firebase ni red. */
import { CheckoutError } from "./checkout";
import { isDigitalLine } from "./downloadsLogic";

/** Plazo de pago: pasado esto, expireOrders anula el pedido. */
export const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Limite anti-abuso de pedidos creados, en una ventana corta. Por telefono: 5 (confirmado por el humano). Por IP real: 20,
 * porque los asistentes de un evento comparten la IP del NAT de su operadora movil.
 */
export const ORDER_RATE_MAX_PER_PHONE = 5;
export const ORDER_RATE_MAX_PER_IP = 20;
export const ORDER_RATE_WINDOW_MS = 10 * 60 * 1000;

export interface Customer { name: string; phone: string; email?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Telefono de WhatsApp -> solo digitos con codigo de pais (E.164 sin "+"), o null. Copia de normalizePhone de
 * src/whatsappLogic.ts (paridad en functions/test/whatsappOrder.test.ts): "+", espacios y guiones; 8 a 15 digitos; sin 0 inicial.
 * Ecuador: el 0 de discado nacional escrito despues del codigo ("+593 099...") se quita, wa.me no lo acepta.
 */
export function normalizePhone(input: unknown): string | null {
  const t = String(input ?? "").trim();
  if (!/^\+?[\d\s-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "").replace(/^5930/, "593");
  return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? digits : null;
}

/** Nombre y WhatsApp obligatorios; el correo, si viene, debe ser valido. Que el correo sea obligatorio (hay digitales) se decide al poner precio. */
export function parseCustomer(data: unknown): Customer {
  const c = (data ?? {}) as Record<string, unknown>;
  const name = text(c.name, 120);
  const phone = normalizePhone(c.phone);
  const email = text(c.email, 200).toLowerCase();
  if (!name) throw new CheckoutError("invalid-argument", "Escribe tu nombre.");
  if (!phone) throw new CheckoutError("invalid-argument", "Escribe tu número de WhatsApp con código de país (ej. +593 99 856 5995).");
  if (email && !EMAIL.test(email)) throw new CheckoutError("invalid-argument", "Escribe un correo válido.");
  return { name, phone, ...(email ? { email } : {}) };
}

export const EMAIL_REQUIRED = "Escribe tu correo: con él descargas tus fotos digitales.";

/** CU6: el recordatorio solo tiene sentido antes de la hora limite (despues el pedido se anula). */
export const canRemind = (o: { status?: unknown; expiresAt?: { toMillis(): number } } | undefined, nowMs: number): boolean =>
  !!o && o.status === "pendiente_pago" && typeof o.expiresAt?.toMillis === "function" && o.expiresAt.toMillis() > nowMs;

/** CU7: solo se anula lo que sigue pendiente de pago y ya vencio. Lo pagado (o cualquier otro estado) nunca. */
export const shouldExpire = (o: { status?: unknown; expiresAt?: { toMillis(): number } } | undefined, nowMs: number): boolean =>
  !!o && o.status === "pendiente_pago" && typeof o.expiresAt?.toMillis === "function" && o.expiresAt.toMillis() <= nowMs;

/** "+593 ••• ••• 995": se ven el codigo de pais aproximado y los 3 ultimos digitos. */
export function maskPhone(digits: unknown): string {
  const d = String(digits ?? "").replace(/\D/g, "");
  return d.length < 6 ? "•••" : `+${d.slice(0, 3)} ••• ••• ${d.slice(-3)}`;
}


type Millis = { toMillis(): number } | undefined;
export interface PublicOrder {
  number: string; status: string; total: number; savings: number;
  lines: { productName: string; quantity: number; unitPrice: number }[];
  packs: { name: string; times: number; price: number }[];
  createdAt: number | null; expiresAt: number | null;
  /** Solo el telefono enmascarado: ni nombre ni correo salen por esta vista publica. */
  customer: { phone: string };
  /** Hay fotos digitales: la pagina ofrece Mis descargas cuando el pedido esta pagado. */
  hasDigital: boolean;
}

/** CU9: lo que /pedido/:number puede mostrar a quien tiene el numero: estado, total, lineas, plazo y contacto enmascarado. */
export function publicOrder(d: Record<string, unknown>): PublicOrder {
  const contact = (d.customer ?? d.buyer ?? {}) as { phone?: string };
  const lines = Array.isArray(d.lines) ? d.lines as { productId: string; kind?: string; productName: string; quantity: number; unitPrice: number }[] : [];
  const packs = Array.isArray(d.packs) ? d.packs as { name: string; times: number; price: number }[] : [];
  const ms = (v: unknown) => (typeof (v as Millis)?.toMillis === "function" ? (v as { toMillis(): number }).toMillis() : null);
  return {
    number: String(d.number ?? ""),
    status: String(d.status ?? ""),
    total: Number(d.total ?? 0),
    savings: Number(d.savings ?? 0),
    lines: lines.map((l) => ({ productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice })),
    packs: packs.map((p) => ({ name: p.name, times: p.times, price: p.price })),
    createdAt: ms(d.createdAt),
    expiresAt: d.status === "pendiente_pago" ? ms(d.expiresAt) : null,
    customer: { phone: contact.phone ? maskPhone(contact.phone) : "" },
    hasDigital: lines.some((l) => isDigitalLine(l)),
  };
}
