// Requiere emuladores Functions+Firestore+Storage: npm run test:functions:integration (desde la raiz).
import { describe, it, expect, beforeAll } from "vitest";
import * as admin from "firebase-admin";
import sharp from "sharp";

const EVENT = "ev1";
const BUCKET = "demo-venta-fotos.appspot.com";

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 60000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout esperando el estado esperado");
    await new Promise((r) => setTimeout(r, 400));
  }
}

describe("pipeline de fotos (emuladores)", () => {
  beforeAll(() => {
    admin.initializeApp({ projectId: "demo-venta-fotos", storageBucket: BUCKET });
  });

  // Previene: fotos que quedan "procesando" para siempre, un archivo dañado que bloquea a las demas,
  // o archivos huerfanos (original/preview/thumb) al borrar una foto.
  it("CU4/CU5/CU6/CU8 subir -> ready con thumb+preview; dañado -> error sin afectar; borrar doc limpia los 3 archivos", async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    await db.doc(`events/${EVENT}`).set({ name: "E", date: admin.firestore.Timestamp.now(), published: false });
    const jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
    const save = (name: string, buf: Buffer) =>
      bucket.file(`originals/${EVENT}/${name}.jpg`).save(buf, { contentType: "image/jpeg", metadata: { metadata: { originalName: `${name}.jpg` } } });
    await save("bad", Buffer.from("no soy una imagen"));
    await save("good", jpeg);

    const status = (id: string) => async () => {
      const d = await db.doc(`events/${EVENT}/photos/${id}`).get();
      return d.exists && ["ready", "error"].includes(d.get("status")) ? d.data() : undefined;
    };
    const good = await waitFor(status("good"));
    const bad = await waitFor(status("bad"));
    expect(bad).toMatchObject({ status: "error", visible: true });
    expect(good).toMatchObject({
      status: "ready", visible: true, name: "good.jpg", width: 2400, height: 1600,
    });
    // TASK-033: webp versionado con cache largo
    expect(good!.thumbPath).toMatch(/^thumbs\/ev1\/good\.[0-9a-f]{12}\.webp$/);
    expect(good!.previewPath).toMatch(/^previews\/ev1\/good\.[0-9a-f]{12}\.webp$/);
    const [meta] = await bucket.file(good!.thumbPath).getMetadata();
    expect(meta).toMatchObject({ contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
    const [prev] = await bucket.file(good!.previewPath).download();
    expect((await sharp(prev).metadata()).width).toBe(1600);
    expect((await bucket.file(good!.thumbPath).exists())[0]).toBe(true);

    await db.doc(`events/${EVENT}/photos/good`).delete();
    await waitFor(async () => {
      const gone = await Promise.all(
        [`originals/${EVENT}/good.jpg`, good!.previewPath, good!.thumbPath].map(async (p) => !(await bucket.file(p).exists())[0]),
      );
      return gone.every(Boolean) || undefined;
    });
  }, 120000);
});

describe("checkout simulado (emuladores)", () => {
  const call = async (name: string, data: unknown) => {
    const res = await fetch(`http://127.0.0.1:5101/demo-venta-fotos/southamerica-east1/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
    });
    return (await res.json()) as { result?: any; error?: { message: string } };
  };

  // Previene: que el pago simulado falle en el servidor real (p.ej. imports de admin) o duplique pedidos al capturar dos veces.
  it("CU12/CU10 createOrder simulado -> captureOrder x2 crea un unico pedido pagado con eventIds", async () => {
    const db = admin.firestore();
    await db.doc("events/evc").set({ name: "E", date: admin.firestore.Timestamp.now(), published: true });
    await db.doc("events/evc/photos/p1").set({ visible: true, status: "ready" });
    await db.doc("events/evc/photos/p2").set({ visible: true, status: "ready" });
    await db.doc("products/a4c").set({ name: "A4", kind: "print", price: 5, active: true });
    // TASK-029: 2 digitales del mismo evento con un paquete de 2 activo = 4.00 en vez de 6.00.
    await db.doc("products/digital").set({ name: "Digital", kind: "digital", price: 3, active: true });
    await db.doc("products/pk2").set({ name: "Paquete 2 fotos digitales", kind: "pack", quantity: 2, price: 4, active: true });
    await db.doc("settings/store").set({ shippingCost: 3 }, { merge: true });
    const created = await call("createOrder", {
      simulated: true,
      lines: [{ eventId: "evc", photoId: "p1", productId: "a4c", quantity: 2 }, ...["p1", "p2"].map((photoId) => ({ eventId: "evc", photoId, productId: "digital", quantity: 1 }))],
      buyer: { name: "Ana", email: "a@b.co", phone: "1234567" },
      delivery: { method: "envio", address: "Calle 1" },
    });
    expect(created.error).toBeUndefined();
    const id = created.result.paypalOrderId as string;
    expect(id).toMatch(/^SIMULADO-/);
    const a = await call("captureOrder", { paypalOrderId: id });
    const b = await call("captureOrder", { paypalOrderId: id });
    expect(a.result.number).toBe(b.result.number);
    expect(a.result.total).toBe(17);
    expect(a.result.packs).toMatchObject([{ eventId: "evc", productId: "pk2", times: 1 }]); // M-1: el recibo explica el descuento
    const orders = await db.collection("orders").where("paypalOrderId", "==", id).get();
    expect(orders.size).toBe(1);
    expect(orders.docs[0].data()).toMatchObject({ status: "pagado", eventIds: ["evc"], total: 17, packs: [{ eventId: "evc", productId: "pk2", times: 1 }] });
  }, 60000);
});

describe("descargas digitales (emuladores)", () => {
  const call = async (name: string, data: unknown) => {
    const res = await fetch(`http://127.0.0.1:5101/demo-venta-fotos/southamerica-east1/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
    });
    return (await res.json()) as { result?: any; error?: { status: string; message: string } };
  };

  // Previene: entregar el original a quien no es el comprador, o no entregarlo al comprador (CU4/CU5/CU6/CU8).
  it("CU8 pedido simulado con digital -> enlaces con numero+correo; correo o numero erroneos -> mismo error; impresion sola -> sin archivos", async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    await db.doc("events/evd").set({ name: "E", date: admin.firestore.Timestamp.now(), published: true });
    // El original es un JPEG valido: subirlo dispara processPhoto, que crea el doc de la foto y lo deja "ready" (con bytes no validos lo dejaria en "error" y createOrder rechazaria la linea).
    const original = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
    await bucket.file("originals/evd/p1.jpg").save(original, { contentType: "image/jpeg", metadata: { metadata: { originalName: "p1.jpg" } } });
    await waitFor(async () => (await db.doc("events/evd/photos/p1").get()).get("status") === "ready" || undefined);
    await db.doc("products/digital").set({ name: "Digital", kind: "digital", price: 10, active: true });
    await db.doc("products/a4d").set({ name: "A4", kind: "print", price: 5, active: true });
    const buyer = { name: "Ana", email: "Ana@Mail.com", phone: "1234567" };
    const order = async (productId: string) => {
      const c = await call("createOrder", { simulated: true, lines: [{ eventId: "evd", photoId: "p1", productId, quantity: 1 }], buyer, delivery: { method: "retiro" } });
      return (await call("captureOrder", { paypalOrderId: c.result.paypalOrderId })).result.number as string;
    };
    const digital = await order("digital");
    const ok = await call("getDownloadLinks", { number: digital.toLowerCase(), email: " ana@mail.COM " });
    expect(ok.result.files).toHaveLength(1);
    expect(ok.result.files[0].expiresAt).toBeGreaterThan(Date.now());
    const dl = await fetch(ok.result.files[0].url);
    expect(Buffer.from(await dl.arrayBuffer()).equals(original)).toBe(true);
    const badEmail = await call("getDownloadLinks", { number: digital, email: "otro@mail.com" });
    const badNumber = await call("getDownloadLinks", { number: "ZZZZZZZZ", email: "ana@mail.com" });
    expect(badEmail.error).toMatchObject({ status: "NOT_FOUND" });
    expect(badNumber.error).toEqual(badEmail.error);
    const printOnly = await call("getDownloadLinks", { number: await order("a4d"), email: "ana@mail.com" });
    expect(printOnly.result.files).toEqual([]);
    // TASK-030: marcada "solo impresion" despues de la compra, quien ya pago conserva la descarga.
    await db.doc("events/evd/photos/p1").update({ printOnly: true });
    const afterPrintOnly = await call("getDownloadLinks", { number: digital, email: "ana@mail.com" });
    expect(afterPrintOnly.result.files).toHaveLength(1);
  }, 60000);
});
