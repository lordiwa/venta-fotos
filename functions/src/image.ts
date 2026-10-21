import sharp from "sharp";
import { logoTiles, WATERMARK_LOGO, type LogoVariant } from "./watermark";

/** Tope de pixeles de entrada (anti "decompression bomb"); 80 MP cubre camaras de alta gama. */
export const MAX_INPUT_PIXELS = 80e6;
export const THUMB_SIZE = 400;
export const PREVIEW_SIZE = 1600;
/** TASK-033: calidad WebP; la miniatura un poco mas alta para que siga nitida en pantallas densas. */
export const THUMB_QUALITY = 80;
export const PREVIEW_QUALITY = 76;
export const COVER_QUALITY = 78;

export interface Derivatives {
  thumb: Buffer;
  preview: Buffer;
  /** Dimensiones del original (ya con la orientacion EXIF aplicada). */
  width: number;
  height: number;
}

/**
 * Miniatura (~400px lado largo, sin marca) y vista previa (~1600px) con el logo en mosaico al 20% de opacidad (TASK-035, TASK-038), ambas
 * WebP (TASK-033). Lanza si el archivo no es una imagen valida.
 */
export async function makeDerivatives(input: Buffer, logo: LogoVariant = WATERMARK_LOGO): Promise<Derivatives> {
  const base = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate(); // aplica EXIF y lo descarta
  const meta = await base.metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!width || !height) throw new Error("Imagen sin dimensiones");

  const thumb = await base
    .clone()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  const resized = await base
    .clone()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width: pw, height: ph } = resized.info;
  const preview = await sharp(resized.data)
    .composite(await logoTiles(pw, ph, logo))
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();

  return { thumb, preview, width, height };
}

export const COVER_SIZE = 1920;

/** TASK-028: portada dedicada del evento, ~1920px lado largo, SIN marca de agua, WebP. Lanza si el archivo no es una imagen valida. */
export function makeCover(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(COVER_SIZE, COVER_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: COVER_QUALITY })
    .toBuffer();
}
