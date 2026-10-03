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
    await db.doc("settings/store").set({ watermarkText: "PRUEBA" });
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
      thumbPath: `thumbs/${EVENT}/good.jpg`, previewPath: `previews/${EVENT}/good.jpg`,
    });
    const [prev] = await bucket.file(good!.previewPath).download();
    expect((await sharp(prev).metadata()).width).toBe(1600);
    expect((await bucket.file(good!.thumbPath).exists())[0]).toBe(true);

    await db.doc(`events/${EVENT}/photos/good`).delete();
    await waitFor(async () => {
      const gone = await Promise.all(
        [`originals/${EVENT}/good.jpg`, `previews/${EVENT}/good.jpg`, `thumbs/${EVENT}/good.jpg`].map(async (p) => !(await bucket.file(p).exists())[0]),
      );
      return gone.every(Boolean) || undefined;
    });
  }, 120000);
});
