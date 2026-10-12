/** Maquina de estados de pedidos (TASK-018). Copia de src/ordersLogic.ts: la paridad se verifica en src/ordersLogic.test.ts. Sin Firebase. */

export type OrderStatus = "pagado" | "impreso" | "listo_retiro" | "enviado" | "entregado";
export interface OrderLike { status: string; delivery: { method: string }; lines: { productId: string }[] }

/** Id fijo del producto digital (ver DIGITAL_ID en src/productsLogic.ts). */
export const DIGITAL_ID = "digital";

export class AdvanceError extends Error {}

/** Siguiente estado valido, o null si ya esta entregado. Solo digital: pagado -> entregado (nada que imprimir). */
export function nextStatus(o: OrderLike): OrderStatus | null {
  switch (o.status) {
    case "pagado": return o.lines.some((l) => l.productId !== DIGITAL_ID) ? "impreso" : "entregado";
    case "impreso": return o.delivery.method === "envio" ? "enviado" : "listo_retiro";
    case "listo_retiro":
    case "enviado": return "entregado";
    default: return null;
  }
}

/** Valida un avance pedido por el admin: `from` es el estado que el admin veia (evita saltar dos pasos con un doble clic o pantalla vieja). */
export function planAdvance(o: OrderLike, from: unknown): OrderStatus {
  if (o.status !== from) throw new AdvanceError("El pedido ya cambió de estado. Recarga la lista.");
  const next = nextStatus(o);
  if (!next) throw new AdvanceError("El pedido ya está entregado.");
  return next;
}

/** Solo el claim admin === true (booleano estricto) autoriza; "true", 1 o la ausencia del claim no. */
export const isAdmin = (auth: { token?: object } | null | undefined): boolean => (auth?.token as { admin?: unknown } | undefined)?.admin === true;
