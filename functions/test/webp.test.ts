// TASK-033: derivados WebP versionados (publicacion, limpieza y plan del backfill) con los dobles de test/fakes.ts.
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { deletePhotoFiles, processOriginal, publishDerivatives } from "../src/process";
import { CACHE_CONTROL, isDerivedPath, legacyToDelete, needsWebp } from "../src/derived";
import { WATERMARK_VERSION, watermarkVersion } from "../src/watermark";
import { fakes } from "./fakes";

let original: Buffer;
beforeAll(async () => {
  original = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
});

const legacy = { status: "ready", visible: true, originalPath: "originals/e/p.jpg", thumbPath: "thumbs/e/p.jpg", previewPath: "previews/e/p.jpg" };

function seed() {
  const f = fakes();
  f.set("events/e", { name: "E" });
  f.set("events/e/photos/p", legacy);
  f.files.set("originals/e/p.jpg", { gen: 1, buf: original });
  f.files.set("thumbs/e/p.jpg", { gen: 2, buf: original });
  f.files.set("previews/e/p.jpg", { gen: 3, buf: original });
  return f;
}

describe("publishDerivatives (TASK-033)", () => {
  // Previene: que el documento apunte a un JPEG ya borrado (miniatura rota) o que el .webp se sirva sin cache o con
  // una ruta fija (cache immutable de un ano sobre contenido que cambia).
  it("sube webp versionado con cache largo, publica en el documento y recien despues borra los .jpg", async () => {
    const f = seed();
    const seenAtDelete: unknown[] = [];
    f.hooks.beforeDelete = (name) => { seenAtDelete.push([name, f.docs.get("events/e/photos/p")!.data.thumbPath]); };
    expect(await processOriginal(f.db, f.bucket, "originals/e/p.jpg")).toBe("ready");
    const doc = f.docs.get("events/e/photos/p")!.data;
    expect(doc).toMatchObject({ status: "ready", width: 800, height: 600, watermarkVersion: WATERMARK_VERSION });
    expect(isDerivedPath(doc.thumbPath, "thumbs", "e", "p") && isDerivedPath(doc.previewPath, "previews", "e", "p")).toBe(true);
    for (const p of [doc.thumbPath, doc.previewPath] as string[]) {
      expect(f.files.get(p)!.opts).toMatchObject({ contentType: "image/webp", metadata: { cacheControl: CACHE_CONTROL } });
      expect((await sharp(f.files.get(p)!.buf).metadata()).format).toBe("webp");
    }
    expect(f.files.has("thumbs/e/p.jpg") || f.files.has("previews/e/p.jpg")).toBe(false);
    expect(seenAtDelete).toEqual([["thumbs/e/p.jpg", doc.thumbPath], ["previews/e/p.jpg", doc.thumbPath]]);
  });

  // Previene: que el backfill pise una foto reprocesada mientras convertia, o (R-3) que al no publicar borre por nombre
  // una ruta webp que otra escritura con el mismo contenido acaba de publicar (miniatura rota para siempre).
  it("si la condicion releida no se cumple no publica ni borra nada: la ruta compartida sobrevive", async () => {
    const f = seed();
    let other: Record<string, unknown> = {};
    const reject = (cur: Record<string, unknown>) => {
      // otro reproceso con el mismo contenido ya publico las mismas rutas (y cambio algo que la condicion mira)
      other = { ...cur, originalPath: "originals/e/p.png", thumbPath: [...f.files.keys()].find((n) => n.startsWith("thumbs/e/p.") && n.endsWith(".webp")) };
      f.write("events/e/photos/p", other);
      return false;
    };
    expect(await publishDerivatives(f.db, f.bucket, "e", "p", original, undefined, reject)).toBe(false);
    expect(f.docs.get("events/e/photos/p")!.data).toEqual(other);
    expect(f.files.has(other.thumbPath as string)).toBe(true);
    expect(f.files.has("thumbs/e/p.jpg") && f.files.has("previews/e/p.jpg")).toBe(true);
  });

  // Previene (R-2): que un fallo transitorio al borrar el .jpg reemplazado marque como "error" una foto ya publicada.
  it("si falla el borrado de lo reemplazado la foto queda lista con las rutas nuevas", async () => {
    const f = seed();
    f.faults.failDelete = "thumbs/e/p.jpg";
    expect(await processOriginal(f.db, f.bucket, "originals/e/p.jpg")).toBe("ready");
    const doc = f.docs.get("events/e/photos/p")!.data;
    expect(doc.status).toBe("ready");
    expect(isDerivedPath(doc.thumbPath, "thumbs", "e", "p") && f.files.has(doc.thumbPath as string)).toBe(true);
    expect(f.files.has("previews/e/p.jpg")).toBe(false);
  });

  // Previene (TASK-035): que el backfill deje vistas previas con la marca vieja (sin version o de otra variante), o
  // que al regenerarlas toque el original o borre la miniatura que sigue en uso (mismo contenido, misma ruta).
  it("TASK-035 regenera la vista previa con marca vieja: original intacto, miniatura igual, preview vieja borrada", async () => {
    const webp = { ...legacy, thumbPath: "thumbs/e/p.0123456789ab.webp", previewPath: "previews/e/p.0123456789ab.webp" };
    expect(needsWebp(webp, "e", "p")).toBe(true); // sin watermarkVersion (marca de texto)
    const other = watermarkVersion(WATERMARK_VERSION.includes("light") ? "dark" : "light");
    expect(needsWebp({ ...webp, watermarkVersion: other }, "e", "p")).toBe(true);

    const f = seed();
    expect(await processOriginal(f.db, f.bucket, "originals/e/p.jpg")).toBe("ready");
    const first = { ...f.docs.get("events/e/photos/p")!.data };
    f.write("events/e/photos/p", { watermarkVersion: other, previewPath: "previews/e/p.0123456789ab.webp" });
    f.files.set("previews/e/p.0123456789ab.webp", { gen: 9, buf: original });
    const orig = f.files.get("originals/e/p.jpg")!;
    expect(await publishDerivatives(f.db, f.bucket, "e", "p", original, undefined, (cur) => cur.originalPath === "originals/e/p.jpg")).toBe(true);
    const doc = f.docs.get("events/e/photos/p")!.data;
    expect(doc).toMatchObject({ watermarkVersion: WATERMARK_VERSION, thumbPath: first.thumbPath, previewPath: first.previewPath });
    expect(needsWebp(doc, "e", "p")).toBe(false); // idempotente: una segunda corrida la salta
    expect(f.files.has("previews/e/p.0123456789ab.webp")).toBe(false);
    expect(f.files.has(first.thumbPath as string)).toBe(true);
    expect(f.files.get("originals/e/p.jpg")).toBe(orig);
  });
});

describe("deletePhotoFiles (TASK-033)", () => {
  // Previene: archivos publicos huerfanos (jpg viejo o alguna version webp) tras borrar la foto, o borrar los de otra
  // foto cuyo id empieza igual.
  it("borra original, .jpg viejos y toda version webp de la foto; no toca otra foto", async () => {
    const f = fakes();
    const names = ["originals/e/p.jpg", "thumbs/e/p.jpg", "thumbs/e/p.0123456789ab.webp", "previews/e/p.0123456789ab.webp",
      "previews/e/p.jpg", "covers/e/p.jpg", "covers/e/p.ffffffffffff.webp", "thumbs/e/p2.jpg", "covers/e/p2.0123456789ab.webp"];
    for (const n of names) f.files.set(n, { gen: 1, buf: original });
    await deletePhotoFiles(f.bucket, "e", "p");
    expect([...f.files.keys()].sort()).toEqual(["covers/e/p2.0123456789ab.webp", "thumbs/e/p2.jpg"]);
  });

  // Previene (TASK-035): que el backfill deje vistas previas con la marca vieja (sin version o de otra variante), o
  // que al regenerarlas toque el original o borre la miniatura que sigue en uso (mismo contenido, misma ruta).
  it("TASK-035 regenera la vista previa con marca vieja: original intacto, miniatura igual, preview vieja borrada", async () => {
    const webp = { ...legacy, thumbPath: "thumbs/e/p.0123456789ab.webp", previewPath: "previews/e/p.0123456789ab.webp" };
    expect(needsWebp(webp, "e", "p")).toBe(true); // sin watermarkVersion (marca de texto)
    const other = watermarkVersion(WATERMARK_VERSION.includes("light") ? "dark" : "light");
    expect(needsWebp({ ...webp, watermarkVersion: other }, "e", "p")).toBe(true);

    const f = seed();
    expect(await processOriginal(f.db, f.bucket, "originals/e/p.jpg")).toBe("ready");
    const first = { ...f.docs.get("events/e/photos/p")!.data };
    f.write("events/e/photos/p", { watermarkVersion: other, previewPath: "previews/e/p.0123456789ab.webp" });
    f.files.set("previews/e/p.0123456789ab.webp", { gen: 9, buf: original });
    const orig = f.files.get("originals/e/p.jpg")!;
    expect(await publishDerivatives(f.db, f.bucket, "e", "p", original, undefined, (cur) => cur.originalPath === "originals/e/p.jpg")).toBe(true);
    const doc = f.docs.get("events/e/photos/p")!.data;
    expect(doc).toMatchObject({ watermarkVersion: WATERMARK_VERSION, thumbPath: first.thumbPath, previewPath: first.previewPath });
    expect(needsWebp(doc, "e", "p")).toBe(false); // idempotente: una segunda corrida la salta
    expect(f.files.has("previews/e/p.0123456789ab.webp")).toBe(false);
    expect(f.files.has(first.thumbPath as string)).toBe(true);
    expect(f.files.get("originals/e/p.jpg")).toBe(orig);
  });
});

describe("plan del backfill (TASK-033)", () => {
  // Previene: un backfill no idempotente (reconvierte lo ya convertido), que convierta fotos sin original o no listas,
  // o que borre un .jpg que algun documento todavia usa.
  it("convierte solo fotos listas sin webp versionado; borra solo .jpg sin referencia", () => {
    const webp = { ...legacy, thumbPath: "thumbs/e/p.0123456789ab.webp", previewPath: "previews/e/p.0123456789ab.webp", watermarkVersion: WATERMARK_VERSION };
    expect(needsWebp(legacy, "e", "p")).toBe(true);
    expect(needsWebp({ ...webp, previewPath: "previews/e/p.jpg" }, "e", "p")).toBe(true);
    expect(needsWebp(webp, "e", "p")).toBe(false);
    expect(needsWebp({ ...webp, thumbPath: "thumbs/e/otra.0123456789ab.webp" }, "e", "p")).toBe(true); // ruta ajena
    expect(needsWebp({ ...legacy, status: "error" }, "e", "p")).toBe(false);
    expect(needsWebp({ ...legacy, originalPath: undefined }, "e", "p")).toBe(false);
    const names = ["thumbs/e/a.jpg", "thumbs/e/b.jpg", "previews/e/b.0123456789ab.webp", "covers/e/c.jpg", "covers/e/d.jpg", "originals/e/z.jpg"];
    expect(legacyToDelete(names, new Set(["thumbs/e/a.jpg", "covers/e/d.jpg", undefined]))).toEqual(["thumbs/e/b.jpg", "covers/e/c.jpg"]);
  });

  // Previene (TASK-035): que el backfill deje vistas previas con la marca vieja (sin version o de otra variante), o
  // que al regenerarlas toque el original o borre la miniatura que sigue en uso (mismo contenido, misma ruta).
  it("TASK-035 regenera la vista previa con marca vieja: original intacto, miniatura igual, preview vieja borrada", async () => {
    const webp = { ...legacy, thumbPath: "thumbs/e/p.0123456789ab.webp", previewPath: "previews/e/p.0123456789ab.webp" };
    expect(needsWebp(webp, "e", "p")).toBe(true); // sin watermarkVersion (marca de texto)
    const other = watermarkVersion(WATERMARK_VERSION.includes("light") ? "dark" : "light");
    expect(needsWebp({ ...webp, watermarkVersion: other }, "e", "p")).toBe(true);

    const f = seed();
    expect(await processOriginal(f.db, f.bucket, "originals/e/p.jpg")).toBe("ready");
    const first = { ...f.docs.get("events/e/photos/p")!.data };
    f.write("events/e/photos/p", { watermarkVersion: other, previewPath: "previews/e/p.0123456789ab.webp" });
    f.files.set("previews/e/p.0123456789ab.webp", { gen: 9, buf: original });
    const orig = f.files.get("originals/e/p.jpg")!;
    expect(await publishDerivatives(f.db, f.bucket, "e", "p", original, undefined, (cur) => cur.originalPath === "originals/e/p.jpg")).toBe(true);
    const doc = f.docs.get("events/e/photos/p")!.data;
    expect(doc).toMatchObject({ watermarkVersion: WATERMARK_VERSION, thumbPath: first.thumbPath, previewPath: first.previewPath });
    expect(needsWebp(doc, "e", "p")).toBe(false); // idempotente: una segunda corrida la salta
    expect(f.files.has("previews/e/p.0123456789ab.webp")).toBe(false);
    expect(f.files.has(first.thumbPath as string)).toBe(true);
    expect(f.files.get("originals/e/p.jpg")).toBe(orig);
  });
});
