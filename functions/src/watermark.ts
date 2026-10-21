import { join } from "path";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

// TASK-035: marca de agua con el logo de Martial Photo en mosaico sobre las vistas previas
// (TASK-038: opacidad bajada del 50% al 35% y luego al 20%). Reemplaza al
// texto MUESTRA (settings.watermarkText queda sin uso). El PNG viaja con las Functions (functions/assets).

/** 'light': circulo negro; 'dark': circulo blanco (la elegida por el humano, TASK-035). Ambas con el luchador rojo. */
export type LogoVariant = "light" | "dark";
export const LOGO_VARIANTS: readonly LogoVariant[] = ["light", "dark"];
/** Variante en uso. Cambiarla cambia WATERMARK_VERSION y el backfill regenera las vistas previas. */
export const WATERMARK_LOGO: LogoVariant = "dark";
/** Version del diseno de la marca (subirla si cambia tamano, separacion u opacidad). */
const LAYOUT_VERSION = 3; // 2: opacidad 35%, 3: opacidad 20% (TASK-038)
export const watermarkVersion = (logo: LogoVariant) => `logo-${logo}-${LAYOUT_VERSION}`;
/** Lo que publishDerivatives escribe en el documento; needsWebp marca para regenerar toda foto con otro valor. */
export const WATERMARK_VERSION = watermarkVersion(WATERMARK_LOGO);

/** Opacidad del logo (TASK-038: 20%). Cambiarla exige subir LAYOUT_VERSION. */
export const LOGO_OPACITY = 0.2;
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
  // Nunca mas grande que la imagen (sharp no compone una capa mayor que la base): fotos diminutas no fallan.
  const size = Math.max(1, Math.round(Math.min(width, height) * LOGO_SCALE));
  const { data, info } = await sharp(src)
    .resize(size, size, { fit: "inside" })
    .ensureAlpha()
    .linear([1, 1, 1, LOGO_OPACITY], [0, 0, 0, 0])
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width: lw, height: lh } = info;
  const sx = Math.max(1, Math.round(lw * STEP_X));
  const sy = Math.max(1, Math.round(lh * STEP_Y));
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
