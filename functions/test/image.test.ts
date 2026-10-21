import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeDerivatives } from "../src/image";
import { logoTiles, LOGO_OPACITY } from "../src/watermark";

const gray = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer();

/** Mascara de pixeles que se apartan del gris liso de fondo. */
async function marked(img: Buffer) {
  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(info.width * info.height);
  for (let i = 0; i < m.length; i++) m[i] = Math.abs(data[i * 3] - 120) > 12 ? 1 : 0;
  return { m, w: info.width, h: info.height };
}

describe("makeDerivatives", () => {
  // Previene: servir la foto a resolucion completa en la galeria publica (vista previa/miniatura sin reducir).
  it("CU4 genera miniatura ~400px y vista previa ~1600px, y reporta el tamano original", async () => {
    const r = await makeDerivatives(await gray(3000, 2000));
    expect(r).toMatchObject({ width: 3000, height: 2000 });
    // TASK-033: ambas en WebP, mismos tamanos.
    expect(await sharp(r.thumb).metadata()).toMatchObject({ width: 400, height: 267, format: "webp" });
    expect(await sharp(r.preview).metadata()).toMatchObject({ width: 1600, height: 1067, format: "webp" });
  });

  // Previene (TASK-035): una vista previa con una zona limpia grande que se pueda recortar y usar sin pagar (en
  // horizontal o vertical), o una miniatura que de pronto lleve marca.
  it("TASK-035 el logo cubre toda la vista previa: ninguna zona de 1/3 del lado corto queda limpia; la miniatura no lleva marca", async () => {
    for (const [w, h] of [[1200, 800], [800, 1200]]) {
      const r = await makeDerivatives(await gray(w, h));
      const { m, w: pw, h: ph } = await marked(r.preview);
      expect([pw, ph]).toEqual([w, h]);
      // Ventanas de 1/3 del lado corto, recorridas cada 1/12: incluye las cuatro esquinas y el centro.
      const win = Math.floor(Math.min(pw, ph) / 3);
      const step = Math.floor(win / 4);
      for (let y = 0; y + win <= ph; y += step) {
        for (let x = 0; x + win <= pw; x += step) {
          let n = 0;
          for (let yy = y; yy < y + win; yy++) for (let xx = x; xx < x + win; xx++) n += m[yy * pw + xx];
          expect(n, `ventana limpia en ${x},${y} (${w}x${h})`).toBeGreaterThan(win * win * 0.02);
        }
      }
      expect((await marked(r.thumb)).m.some((v) => v)).toBe(false);
    }
  });

  // Previene (TASK-035): una marca opaca (tapa la foto) o casi invisible (no protege): el logo va al 50%.
  it("TASK-035 el logo se aplica al 50% de opacidad, en ambas variantes", async () => {
    expect(LOGO_OPACITY).toBe(0.5);
    // Sin perdida: blanco liso + logo claro (circulo negro) -> lo mas oscuro es ~128; negro + logo oscuro (blanco) -> ~127.
    for (const [variant, bg, expected] of [["light", 255, 128], ["dark", 0, 127]] as const) {
      const base = sharp({ create: { width: 600, height: 400, channels: 3, background: { r: bg, g: bg, b: bg } } });
      const out = await base.composite(await logoTiles(600, 400, variant)).png().toBuffer();
      const { data } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let extreme = bg;
      for (let i = 1; i < data.length; i += 3) extreme = bg === 255 ? Math.min(extreme, data[i]) : Math.max(extreme, data[i]); // canal verde
      expect(Math.abs(extreme - expected), `${variant}: ${extreme}`).toBeLessThanOrEqual(2);
    }
  });

  // Previene: que un archivo dañado se publique como "listo" o tumbe el procesamiento de las demas fotos (CU6).
  it("CU6 un archivo dañado lanza error", async () => {
    await expect(makeDerivatives(Buffer.from("esto no es una imagen"))).rejects.toThrow();
    const truncated = (await gray(800, 600)).subarray(0, 300);
    await expect(makeDerivatives(truncated)).rejects.toThrow();
    // dimensiones desmesuradas (PNG liso diminuto en disco, 81 MP al decodificar) -> error en vez de agotar la memoria
    const huge = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(makeDerivatives(huge)).rejects.toThrow(/pixel/i);
  });
});
