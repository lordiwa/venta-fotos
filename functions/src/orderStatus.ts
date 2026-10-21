/** Maquina de estados de pedidos (TASK-018, TASK-037). Copia de src/ordersLogic.ts: la paridad se verifica en src/ordersLogic.test.ts. Sin Firebase. */

/**
 * Pedidos de PayPal (sin `channel`): pagado -> impreso -> listo_retiro | enviado -> entregado.
 * Pedidos por WhatsApp (TASK-037, channel "whatsapp"): pendiente_pago -> pagado -> en_preparacion -> entregado;
 * pendiente_pago o pagado -> cancelado (admin); pendiente_pago vencido -> anulado (solo la Function expireOrders).
 */
export type OrderStatus =
  | "pendiente_pago" | "pagado" | "en_preparacion" | "impreso" | "listo_retiro" | "enviado" | "entregado" | "cancelado" | "anulado";
export interface OrderLike { status: string; channel?: string; delivery?: { method: string }; lines: { productId: string }[] }

/** Id fijo del producto digital (ver DIGITAL_ID en src/productsLogic.ts). */
export const DIGITAL_ID = "digital";

export class AdvanceError extends Error {}

const WHATSAPP_NEXT: Record<string, OrderStatus | undefined> = { pendiente_pago: "pagado", pagado: "en_preparacion", en_preparacion: "entregado" };
const CANCELABLE = ["pendiente_pago", "pagado"];

/** Siguiente estado del flujo normal, o null si el pedido ya esta cerrado. PayPal solo digital: pagado -> entregado (nada que imprimir). */
export function nextStatus(o: OrderLike): OrderStatus | null {
  if (o.channel === "whatsapp") return WHATSAPP_NEXT[o.status] ?? null;
  switch (o.status) {
    case "pagado": return o.lines.some((l) => l.productId !== DIGITAL_ID) ? "impreso" : "entregado";
    case "impreso": return o.delivery?.method === "envio" ? "enviado" : "listo_retiro";
    case "listo_retiro":
    case "enviado": return "entregado";
    default: return null;
  }
}

/** Estados a los que el admin puede llevar el pedido: el siguiente y, en los de WhatsApp sin entregar, cancelado. Nunca anulado. */
export function allowedTransitions(o: OrderLike): OrderStatus[] {
  const next = nextStatus(o);
  return [...(next ? [next] : []), ...(o.channel === "whatsapp" && CANCELABLE.includes(o.status) ? ["cancelado" as const] : [])];
}

/**
 * Valida un cambio pedido por el admin. `from` es el estado que el admin veia (evita saltar dos pasos con un doble clic o
 * pantalla vieja, y que un pago marcado gane a una anulacion ya hecha). `to` ausente = el siguiente (pantallas anteriores a TASK-037).
 */
export function planAdvance(o: OrderLike, from: unknown, to?: unknown): OrderStatus {
  if (o.status !== from) throw new AdvanceError("El pedido ya cambió de estado. Recarga la lista.");
  const allowed = allowedTransitions(o);
  if (!allowed.length) throw new AdvanceError(o.status === "entregado" ? "El pedido ya está entregado." : "El pedido ya está cerrado.");
  if (to === undefined) {
    const next = nextStatus(o);
    if (!next) throw new AdvanceError("El pedido ya está cerrado.");
    return next;
  }
  if (!allowed.includes(to as OrderStatus)) throw new AdvanceError("Ese cambio de estado no está permitido.");
  return to as OrderStatus;
}

/** Solo el claim admin === true (booleano estricto) autoriza; "true", 1 o la ausencia del claim no. */
export const isAdmin = (auth: { token?: object } | null | undefined): boolean => (auth?.token as { admin?: unknown } | undefined)?.admin === true;
