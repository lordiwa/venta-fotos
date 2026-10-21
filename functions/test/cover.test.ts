import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { planCover } from "../src/coverLogic";
import { makeCover } from "../src/image";

describe("planCover (TASK-028)", () => {
  // Previene: un bucle infinito del trigger (la Function escribe coverPath en el mismo documento que la dispara),
  // portadas que no se regeneran al cambiarlas y archivos/campos huerfanos al quitar la portada o borrar el evento.
  it("genera al fijar/cambiar, no hace nada si coverPath ya corresponde, limpia al quitar y purga al borrar", () => {
    expect(planCover("e", { coverPhotoId: "p1" })).toEqual({ kind: "generate", photoId: "p1", path: "covers/e/p1.jpg" });
    expect(planCover("e", { coverPhotoId: "p2", coverPath: "covers/e/p1.jpg" })).toEqual({ kind: "generate", photoId: "p2", path: "covers/e/p2.jpg" });
    expect(planCover("e", { coverPhotoId: "p1", coverPath: "covers/e/p1.jpg" })).toEqual({ kind: "none" });
    expect(planCover("e", { coverPath: "covers/e/p1.jpg" })).toEqual({ kind: "clear", removeField: true });
    expect(planCover("e", { name: "sin portada" } as object)).toEqual({ kind: "none" });
    expect(planCover("e", null)).toEqual({ kind: "purge" });
    expect(planCover("e", { coverPhotoId: "../x/y" })).toEqual({ kind: "none" }); // id con "/" no se usa como ruta
  });
});

describe("makeCover (TASK-028)", () => {
  // Previene: una portada pixelada (sin la resolucion pedida), un archivo enorme a resolucion completa, o
  // una portada rotada mal por ignorar la orientacion EXIF.
  it("reduce a 1920px lado largo sin agrandar y aplica la orientacion EXIF", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#4080c0" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await sharp(await makeCover(big)).metadata()).toMatchObject({ width: 1440, height: 1920, format: "jpeg" });
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#4080c0" } }).jpeg().toBuffer();
    expect(await sharp(await makeCover(small)).metadata()).toMatchObject({ width: 800, height: 600 });
  });
});
