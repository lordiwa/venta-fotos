import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { coverSource, coversToDelete, isPermanentError, photoChangeAffectsCover, planCover, validId } from "../src/coverLogic";
import { parseOriginalPath } from "../src/process";
import { makeCover } from "../src/image";

// TASK-033: portadas versionadas covers/{e}/{foto}.{hash}.webp; el .jpg es el formato anterior.
const v = (id: string, h = "0123456789ab") => `covers/e/${id}.${h}.webp`;

describe("planCover (TASK-028)", () => {
  // Previene: un bucle infinito del trigger (la Function escribe coverPath en el mismo documento que la dispara),
  // portadas que no se regeneran al cambiarlas y archivos/campos huerfanos al quitar la portada o borrar el evento.
  it("genera al fijar/cambiar, no hace nada si coverPath ya corresponde, limpia al quitar y purga al borrar", () => {
    expect(planCover("e", { coverPhotoId: "p1" })).toEqual({ kind: "generate", photoId: "p1" });
    expect(planCover("e", { coverPhotoId: "p2", coverPath: v("p1") })).toEqual({ kind: "generate", photoId: "p2" });
    expect(planCover("e", { coverPhotoId: "p1", coverPath: v("p1") })).toEqual({ kind: "none" });
    expect(planCover("e", { coverPhotoId: "p1", coverPath: "covers/e/p1.jpg" })).toEqual({ kind: "generate", photoId: "p1" }); // jpg viejo -> webp
    expect(planCover("e", { coverPath: "covers/e/p1.jpg" })).toEqual({ kind: "clear", removeField: true });
    expect(planCover("e", { name: "sin portada" } as object)).toEqual({ kind: "none" });
    expect(planCover("e", null)).toEqual({ kind: "purge" });
    expect(planCover("e", { coverPhotoId: "../x/y" })).toEqual({ kind: "none" }); // id con "/" no se usa como ruta
    // backfill de una sola escritura: coverPath null (ausente) o borrado -> genera sin perder coverPhotoId
    expect(planCover("e", { coverPhotoId: "p1", coverPath: null })).toEqual({ kind: "generate", photoId: "p1" });
  });

  // Previene: que una foto OCULTA (o no lista, o con un original ajeno) acabe publicada como portada de 1920px sin marca (R-1).
  it("solo una foto visible, lista y con su propio original puede ser portada; ocultarla o mostrarla re-dispara", () => {
    const ok = { status: "ready", visible: true, originalPath: "originals/e/p1.jpg" };
    expect(coverSource(ok, "e", "p1", parseOriginalPath)).toBe("originals/e/p1.jpg");
    expect(coverSource({ ...ok, visible: false }, "e", "p1", parseOriginalPath)).toBeNull();
    expect(coverSource({ ...ok, status: "processing" }, "e", "p1", parseOriginalPath)).toBeNull();
    expect(coverSource({ ...ok, originalPath: "originals/otro/p1.jpg" }, "e", "p1", parseOriginalPath)).toBeNull();
    expect(coverSource(null, "e", "p1", parseOriginalPath)).toBeNull();
    expect(photoChangeAffectsCover(ok, { ...ok, visible: false })).toBe(true);
    expect(photoChangeAffectsCover(ok, { ...ok })).toBe(false);
    expect(photoChangeAffectsCover({ ...ok, visible: false }, ok)).toBe(true); // mostrarla
    // L-3: subida masiva -> foto nueva processing->ready (nunca pudo ser portada) u oculta en ambos lados: no lee el evento
    expect(photoChangeAffectsCover({ status: "processing", visible: true, originalPath: "originals/e/p1.jpg" }, ok)).toBe(false);
    expect(photoChangeAffectsCover({ status: "processing", visible: false }, { ...ok, visible: false })).toBe(false);
    // re-subida de una foto que ya estuvo lista (tiene thumbPath): si cuenta
    expect(photoChangeAffectsCover({ status: "processing", visible: true, thumbPath: "thumbs/e/p1.jpg" }, ok)).toBe(true);
  });

  // Previene: que la limpieza borre la portada vigente (releida tras listar) o deje la de una foto retirada (M-1).
  it("la limpieza nunca borra la portada vigente; si borra la de una foto retirada", () => {
    const files = [{ name: v("a") }, { name: v("b") }, { name: v("c") }];
    expect(coversToDelete(files, "e", { coverPhotoId: "a", coverPath: v("b") })).toEqual([v("c")]);
    expect(coversToDelete(files, "e", { coverPhotoId: "a" })).toEqual([v("b"), v("c")]);
    expect(coversToDelete(files, "e", null)).toEqual([v("a"), v("b"), v("c")]);
    const dropA = (n: string) => n === v("a");
    expect(coversToDelete(files, "e", { coverPhotoId: "a" }, dropA)).toEqual([v("a"), v("b"), v("c")]);
    // M-5: drop no borra la portada si coverPath releido vuelve a apuntarle (la mostraron y ya se regenero)
    expect(coversToDelete(files, "e", { coverPhotoId: "a", coverPath: v("a") }, dropA)).toEqual([v("b"), v("c")]);
    // TASK-033: el .jpg viejo de la portada elegida cae (salvo que siga siendo coverPath); su webp por publicar no
    const mixed = [{ name: "covers/e/a.jpg" }, { name: v("a", "ffffffffffff") }];
    expect(coversToDelete(mixed, "e", { coverPhotoId: "a" })).toEqual(["covers/e/a.jpg"]);
    expect(coversToDelete(mixed, "e", { coverPhotoId: "a", coverPath: "covers/e/a.jpg" })).toEqual([]);
  });
});

describe("validId / isPermanentError (TASK-028)", () => {
  // Previene: rutas de Storage armadas con ids hostiles (../, puntos, ids reservados __x__) y reintentos de ~24 h por
  // errores que reintentar no arregla (permisos, argumento invalido).
  it("acepta ids automaticos de Firestore y rechaza ids de ruta peligrosos; clasifica errores permanentes", () => {
    expect(validId("Xy3kP9qLmN0aBcDeFgHi")).toBe(true); // forma de doc().id / newPhotoId (20 alfanumericos)
    expect(validId("foto_1-b")).toBe(true);
    for (const bad of ["", "a/b", "../x", "a.b", "__x__", "x".repeat(129), 5]) expect(validId(bad)).toBe(false);
    for (const code of [3, 7, 9, 400, 403]) expect(isPermanentError({ code })).toBe(true);
    for (const code of [4, 10, 14, 429, 500, 503, undefined]) expect(isPermanentError({ code })).toBe(false);
  });
});

describe("makeCover (TASK-028)", () => {
  // Previene: una portada pixelada (sin la resolucion pedida), un archivo enorme a resolucion completa, o
  // una portada rotada mal por ignorar la orientacion EXIF.
  it("reduce a 1920px lado largo sin agrandar, aplica la orientacion EXIF y sale en WebP", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#4080c0" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await sharp(await makeCover(big)).metadata()).toMatchObject({ width: 1440, height: 1920, format: "webp" });
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
    expect(await sharp(await makeCover(small)).metadata()).toMatchObject({ width: 800, height: 600 });
  });
});
