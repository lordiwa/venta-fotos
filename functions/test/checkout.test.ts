import { describe, it, expect } from "vitest";
import {
  assertSimulationAllowed, buildOrderDoc, buildSnapshot, centsToString, CheckoutError, classifyCapture, newOrderNumber, parseBuyer, parseCartInput,
  type BuildInput, type CatalogPack, type CatalogProduct,
} from "../src/checkout";
import { capturePaypalOrder, createPaypalOrder } from "../src/paypal";
import { assertNoPrintOnlyDigital, finalizeOrder, saveCheckout, updateCheckout } from "../src/orders";

const A4: CatalogProduct = { name: "A4", kind: "print", price: 0.1, active: true };
const DIG: CatalogProduct = { name: "Digital", kind: "digital", price: 10, active: true };
const buyer = { name: "Ana", email: "a@b.co", phone: "1234567" };
const base = (over: Partial<BuildInput> = {}): BuildInput => ({
  lines: [{ eventId: "e1", photoId: "p1", productId: "a4", quantity: 3 }],
  buyer,
  deliveryInput: { method: "retiro" },
  products: { a4: A4, dig: DIG },
  publicPhotos: new Set(["e1/p1", "e1/p2", "e2/p2"]),
  settings: { shippingCost: 4.5 },
  ...over,
});
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof CheckoutError ? e.code : "other"; } return "none"; };

describe("buildSnapshot", () => {
  // Previene: cobrar de mas/menos por error de punto flotante (0.1 x 3 = 0.30000000000000004).
  it("CU7 total en centavos enteros, con precios y nombres del catalogo, no del cliente", () => {
    const s = buildSnapshot(base({ lines: [{ eventId: "e1", photoId: "p1", productId: "a4", quantity: 3, priceAtAdd: 0.01, productName: "Gratis" } as never] }));
    expect(s.totalCents).toBe(30);
    expect(s.lines[0]).toMatchObject({ productName: "A4", unitPrice: 0.1, quantity: 3 });
  });

  // Previene: cobrar sin envio o con un costo de envio elegido por el cliente.
  it("CU3/CU4 retiro sin envio; envio suma el costo de settings y exige direccion; solo digital no ofrece envio", () => {
    expect(buildSnapshot(base()).totalCents).toBe(30);
    const env = buildSnapshot(base({ deliveryInput: { method: "envio", address: "Calle 1", cost: 0 } }));
    expect(env.totalCents).toBe(480);
    expect(env.delivery).toEqual({ method: "envio", address: "Calle 1", cost: 4.5 });
    expect(code(() => buildSnapshot(base({ deliveryInput: { method: "envio", address: "  " } })))).toBe("invalid-argument");
    const dig = buildSnapshot(base({ lines: [{ eventId: "e1", photoId: "p1", productId: "dig", quantity: 1 }], deliveryInput: { method: "envio", address: "x" } }));
    expect(dig).toMatchObject({ totalCents: 1000, delivery: { method: "retiro" } });
  });

  // Previene: cobrar productos retirados o fotos ocultas, o aceptar cantidades alteradas en el cliente.
  it("CU7 rechaza producto inactivo/inexistente, foto no publica, digital x51 e impresion fuera de 1..99", () => {
    expect(code(() => buildSnapshot(base({ products: { a4: { ...A4, active: false } } })))).toBe("failed-precondition");
    expect(code(() => buildSnapshot(base({ products: {} })))).toBe("failed-precondition");
    expect(code(() => buildSnapshot(base({ publicPhotos: new Set() })))).toBe("failed-precondition");
    expect(code(() => buildSnapshot(base({ lines: [{ eventId: "e1", photoId: "p1", productId: "dig", quantity: 51 }] })))).toBe("invalid-argument");
    for (const q of [0, 100, 1.5, "3", -1, NaN]) {
      expect(code(() => parseCartInput([{ eventId: "e1", photoId: "p1", productId: "a4", quantity: q }]))).toBe("invalid-argument");
    }
    expect(code(() => parseCartInput([]))).toBe("invalid-argument");
    for (const id of [".", "..", "__x__"]) expect(code(() => parseCartInput([{ eventId: id, photoId: "p1", productId: "a4", quantity: 1 }]))).toBe("invalid-argument");
    const l = { eventId: "e1", photoId: "p1", productId: "a4", quantity: 1 };
    expect(code(() => parseCartInput([l, l]))).toBe("invalid-argument");
  });
});

describe("parseBuyer", () => {
  // Previene: pedidos sin forma de contactar al comprador.
  it("CU2 exige nombre, correo valido y telefono con 7+ digitos", () => {
    expect(parseBuyer({ name: " Ana ", email: "a@b.co", phone: "123-456 7" })).toMatchObject({ name: "Ana" });
    for (const b of [{ ...buyer, name: " " }, { ...buyer, email: "a@b" }, { ...buyer, phone: "123456" }, null]) {
      expect(code(() => parseBuyer(b))).toBe("invalid-argument");
    }
  });
});

describe("classifyCapture", () => {
  const snap = { totalCents: 1234, currency: "USD" };
  const res = (value: string, currency = "USD", status = "COMPLETED") =>
    ({ status, purchase_units: [{ payments: { captures: [{ id: "C1", status, amount: { value, currency_code: currency } }] } }] });
  // Previene: registrar como pagado un pedido cuyo cobro real no coincide con lo calculado, o perder el rastro de un cobro retenido (PENDING).
  it("CU8 pagado solo con monto/moneda iguales; distinto -> no_coincide; PENDING -> pendiente; sin captura -> error", () => {
    expect(classifyCapture(res("12.34"), snap)).toBe("pagado");
    expect(classifyCapture(res("12.00"), snap)).toBe("captura_no_coincide");
    expect(classifyCapture(res("12.34", "EUR"), snap)).toBe("captura_no_coincide");
    expect(classifyCapture(res("12.34", "USD", "PENDING"), snap)).toBe("captura_pendiente");
    expect(code(() => classifyCapture(res("12.34", "USD", "DECLINED"), snap))).toBe("failed-precondition");
    expect(code(() => classifyCapture({ status: "COMPLETED" }, snap))).toBe("failed-precondition");
    expect(centsToString(1234)).toBe("12.34");
  });
});

describe("assertSimulationAllowed", () => {
  // Previene: que en produccion cualquiera cree pedidos "pagados" sin pagar usando el modo simulado.
  it("CU12 solo con FUNCTIONS_EMULATOR === 'true'", () => {
    expect(code(() => assertSimulationAllowed({ FUNCTIONS_EMULATOR: "true" }))).toBe("none");
    for (const v of [undefined, "false", "1", ""]) expect(code(() => assertSimulationAllowed({ FUNCTIONS_EMULATOR: v }))).toBe("failed-precondition");
  });
});

describe("buildOrderDoc", () => {
  // Previene: borrar un evento con pedidos pagados (TASK-012 consulta eventIds array-contains).
  it("CU6 incluye eventIds unicos de las lineas, status pagado y paypalOrderId", () => {
    const lines = [
      { eventId: "e1", photoId: "p1", productId: "a4", quantity: 1 },
      { eventId: "e1", photoId: "p2", productId: "a4", quantity: 1 },
      { eventId: "e2", photoId: "p2", productId: "a4", quantity: 1 },
    ];
    const snap = buildSnapshot(base({ lines }));
    const doc = buildOrderDoc(snap, "PP1", "ABCD2345");
    expect(doc.eventIds.sort()).toEqual(["e1", "e2"]);
    expect(doc).toMatchObject({ status: "pagado", paypalOrderId: "PP1", number: "ABCD2345", total: 0.3, buyer });
    expect(doc.lines).toHaveLength(3);
  });
  // Previene: numeros de pedido que el comprador no puede dictar sin confundir 0/O o 1/I.
  it("numero de pedido: 8 caracteres sin ambiguos", () => {
    expect(newOrderNumber()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
  });
});

/** Firestore minimo en memoria: solo lo que usa finalizeOrder. */
function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  const db = {
    doc: (path: string) => ({
      path,
      set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => { store.set(path, o?.merge ? { ...store.get(path), ...d } : d); },
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (r: { path: string }) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
      set: (r: { path: string }, d: Record<string, unknown>) => { store.set(r.path, d); },
    }),
  };
  return { db: db as never, store };
}

describe("finalizeOrder", () => {
  // Previene: pedidos duplicados (y dos numeros) por doble clic o reintento de captura.
  it("CU10 dos capturas de la misma orden crean un unico pedido con el mismo numero", async () => {
    const { db, store } = fakeDb();
    const snap = buildSnapshot(base());
    const a = await finalizeOrder(db, "PP1", snap);
    const b = await finalizeOrder(db, "PP1", snap);
    expect(store.size).toBe(1);
    expect(b.number).toBe(a.number);
    expect(store.get("orders/PP1")).toMatchObject({ status: "pagado", eventIds: ["e1"] });
  });
});

describe("solo impresion (TASK-030)", () => {
  // Previene: cobrar el archivo digital de una foto que el fotografo marco "solo impresion" (al crear la orden o si la marco antes de capturar).
  it("createOrder rechaza la linea digital de una foto printOnly y acepta su impresion; captureOrder la rechaza si se marco despues", async () => {
    const printOnlyPhotos = new Set(["e1/p1"]);
    const digital = [{ eventId: "e1", photoId: "p1", productId: "digital", quantity: 1 }];
    expect(code(() => buildSnapshot(base({ lines: digital, products: { digital: DIG }, printOnlyPhotos })))).toBe("failed-precondition");
    expect(buildSnapshot(base({ printOnlyPhotos })).totalCents).toBe(30);
    const photo = (printOnly: unknown) => ({ getAll: async () => [{ exists: true, get: (k: string) => (k === "printOnly" ? printOnly : undefined) }], doc: (p: string) => p }) as never;
    const snap = { lines: digital.map((l) => ({ ...l, productName: "Digital", unitPrice: 10 })) };
    await expect(assertNoPrintOnlyDigital(photo(true), snap)).rejects.toThrow(CheckoutError);
    await expect(assertNoPrintOnlyDigital(photo(undefined), snap)).resolves.toBeUndefined();
    // M-2: si PayPal confirma que ya cobro, no se rechaza (seria cobro sin pedido); si no, si.
    await expect(assertNoPrintOnlyDigital(photo(true), snap, async () => true)).resolves.toBeUndefined();
    await expect(assertNoPrintOnlyDigital(photo(true), snap, async () => false)).rejects.toThrow(CheckoutError);
    // L-2: lo digital se reconoce por kind; una impresion con kind 'print' no se frena.
    expect(buildSnapshot(base({ lines: digital, products: { digital: DIG } })).lines[0].kind).toBe("digital");
    await expect(assertNoPrintOnlyDigital(photo(true), { lines: [{ ...snap.lines[0], productId: "otro", kind: "digital" as const }] })).rejects.toThrow(CheckoutError);
    await expect(assertNoPrintOnlyDigital(photo(true), { lines: [{ ...snap.lines[0], kind: "print" as const }] })).resolves.toBeUndefined();
  });
});

describe("checkouts", () => {
  // Previene: que createOrder reviente en el servidor (FieldValue mal importado) y ningun pago simulado/real pueda empezar; y perder buyer/total/estado de un cobro sin pedido.
  it("saveCheckout/updateCheckout escriben snapshot con status, buyer y total, y conservan el snapshot al actualizar", async () => {
    const { db, store } = fakeDb();
    await saveCheckout(db, "PP1", buildSnapshot(base()));
    await updateCheckout(db, "PP1", { status: "captura_pendiente" });
    expect(store.get("checkouts/PP1")).toMatchObject({ status: "captura_pendiente", buyer, totalCents: 30 });
  });
});

describe("cliente PayPal", () => {
  type Call = { url: string; init: RequestInit };
  const mock = (responses: { status: number; body: unknown }[]) => {
    const calls: Call[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = responses.shift()!;
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    }) as unknown as typeof fetch;
    return { calls, cfg: { baseUrl: "https://pp.test", clientId: "id", clientSecret: "sec", fetchFn } };
  };
  const tok = { status: 200, body: { access_token: "T" } };

  // Previene: enviar a PayPal un total distinto al calculado, o sin desglose de envio.
  it("CU7 createOrder manda a PayPal el total del servidor con item_total + shipping", async () => {
    const { calls, cfg } = mock([tok, { status: 201, body: { id: "PP9" } }]);
    const snap = buildSnapshot(base({ deliveryInput: { method: "envio", address: "x" } }));
    expect(await createPaypalOrder(cfg, snap)).toBe("PP9");
    const body = JSON.parse(calls[1].init.body as string);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toMatchObject({ value: "4.80", breakdown: { item_total: { value: "0.30" }, shipping: { value: "4.50" } } });
    expect(calls[0].init.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("id:sec").toString("base64")}` });
  });

  // Previene: que PayPal rechace la orden (items que no suman el total) o cobre sin el ahorro de paquetes; pedidos sin el desglose del descuento.
  it("TASK-029 con paquetes el total resta el ahorro y PayPal recibe el descuento que cuadra con items + envio", async () => {
    const { calls, cfg } = mock([tok, { status: 201, body: { id: "PP9" } }]);
    const pk: CatalogPack = { id: "pk2", name: "Paquete 2 fotos digitales", kind: "pack", quantity: 2, price: 15, active: true };
    const lines = ["p1", "p2"].map((photoId) => ({ eventId: "e1", photoId, productId: "dig", quantity: 1 }));
    const snap = buildSnapshot(base({ lines: [...lines, base().lines[0]], packs: [pk], deliveryInput: { method: "envio", address: "x" } }));
    expect(snap.totalCents).toBe(1500 + 30 + 450);
    expect(snap.packs).toEqual([{ eventId: "e1", productId: "pk2", name: "Paquete 2 fotos digitales", quantity: 2, price: 15, times: 1 }]);
    expect(buildOrderDoc(snap, "PP9", "N").packs).toEqual(snap.packs);
    expect(buildOrderDoc(buildSnapshot(base()), "PP9", "N")).not.toHaveProperty("packs");
    await createPaypalOrder(cfg, snap);
    const amount = JSON.parse(calls[1].init.body as string).purchase_units[0].amount;
    expect(amount).toMatchObject({ value: "19.80", breakdown: { item_total: { value: "20.30" }, shipping: { value: "4.50" }, discount: { value: "5.00" } } });
    expect(code(() => buildSnapshot(base({ lines: [{ eventId: "e1", photoId: "p1", productId: "pk2", quantity: 1 }], products: { pk2: pk } })))).toBe("failed-precondition");
  });

  // Previene: pedido pagado cuando PayPal rechazo el pago; doble cobro por reintento sin idempotencia.
  it("CU9/CU10 captura rechazada -> CheckoutError; usa PayPal-Request-Id; ya capturada -> lee la orden", async () => {
    const declined = mock([tok, { status: 422, body: { details: [{ issue: "INSTRUMENT_DECLINED" }] } }]);
    await expect(capturePaypalOrder(declined.cfg, "PP1")).rejects.toBeInstanceOf(CheckoutError);
    expect(declined.calls[1].init.headers).toMatchObject({ "PayPal-Request-Id": "PP1" });
    const again = mock([tok, { status: 422, body: { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } }, { status: 200, body: { status: "COMPLETED" } }]);
    expect(await capturePaypalOrder(again.cfg, "PP1")).toEqual({ status: "COMPLETED" });
    expect(again.calls[2].url).toBe("https://pp.test/v2/checkout/orders/PP1");
  });
});
