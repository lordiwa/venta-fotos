// Pedidos por WhatsApp (TASK-037): alta con precio del servidor, anti-abuso, anulacion a las 24 h y vista publica sin datos personales.
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { advanceOrderTx, createWhatsappOrder, expireDueOrders } from "../src/whatsappOrders";
import { maskEmail, maskPhone, normalizePhone, ORDER_RATE_MAX, ORDER_TTL_MS, parseCustomer, publicOrder, shouldExpire } from "../src/whatsappOrderLogic";
import { normalizePhone as clientNormalizePhone } from "../../src/whatsappLogic";
import { REMINDER_AFTER_MS } from "../../src/ordersLogic";

type Data = Record<string, unknown>;

/** Firestore en memoria con lo que usan whatsappOrders/loadPricing: doc, getAll, where(==, <=, in), limit, create y transacciones. */
function memDb(seed: Record<string, Data> = {}) {
  const docs = new Map<string, Data>(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  const hooks: { beforeCommit?: () => void } = {};
  const snap = (path: string) => {
    const d = docs.get(path);
    return { id: path.split("/").pop()!, exists: !!d, ref: ref(path), data: () => (d ? { ...d } : undefined), get: (k: string) => k.split(".").reduce<unknown>((o, p) => (o as Data | undefined)?.[p], d) };
  };
  const ref = (path: string): { path: string; get: () => Promise<ReturnType<typeof snap>>; create: (v: Data) => Promise<void> } => ({
    path,
    get: async () => snap(path),
    create: async (v: Data) => {
      if (docs.has(path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      docs.set(path, { ...v });
    },
  });
  const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v);
  const query = (col: string, filters: [string, string, unknown][], max = Infinity) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]], max),
    limit: (n: number) => query(col, filters, n),
    get: async () => {
      const found = [...docs.keys()].filter((k) => k.startsWith(`${col}/`) && k.split("/").length === 2).map(snap).filter((s) => filters.every(([f, op, v]) => {
        const x = ms(s.get(f));
        return op === "==" ? x === v : op === "<=" ? (x as number) <= (ms(v) as number) : op === "in" ? (v as unknown[]).includes(x) : false;
      })).slice(0, max);
      return { empty: !found.length, size: found.length, docs: found };
    },
  });
  const db = {
    doc: ref,
    collection: (c: string) => query(c, []),
    getAll: async (...refs: { path: string }[]) => refs.map((r) => snap(r.path)),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const writes: [string, Data, boolean][] = [];
      const r = await fn({
        get: async (rf: { path: string }) => snap(rf.path),
        set: (rf: { path: string }, v: Data) => { writes.push([rf.path, v, true]); },
        update: (rf: { path: string }, v: Data) => { writes.push([rf.path, v, false]); },
      });
      hooks.beforeCommit?.();
      for (const [p, v, replace] of writes) docs.set(p, replace ? { ...v } : { ...docs.get(p), ...v });
      return r;
    },
  };
  return { db: db as unknown as Firestore, docs, hooks };
}

const catalog = (): Record<string, Data> => ({
  "products/a4": { name: "A4", kind: "print", price: 2.5, active: true },
  "products/digital": { name: "Digital", kind: "digital", price: 10, active: true },
  "products/pk2": { name: "Paquete 2 fotos digitales", kind: "pack", price: 15, quantity: 2, active: true },
  "events/e1": { name: "Carrera", published: true },
  "events/e1/photos/p1": { visible: true, status: "ready" },
  "events/e1/photos/p2": { visible: true, status: "ready" },
  "events/e1/photos/p3": { visible: true, status: "ready", printOnly: true },
  "events/e1/photos/oculta": { visible: false, status: "ready" },
});
const customer = { name: "Ana Pérez", phone: "+593 99 856 5995", email: "Ana@Mail.com" };
const line = (photoId: string, productId: string, quantity = 1) => ({ eventId: "e1", photoId, productId, quantity });
const codeOf = async (p: Promise<unknown>) => p.then(() => "none", (e: { code?: string }) => e.code ?? "other");

describe("pedido por WhatsApp", () => {
  // Previene: cobrar lo que el cliente diga (total, precio) o crear pedidos sin paquetes aplicados, con fotos ocultas o "solo impresion" en digital.
  it("CU2/CU3 recalcula lineas, paquetes y total desde el catalogo y guarda pendiente_pago con expiresAt = createdAt + 24 h", async () => {
    const { db, docs } = memDb(catalog());
    const now = Date.UTC(2026, 9, 21, 15);
    const res = await createWhatsappOrder(db, { lines: [{ ...line("p1", "digital"), unitPrice: 0.01, total: 0 }, line("p2", "digital"), line("p3", "a4", 2)], customer }, "1.1.1.1", now);
    expect(res).toMatchObject({ total: 20, savings: 5, expiresAt: now + ORDER_TTL_MS });
    const doc = docs.get(`orders/WA-${res.number}`)!;
    expect(doc).toMatchObject({ status: "pendiente_pago", channel: "whatsapp", total: 20, number: res.number, customer: { name: "Ana Pérez", phone: "593998565995", email: "ana@mail.com" } });
    expect((doc.expiresAt as Timestamp).toMillis() - (doc.createdAt as Timestamp).toMillis()).toBe(ORDER_TTL_MS);
    expect((doc.packs as { productId: string }[]).map((p) => p.productId)).toEqual(["pk2"]);
    const bad: [unknown[], string][] = [[[], "invalid-argument"], [Array(101).fill(line("p1", "a4")), "invalid-argument"], [[line("oculta", "a4")], "failed-precondition"], [[line("p3", "digital")], "failed-precondition"], [[line("p1", "nada")], "failed-precondition"]];
    for (const [lines, code] of bad) expect(await codeOf(createWhatsappOrder(memDb(catalog()).db, { lines, customer }, "2.2.2.2", now))).toBe(code);
  });

  // Previene: un pedido digital sin correo (no podria descargar) o pedir el correo a quien solo compra impresas.
  it("CU1 nombre y WhatsApp con codigo de pais obligatorios; correo solo si hay digitales; mismo telefono valido que el cliente", async () => {
    expect(() => parseCustomer({ name: "", phone: "+593998565995" })).toThrow();
    for (const phone of ["0998565995", "abc", "+59", ""]) expect(() => parseCustomer({ name: "A", phone })).toThrow();
    expect(parseCustomer({ name: " A ", phone: "+593 99-856-5995" })).toEqual({ name: "A", phone: "593998565995" });
    for (const v of ["+593998565995", "0998565995", "+1 (555) 123", "12-34 5678", undefined]) expect(normalizePhone(v)).toBe(clientNormalizePhone(v));
    const now = Date.now();
    const noMail = { name: "Ana", phone: "+593998565995" };
    expect(await codeOf(createWhatsappOrder(memDb(catalog()).db, { lines: [line("p1", "digital")], customer: noMail }, "3.3.3.3", now))).toBe("invalid-argument");
    expect(await codeOf(createWhatsappOrder(memDb(catalog()).db, { lines: [line("p1", "a4")], customer: noMail }, "3.3.3.3", now))).toBe("none");
  });

  // Previene: que un bot llene la coleccion de pedidos falsos desde una IP o con un mismo telefono.
  it("CU10 limita los pedidos por IP y por telefono dentro de la ventana", async () => {
    const { db } = memDb(catalog());
    const now = Date.now();
    const order = (ip: string, phone: string) => createWhatsappOrder(db, { lines: [line("p1", "a4")], customer: { name: "A", phone } }, ip, now);
    for (let i = 0; i < ORDER_RATE_MAX; i++) await order("9.9.9.9", `+59399000000${i}`);
    expect(await codeOf(order("9.9.9.9", "+593991111111"))).toBe("resource-exhausted"); // misma IP
    for (let i = 0; i < ORDER_RATE_MAX; i++) await order(`8.8.8.${i}`, "+593992222222");
    expect(await codeOf(order("8.8.8.99", "+593992222222"))).toBe("resource-exhausted"); // mismo telefono
    expect(await codeOf(order("7.7.7.7", "+593993333333"))).toBe("none");
  });

  // Previene: anular un pedido ya pagado (cliente que pago y pierde su pedido) o anular dos veces.
  it("CU7 anula solo pendiente_pago vencidos, relee en la transaccion (gana el pago) y es idempotente", async () => {
    const now = Date.UTC(2026, 9, 22, 15);
    const ts = (h: number) => Timestamp.fromMillis(now + h * 3600000);
    const { db, docs } = memDb({
      "orders/WA-A": { status: "pendiente_pago", expiresAt: ts(-1) },
      "orders/WA-B": { status: "pendiente_pago", expiresAt: ts(1) },
      "orders/WA-C": { status: "pagado", expiresAt: ts(-5) },
      "orders/WA-D": { status: "pendiente_pago", expiresAt: ts(-2) },
    });
    // El admin marca D como pagado entre la consulta y la transaccion de la anulacion.
    const origTx = db.runTransaction.bind(db);
    let first = true;
    (db as unknown as { runTransaction: typeof origTx }).runTransaction = (async (fn: never) => {
      if (first) { first = false; docs.set("orders/WA-D", { ...docs.get("orders/WA-D"), status: "pagado" }); }
      return origTx(fn);
    }) as typeof origTx;
    expect((await expireDueOrders(db, now)).sort()).toEqual(["WA-A"]);
    expect(docs.get("orders/WA-A")).toMatchObject({ status: "anulado" });
    expect(docs.get("orders/WA-B")!.status).toBe("pendiente_pago");
    expect(docs.get("orders/WA-C")!.status).toBe("pagado");
    expect(docs.get("orders/WA-D")!.status).toBe("pagado");
    expect(await expireDueOrders(db, now)).toEqual([]);
    expect(shouldExpire({ status: "pendiente_pago", expiresAt: ts(0) }, now)).toBe(true);
    expect(REMINDER_AFTER_MS * 2).toBe(ORDER_TTL_MS); // CU6: el panel marca "recordar pago" a la mitad del plazo que anula
    expect(shouldExpire({ status: "pendiente_pago" }, now)).toBe(false);
    // Y al reves: si ya se anulo, marcar pagado con la pantalla vieja se rechaza.
    expect(await codeOf(advanceOrderTx(db, "WA-A", "pendiente_pago", "pagado", "admin"))).toBe("failed-precondition");
  });

  // Previene: que cualquiera con el numero de pedido lea el telefono o el correo completos del cliente.
  it("CU9 la vista publica enmascara telefono y correo y solo da plazo si sigue pendiente", () => {
    const base = {
      number: "ABCD2345", status: "pendiente_pago", total: 20, savings: 5, createdAt: Timestamp.fromMillis(1000), expiresAt: Timestamp.fromMillis(2000),
      customer: { name: "Ana Pérez", phone: "593998565995", email: "ana@mail.com" },
      lines: [{ eventId: "e1", photoId: "p1", productId: "digital", kind: "digital", productName: "Digital", unitPrice: 10, quantity: 1 }],
    };
    const pub = publicOrder(base);
    expect(pub).toMatchObject({ number: "ABCD2345", status: "pendiente_pago", total: 20, expiresAt: 2000, hasDigital: true, customer: { name: "Ana" } });
    const json = JSON.stringify(pub);
    for (const secret of ["593998565995", "998565995", "ana@mail.com", "Pérez", "p1", "e1"]) expect(json).not.toContain(secret);
    expect(maskPhone("593998565995")).toBe("+593 ••• ••• 995");
    expect(maskEmail("ana@mail.com")).toBe("a•••@mail.com");
    expect(publicOrder({ ...base, status: "anulado" }).expiresAt).toBeNull();
  });
});
