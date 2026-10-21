// TASK-033: derivados WebP versionados (publicacion, limpieza y plan del backfill) con los dobles de test/fakes.ts.
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { deletePhotoFiles, processOriginal, publishDerivatives } from "../src/process";
import { CACHE_CONTROL, isDerivedPath, legacyToDelete, needsWebp } from "../src/derived";
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
    expect(doc).toMatchObject({ status: "ready", width: 800, height: 600 });
    expect(isDerivedPath(doc.thumbPath, "thumbs", "e", "p") && isDerivedPath(doc.previewPath, "previews", "e", "p")).toBe(true);
    for (const p of [doc.thumbPath, doc.previewPath] as string[]) {
      expect(f.files.get(p)!.opts).toMatchObject({ contentType: "image/webp", metadata: { cacheControl: CACHE_CONTROL } });
      expect((await sharp(f.files.get(p)!.buf).metadata()).format).toBe("webp");
    }
    expect(f.files.has("thumbs/e/p.jpg") || f.files.has("previews/e/p.jpg")).toBe(false);
    expect(seenAtDelete).toEqual([["thumbs/e/p.jpg", doc.thumbPath], ["previews/e/p.jpg", doc.thumbPath]]);
  });

  // Previene: que el backfill pise una foto reprocesada (o cambiada) mientras convertia, o deje huerfanos sus webp.
  it("si la condicion releida no se cumple no publica, borra lo subido y conserva los .jpg", async () => {
    const f = seed();
    expect(await publishDerivatives(f.db, f.bucket, "e", "p", original, "MUESTRA", () => false)).toBe(false);
    expect(f.docs.get("events/e/photos/p")!.data).toEqual(legacy);
    expect([...f.files.keys()].sort()).toEqual(["originals/e/p.jpg", "previews/e/p.jpg", "thumbs/e/p.jpg"]);
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
});

describe("plan del backfill (TASK-033)", () => {
  // Previene: un backfill no idempotente (reconvierte lo ya convertido), que convierta fotos sin original o no listas,
  // o que borre un .jpg que algun documento todavia usa.
  it("convierte solo fotos listas sin webp versionado; borra solo .jpg sin referencia", () => {
    const webp = { ...legacy, thumbPath: "thumbs/e/p.0123456789ab.webp", previewPath: "previews/e/p.0123456789ab.webp" };
    expect(needsWebp(legacy, "e", "p")).toBe(true);
    expect(needsWebp({ ...webp, previewPath: "previews/e/p.jpg" }, "e", "p")).toBe(true);
    expect(needsWebp(webp, "e", "p")).toBe(false);
    expect(needsWebp({ ...webp, thumbPath: "thumbs/e/otra.0123456789ab.webp" }, "e", "p")).toBe(true); // ruta ajena
    expect(needsWebp({ ...legacy, status: "error" }, "e", "p")).toBe(false);
    expect(needsWebp({ ...legacy, originalPath: undefined }, "e", "p")).toBe(false);
    const names = ["thumbs/e/a.jpg", "thumbs/e/b.jpg", "previews/e/b.0123456789ab.webp", "covers/e/c.jpg", "covers/e/d.jpg", "originals/e/z.jpg"];
    expect(legacyToDelete(names, new Set(["thumbs/e/a.jpg", "covers/e/d.jpg", undefined]))).toEqual(["thumbs/e/b.jpg", "covers/e/c.jpg"]);
  });
});
