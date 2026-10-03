/**
 * Marca de agua como SVG vectorial hecho solo de rectangulos (fuente bitmap 5x7 propia).
 * No usa fuentes del sistema: en Cloud Functions no hay garantia de que existan y el texto saldria vacio
 * (la vista previa quedaria SIN marca de agua).
 */
export const DEFAULT_WATERMARK = "MUESTRA";

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
    .trim()
    .slice(0, 24);
  return /[A-Z0-9]/.test(t) ? t : "";
}

/** SVG (width x height) con el texto repetido en diagonal sobre toda la imagen. */
export function buildWatermarkSvg(rawText: unknown, width: number, height: number): string {
  const text = normalizeWatermarkText(rawText) || DEFAULT_WATERMARK;
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
