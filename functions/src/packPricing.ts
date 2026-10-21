/** Precio de paquetes digitales (TASK-029). Copia de src/packPricing.ts: la paridad se verifica en src/packPricing.test.ts. Sin Firebase. */

/** quantity es opcional porque viene de un documento de products; sin cantidad valida el paquete se ignora. */
export interface PackLike { quantity?: number; price: number }
export interface PackUse<P> { pack: P; times: number }
export interface PackPricing<P> {
  /** Paquetes usados (por cantidad ascendente) y cuantas veces cada uno. */
  packs: PackUse<P & { quantity: number }>[];
  /** Fotos cobradas al precio suelto. */
  singles: number;
  totalCents: number;
  /** Ahorro frente a cobrar todas sueltas (nunca negativo). */
  savingsCents: number;
}

export const MAX_PACK_QUANTITY = 100;
const toCents = (n: number) => Math.round(n * 100);
const validPack = (p: PackLike): p is PackLike & { quantity: number } =>
  typeof p.quantity === "number" && Number.isInteger(p.quantity) && p.quantity >= 2 && p.quantity <= MAX_PACK_QUANTITY && typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0;

/**
 * Combinacion de costo minimo para `count` fotos digitales de UN evento: paquetes de cantidad exacta + sueltas a `unitPrice`.
 * Programacion dinamica sobre la cantidad (centavos enteros). Un paquete nunca cubre mas fotos de las que hay.
 * A igual costo gana la suelta y luego el paquete mas chico: el desglose es determinista en cliente y servidor.
 */
export function digitalPackPricing<P extends PackLike>(count: number, packs: P[], unitPrice: number): PackPricing<P> {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const unit = toCents(unitPrice);
  const usable = packs.filter((p): p is P & { quantity: number } => validPack(p) && p.quantity <= n).sort((a, b) => a.quantity - b.quantity || a.price - b.price);
  // best[k]: costo minimo de k fotos; last[k]: paquete con el que termina (-1 = suelta).
  const best = [0];
  const last = [-1];
  for (let k = 1; k <= n; k++) {
    best[k] = best[k - 1] + unit;
    last[k] = -1;
    usable.forEach((p, i) => {
      if (p.quantity > k) return;
      const c = best[k - p.quantity] + toCents(p.price);
      if (c < best[k]) { best[k] = c; last[k] = i; }
    });
  }
  const times = usable.map(() => 0);
  let singles = 0;
  for (let k = n; k > 0;) {
    const i = last[k];
    if (i < 0) { singles++; k--; } else { times[i]++; k -= usable[i].quantity; }
  }
  return {
    packs: usable.map((pack, i) => ({ pack, times: times[i] })).filter((u) => u.times > 0),
    singles,
    totalCents: best[n],
    savingsCents: n * unit - best[n],
  };
}
