import { join } from "path";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

/**
 * Marca de agua como SVG vectorial hecho solo de rectangulos (fuente bitmap 5x7 propia).
 * No usa fuentes del sistema: en Cloud Functions no hay garantia de que existan y el texto saldria vacio
 * (la vista previa quedaria SIN marca de agua).
 */
export const DEFAULT_WATERMARK = "MUESTRA";
/** Maximo de caracteres de la marca de agua (la letra se reduce para que quepa; mas largo se corta con aviso en el log). */
export const MAX_WATERMARK_CHARS = 40;

// Cada glifo: 7 filas de 5 columnas separadas por espacio ('#' = relleno).
const FONT: Record<string, string> = {
  A: ".###. #...# #...# ##### #...# #...# #...#",
  B: "####. #...# #...# ####. #...# #...# ####.",
  C: ".###. #...# #.... #.... #.... #...# .###.",
  D: "####. #...# #...# #...# #...# #...# ####.",
  E: "##### #.... #.... ####. #.... #.... #####",
  F: "##### #.... #.... ####. #.... #.... #....",
  G: ".###. #...# #.... #.### #...# #...# .###.",
  H: "#...# #...# #...# ##### #...# #...# #...#",
  I: ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  J: "..### ...#. ...#. ...#. ...#. #..#. .##..",
  K: "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
  L: "#.... #.... #.... #.... #.... #.... #####",
  M: "#...# ##.## #.#.# #.#.# #...# #...# #...#",
  N: "#...# ##..# #.#.# #..## #...# #...# #...#",
  O: ".###. #...# #...# #...# #...# #...# .###.",
  P: "####. #...# #...# ####. #.... #.... #....",
  Q: ".###. #...# #...# #...# #.#.# #..#. .##.#",
  R: "####. #...# #...# ####. #.#.. #..#. #...#",
  S: ".#### #.... #.... .###. ....# ....# ####.",
  T: "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  U: "#...# #...# #...# #...# #...# #...# .###.",
  V: "#...# #...# #...# #...# #...# .#.#. ..#..",
  W: "#...# #...# #...# #.#.# #.#.# ##.## #...#",
  X: "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  Y: "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
  Z: "##### ....# ...#. ..#.. .#... #.... #####",
  "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
  "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  "2": ".###. #...# ....# ...#. ..#.. .#... #####",
  "3": "####. ....# ....# .###. ....# ....# ####.",
  "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
  "5": "##### #.... ####. ....# ....# #...# .###.",
  "6": ".###. #.... #.... ####. #...# #...# .###.",
  "7": "##### ....# ...#. ..#.. .#... .#... .#...",
  "8": ".###. #...# #...# .###. #...# #...# .###.",
  "9": ".###. #...# #...# .#### ....# ....# .###.",
  "-": "..... ..... ..... ##### ..... ..... .....",
  ".": "..... ..... ..... ..... ..... .##.. .##..",
  " ": "..... ..... ..... ..... ..... ..... .....",
};

/** Mayusculas sin acentos y solo con los caracteres soportados; vacio si no queda ninguno visible. */
export function normalizeWatermarkText(raw: unknown): string {
  const t = String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /[A-Z0-9]/.test(t) ? t : "";
}

/** SVG (width x height) con el texto repetido en diagonal sobre toda la imagen. */
export function buildWatermarkSvg(rawText: unknown, width: number, height: number): string {
  let text = normalizeWatermarkText(rawText) || DEFAULT_WATERMARK;
  if (text.length > MAX_WATERMARK_CHARS) {
    // Tope documentado: el texto se acorta (el tamaño de letra se ajusta al ancho de la imagen hasta ese tope).
    console.warn(`watermarkText tiene ${text.length} caracteres validos; se usan los primeros ${MAX_WATERMARK_CHARS}.`);
    text = text.slice(0, MAX_WATERMARK_CHARS).trim();
  }
  const chars = [...text];
  const u = Math.max(2, Math.round((Math.max(width, height) * 0.28) / (chars.length * 6 - 1)));
  const tw = (chars.length * 6 - 1) * u;
  const th = 7 * u;
  let d = "";
  chars.forEach((ch, i) => {
    FONT[ch].split(" ").forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === "#") d += `M${(i * 6 + x) * u} ${y * u}h${u}v${u}h-${u}z`;
      });
    });
  });
  const cellW = tw + 10 * u;
  const cellH = th + 22 * u;
  // Sombra oscura + relleno claro: legible sobre fondos claros y oscuros.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs><pattern id="w" width="${cellW}" height="${cellH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">` +
    `<path d="${d}" transform="translate(${u},${u + 4 * u})" fill="#000" fill-opacity="0.45"/>` +
    `<path d="${d}" transform="translate(0,${4 * u})" fill="#fff" fill-opacity="0.6"/>` +
    `</pattern></defs><rect width="${width}" height="${height}" fill="url(#w)"/></svg>`
  );
}

// ---------------------------------------------------------------------------------------------------------------
// TASK-035: marca de agua con el logo de Martial Photo en mosaico al 50%. Reemplaza al texto de arriba en las vistas
// previas (buildWatermarkSvg y settings.watermarkText quedan sin uso). El PNG viaja con las Functions (functions/assets).

/** 'light': circulo negro (para fondos claros); 'dark': lineas blancas (para fondos oscuros). */
export type LogoVariant = "light" | "dark";
export const LOGO_VARIANTS: readonly LogoVariant[] = ["light", "dark"];
/** Variante en uso. Cambiarla cambia WATERMARK_VERSION y el backfill regenera las vistas previas. */
export const WATERMARK_LOGO: LogoVariant = "light";
/** Version del diseno de la marca (subirla si cambia tamano, separacion u opacidad). */
const LAYOUT_VERSION = 1;
export const watermarkVersion = (logo: LogoVariant) => `logo-${logo}-${LAYOUT_VERSION}`;
/** Lo que publishDerivatives escribe en el documento; needsWebp marca para regenerar toda foto con otro valor. */
export const WATERMARK_VERSION = watermarkVersion(WATERMARK_LOGO);

export const LOGO_OPACITY = 0.5;
/** Ancho del logo respecto del lado corto: igual proporcion en fotos horizontales y verticales. */
export const LOGO_SCALE = 0.2;
/** Paso entre logos (en anchos/altos de logo): huecos de 0.7 logo en la fila, 0.5 entre filas. */
const STEP_X = 1.7;
const STEP_Y = 1.5;

const logoFile = (logo: LogoVariant) => join(__dirname, "..", "assets", `logo-${logo}.png`);
const trimmed = new Map<LogoVariant, Promise<Buffer>>();
/** PNG del logo sin el margen transparente (se calcula una vez por instancia). */
function trimmedLogo(logo: LogoVariant): Promise<Buffer> {
  if (!LOGO_VARIANTS.includes(logo)) throw new Error(`Variante de logo desconocida: ${String(logo)}`);
  let p = trimmed.get(logo);
  if (!p) {
    p = sharp(logoFile(logo)).trim().png().toBuffer();
    p.catch(() => trimmed.delete(logo)); // un fallo no queda cacheado
    trimmed.set(logo, p);
  }
  return p;
}

/**
 * Capas para `sharp().composite()`: el logo (ancho LOGO_SCALE del lado corto, alfa x LOGO_OPACITY) repetido en filas
 * alternadas como ladrillos, centrado y desbordando los bordes, asi no queda ninguna franja limpia que recortar.
 */
export async function logoTiles(width: number, height: number, logo: LogoVariant = WATERMARK_LOGO): Promise<OverlayOptions[]> {
  const src = await trimmedLogo(logo);
  const lw = Math.max(8, Math.round(Math.min(width, height) * LOGO_SCALE));
  const { data, info } = await sharp(src)
    .resize(lw)
    .ensureAlpha()
    .linear([1, 1, 1, LOGO_OPACITY], [0, 0, 0, 0])
    .png()
    .toBuffer({ resolveWithObject: true });
  const lh = info.height;
  const sx = Math.round(lw * STEP_X);
  const sy = Math.round(lh * STEP_Y);
  // Un logo queda centrado en la imagen y el patron se extiende hasta desbordar los cuatro bordes.
  const cx = Math.round((width - lw) / 2);
  const cy = Math.round((height - lh) / 2);
  const tiles: OverlayOptions[] = [];
  for (let r = -Math.ceil(cy / sy) - 1; cy + r * sy < height; r++) {
    const y = cy + r * sy;
    const shift = r % 2 === 0 ? 0 : Math.round(sx / 2); // filas alternadas corridas medio paso (ladrillo)
    for (let c = -Math.ceil(cx / sx) - 1; cx + shift + c * sx < width; c++) {
      const x = cx + shift + c * sx;
      if (x + lw > 0 && y + lh > 0) tiles.push({ input: data, left: x, top: y });
    }
  }
  return tiles;
}
