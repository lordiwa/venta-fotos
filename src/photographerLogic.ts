/** Pagina "Sobre el fotografo" (TASK-039): contenido y enlaces de contacto, sin Firebase ni DOM. */
import { whatsappUrl } from './whatsappLogic'

export const PHOTOGRAPHER = {
  name: 'Mauricio Reinoso',
  role: 'Fotógrafo · Quito, Ecuador',
  email: 'gulmork@gmail.com',
  instagram: 'mau_bujin',
  bio: 'Fotógrafo apasionado por la aventura. Creo imágenes que transmiten emoción y conservan los momentos que importan. Trabajo cerca de cada cliente, con empatía y foco en los resultados: siempre doy el 110 %.',
}

export interface TimelineItem { when: string; title: string; org: string; text?: string }

export const EXPERIENCE: TimelineItem[] = [
  { when: '2025 — hoy', title: 'Guía fotográfico', org: 'ICHU Hiking Tours', text: 'Turismo de aventura con enfoque fotográfico: acompaño a los viajeros con sus cámaras y les doy pautas para lograr grandes fotos.' },
  { when: '2024 — hoy', title: 'Asistente de fotografía', org: 'Edufoto', text: 'Fotografía industrial a gran escala para la OEA (Organización de los Estados Americanos) y Lundin Gold / FDN, la mina más grande del Ecuador, entre otros.' },
  { when: '2021 — 2024', title: 'Guía fotográfico bilingüe y asistente', org: 'Sebastián Rodríguez Photo Tours', text: 'Guía para visitantes extranjeros en Quito y los Andes. Asistente y traductor (inglés–español) del reconocido fotógrafo Sebastián Rodríguez.' },
  { when: '2021 — 2023', title: 'Asistente de laboratorio analógico (voluntario)', org: 'LAF · Laboratorio Abierto de Fotografía', text: 'Revelado químico de película, escaneo, atención al cliente y ventas.' },
  { when: '2012 — 2021', title: 'Redactor y líder creativo', org: 'Agencias de publicidad', text: 'Campañas digitales y de redes sociales para marcas nacionales e internacionales.' },
]

export const EDUCATION: TimelineItem[] = [
  { when: '2025 — en curso', title: 'Fotografía profesional', org: 'New York Institute of Photography · en línea' },
  { when: '2020', title: 'Fotografía digital y edición', org: 'Edufoto · Quito' },
  { when: '2018', title: 'Fotografía avanzada', org: 'Edufoto · Quito' },
  { when: '2006 — 2011', title: 'Comunicación Social', org: 'Pontificia Universidad Católica del Ecuador (estudios)' },
]

export const LANGUAGES = [
  { name: 'Español', level: 'Nativo' },
  { name: 'Inglés', level: 'Bilingüe · IELTS 8.0 (C1)' },
]

export const TOOLS = ['Adobe Suite', 'Revelado analógico', 'Escaneo de película']

/** Una foto del portafolio en /fotografo/ (public/). `large` = ancho de la version grande, si existe. */
export interface PortfolioPhoto { slug: string; alt: string; width: number; height: number; large?: number }
export interface PortfolioCategory { id: string; name: string; blurb: string; photos: PortfolioPhoto[] }

export const PORTRAIT: PortfolioPhoto = { slug: 'retrato-glaciar', alt: 'Mauricio Reinoso con chaqueta roja y su cámara sobre un glaciar', width: 410, height: 615 }

export const PORTFOLIO: PortfolioCategory[] = [
  { id: 'paisaje', name: 'Paisaje', blurb: 'Volcanes, costa y luz andina.', photos: [
    { slug: 'paisaje-cotopaxi', alt: 'Volcán Cotopaxi al atardecer', width: 800, height: 534, large: 1429 },
    { slug: 'paisaje-acantilados', alt: 'Acantilados sobre el mar', width: 800, height: 530, large: 1087 },
  ] },
  { id: 'deportes', name: 'Deportes', blurb: 'Artes marciales y contacto, en el instante exacto.', photos: [
    { slug: 'deportes-muay-thai', alt: 'Entrenamiento de muay thai', width: 800, height: 533, large: 1080 },
    { slug: 'deportes-boxeo', alt: 'Combate de boxeo en jaula', width: 800, height: 534, large: 1024 },
  ] },
  { id: 'retrato', name: 'Retrato', blurb: 'Carácter, contraste y actitud.', photos: [
    { slug: 'retrato-stay-true', alt: 'Retrato en blanco y negro de manos tatuadas con las palabras STAY TRUE', width: 576, height: 576 },
    { slug: 'retrato-boxeador', alt: 'Retrato de un boxeador con el puño al frente', width: 656, height: 820 },
    { slug: 'retrato-tatuajes', alt: 'Retrato en un estudio de tatuajes', width: 800, height: 534, large: 1024 },
  ] },
  { id: 'publicidad', name: 'Publicidad', blurb: 'Producto y campaña para marcas.', photos: [
    { slug: 'publicidad-lanzamiento', alt: 'Lanzamiento de un auto con luces', width: 800, height: 532, large: 1600 },
    { slug: 'publicidad-volante', alt: 'Modelo al volante de un auto', width: 800, height: 532, large: 1600 },
  ] },
  { id: 'eventos-sociales', name: 'Eventos sociales', blurb: 'Bodas y celebraciones, con naturalidad.', photos: [
    { slug: 'eventos-novios', alt: 'Pareja de novios junto al pastel', width: 800, height: 1200 },
    { slug: 'eventos-padre-hija', alt: 'Padre e hija en una celebración', width: 800, height: 1200 },
    { slug: 'eventos-abuela', alt: 'Novia abrazando a su abuela', width: 800, height: 533, large: 1600 },
  ] },
  { id: 'mascotas', name: 'Mascotas', blurb: 'Retratos con personalidad.', photos: [
    { slug: 'mascotas-perro', alt: 'Retrato de un perro con collar lila', width: 576, height: 720 },
    { slug: 'mascotas-bulldogs', alt: 'Dos bulldogs franceses bajo luz roja', width: 656, height: 820 },
    { slug: 'mascotas-bulldog', alt: 'Bulldog francés recostado', width: 720, height: 720 },
  ] },
]

const BASE = '/fotografo/'

/** src de la miniatura (800w o el unico tamaño) y srcset con anchos reales, para que el navegador elija. */
export function photoSources(p: PortfolioPhoto): { src: string; srcset?: string; full: string } {
  if (!p.large) return { src: `${BASE}${p.slug}.webp`, full: `${BASE}${p.slug}.webp` }
  const small = `${BASE}${p.slug}-800.webp`
  const big = `${BASE}${p.slug}-1600.webp`
  return { src: small, srcset: `${small} 800w, ${big} ${p.large}w`, full: big }
}

/**
 * Movil: filas de fotos (indices). Las horizontales (proporcion > 1.2) van solas; las verticales/cuadradas seguidas se
 * emparejan de a dos y la que queda sin pareja va sola. Nunca se recorta: cada celda tiene la proporcion de su foto.
 */
export function mobileRows(photos: Pick<PortfolioPhoto, 'width' | 'height'>[]): number[][] {
  const rows: number[][] = []
  const wide = (i: number) => photos[i].width / photos[i].height > 1.2
  for (let i = 0; i < photos.length; i++) {
    if (!wide(i) && i + 1 < photos.length && !wide(i + 1)) { rows.push([i, i + 1]); i++ }
    else rows.push([i])
  }
  return rows
}

/** CU5: mensaje ya escrito de "Cotizar una sesión". */
export const QUOTE_MESSAGE = 'Hola, Mauricio. Vi tu portafolio en Martial Photo y quisiera cotizar una sesión de fotos. ¿Me cuentas tu disponibilidad y tarifas?'

/** CU4/CU5: enlaces de contacto. `digits` es el numero de la tienda ya resuelto (resolveWhatsappDigits). */
export type ContactLinks = ReturnType<typeof contactLinks>
export function contactLinks(digits: string) {
  return {
    quote: whatsappUrl(digits, QUOTE_MESSAGE),
    whatsapp: whatsappUrl(digits, 'Hola, Mauricio. Vi tu portafolio en Martial Photo.'),
    whatsappLabel: displayPhone(digits),
    email: `mailto:${PHOTOGRAPHER.email}?subject=${encodeURIComponent('Sesión de fotos')}`,
    instagram: `https://instagram.com/${PHOTOGRAPHER.instagram}`,
  }
}

/** "593998565995" -> "+593 99 856 5995"; otros paises quedan como "+digitos". */
export function displayPhone(digits: string): string {
  const m = /^593(\d{2})(\d{3})(\d{4})$/.exec(digits)
  return m ? `+593 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`
}

export const PAGE_TITLE = 'Mauricio Reinoso · Fotógrafo en Quito | Martial Photo'
export const PAGE_DESCRIPTION = 'Mauricio Reinoso, fotógrafo en Quito, Ecuador: paisaje, deportes, retrato, publicidad, eventos sociales y mascotas. Mira el portafolio y cotiza una sesión por WhatsApp.'
