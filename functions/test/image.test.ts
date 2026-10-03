import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeDerivatives } from "../src/image";

const gray = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer();

/** Cantidad de pixeles que se apartan del gris liso de fondo. */
async function nonBackgroundPixels(jpeg: Buffer) {
  const { data } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i] - 120) > 12) n++;
  return n;
}

describe("makeDerivatives", () => {
  // Previene: servir la foto a resolucion completa en la galeria publica (vista previa/miniatura sin reducir).
  it("CU4 genera miniatura ~400px y vista previa ~1600px, y reporta el tamano original", async () => {
    const r = await makeDerivatives(await gray(3000, 2000), "MUESTRA");
    expect(r).toMatchObject({ width: 3000, height: 2000 });
    expect(await sharp(r.thumb).metadata()).toMatchObject({ width: 400, height: 267, format: "jpeg" });
    expect(await sharp(r.preview).metadata()).toMatchObject({ width: 1600, height: 1067, format: "jpeg" });
  });

  // Previene: publicar vistas previas SIN marca de agua (la gente copiaria la foto sin pagar), incluso con texto vacio.
  it("CU4 la vista previa lleva marca de agua visible (texto configurable; vacio -> MUESTRA)", async () => {
    const custom = await makeDerivatives(await gray(1200, 800), "Mi Estudio");
    const empty = await makeDerivatives(await gray(1200, 800), "   ");
    const def = await makeDerivatives(await gray(1200, 800), "MUESTRA");
    const total = 1200 * 800;
    expect(await nonBackgroundPixels(custom.preview)).toBeGreaterThan(total * 0.02);
    expect(empty.preview.equals(def.preview)).toBe(true);
    expect(custom.preview.equals(def.preview)).toBe(false);
    expect(await nonBackgroundPixels(await sharp(await gray(1200, 800)).jpeg().toBuffer())).toBe(0); // control: sin marca no hay pixeles distintos
  });

  // Previene: que un archivo dañado se publique como "listo" o tumbe el procesamiento de las demas fotos (CU6).
  it("CU6 un archivo dañado lanza error", async () => {
    await expect(makeDerivatives(Buffer.from("esto no es una imagen"), "MUESTRA")).rejects.toThrow();
    const truncated = (await gray(800, 600)).subarray(0, 300);
    await expect(makeDerivatives(truncated, "MUESTRA")).rejects.toThrow();
    // dimensiones desmesuradas (PNG liso diminuto en disco, 81 MP al decodificar) -> error en vez de agotar la memoria
    const huge = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(makeDerivatives(huge, "MUESTRA")).rejects.toThrow(/pixel/i);
  });
});
