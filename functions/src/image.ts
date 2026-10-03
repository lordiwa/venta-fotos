import sharp from "sharp";
import { buildWatermarkSvg } from "./watermark";

/** Tope de pixeles de entrada (anti "decompression bomb"); 80 MP cubre camaras de alta gama. */
export const MAX_INPUT_PIXELS = 80e6;
export const THUMB_SIZE = 400;
export const PREVIEW_SIZE = 1600;

export interface Derivatives {
  thumb: Buffer;
  preview: Buffer;
  /** Dimensiones del original (ya con la orientacion EXIF aplicada). */
  width: number;
  height: number;
}

/** Miniatura (~400px lado largo) y vista previa (~1600px) con marca de agua, ambas JPEG. Lanza si el archivo no es una imagen valida. */
export async function makeDerivatives(input: Buffer, watermarkText: unknown): Promise<Derivatives> {
  const base = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate(); // aplica EXIF y lo descarta
  const meta = await base.metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!width || !height) throw new Error("Imagen sin dimensiones");

  const thumb = await base
    .clone()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const resized = await base
    .clone()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width: pw, height: ph } = resized.info;
  const preview = await sharp(resized.data)
    .composite([{ input: Buffer.from(buildWatermarkSvg(watermarkText, pw, ph)), top: 0, left: 0 }])
    .jpeg({ quality: 78 })
    .toBuffer();

  return { thumb, preview, width, height };
}
