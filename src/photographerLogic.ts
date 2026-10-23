/** Pagina "Sobre el fotografo" (TASK-039): contenido y enlaces de contacto, sin Firebase ni DOM. */
import { whatsappUrl } from './whatsappLogic'
import { messagesFor, type Locale } from './i18n/messages'

export const PHOTOGRAPHER = {
  name: 'Mauricio Reinoso',
  email: 'gulmork@gmail.com',
  instagram: 'mau_bujin',
}

export interface TimelineItem { when: string; title: string; org: string; text?: string }

/** Estructura del portafolio (idioma neutro); los textos (nombres, descripciones, alt) salen del diccionario por `slug`/`id`.
 * Una foto del portafolio en /fotografo/ (public/). `large` = ancho de la version grande, si existe. */
export interface PortfolioPhoto { slug: string; width: number; height: number; large?: number }
export interface PortfolioCategory { id: string; photos: PortfolioPhoto[] }

export const PORTRAIT: PortfolioPhoto = { slug: 'retrato-glaciar', width: 410, height: 615 }

export const PORTFOLIO: PortfolioCategory[] = [
  { id: 'paisaje', photos: [
    { slug: 'paisaje-cotopaxi', width: 800, height: 534, large: 1429 },
    { slug: 'paisaje-acantilados', width: 800, height: 530, large: 1087 },
  ] },
  { id: 'deportes', photos: [
    { slug: 'deportes-muay-thai', width: 800, height: 533, large: 1080 },
    { slug: 'deportes-boxeo', width: 800, height: 534, large: 1024 },
  ] },
  { id: 'retrato', photos: [
    { slug: 'retrato-stay-true', width: 576, height: 576 },
    { slug: 'retrato-boxeador', width: 656, height: 820 },
    { slug: 'retrato-tatuajes', width: 800, height: 534, large: 1024 },
  ] },
  { id: 'publicidad', photos: [
    { slug: 'publicidad-lanzamiento', width: 800, height: 532, large: 1600 },
    { slug: 'publicidad-volante', width: 800, height: 532, large: 1600 },
  ] },
  { id: 'eventos-sociales', photos: [
    { slug: 'eventos-novios', width: 800, height: 1200 },
    { slug: 'eventos-padre-hija', width: 800, height: 1200 },
    { slug: 'eventos-abuela', width: 800, height: 533, large: 1600 },
  ] },
  { id: 'mascotas', photos: [
    { slug: 'mascotas-perro', width: 576, height: 720 },
    { slug: 'mascotas-bulldogs', width: 656, height: 820 },
    { slug: 'mascotas-bulldog', width: 720, height: 720 },
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

/** Contenido de la pagina en el idioma pedido (TASK-042): la estructura es la misma, los textos salen del diccionario. */
export function photographerContent(lang: Locale = 'es') {
  const p = messagesFor(lang).photographer
  return {
    role: p.role, bio: p.bio, experience: p.experience as TimelineItem[], education: p.education as TimelineItem[], languages: p.languages, tools: p.tools,
    portrait: { ...PORTRAIT, alt: p.portraitAlt },
    portfolio: PORTFOLIO.map((c) => ({ ...c, name: p.categories[c.id as keyof typeof p.categories].name, blurb: p.categories[c.id as keyof typeof p.categories].blurb, photos: c.photos.map((ph) => ({ ...ph, alt: p.alts[ph.slug as keyof typeof p.alts] })) })),
  }
}

/** CU5/CU6: mensaje ya escrito de "Cotizar una sesión", en el idioma del cliente. */
export const quoteMessage = (lang: Locale = 'es'): string => messagesFor(lang).photographer.quoteMessage

/** CU4/CU5: enlaces de contacto. `digits` es el numero de la tienda ya resuelto (resolveWhatsappDigits). */
export type ContactLinks = ReturnType<typeof contactLinks>
export function contactLinks(digits: string, lang: Locale = 'es') {
  const p = messagesFor(lang).photographer
  return {
    quote: whatsappUrl(digits, p.quoteMessage),
    whatsapp: whatsappUrl(digits, p.whatsappMessage),
    whatsappLabel: displayPhone(digits),
    email: `mailto:${PHOTOGRAPHER.email}?subject=${encodeURIComponent(p.emailSubject)}`,
    instagram: `https://instagram.com/${PHOTOGRAPHER.instagram}`,
  }
}

/** "593998565995" -> "+593 99 856 5995"; otros paises quedan como "+digitos". */
export function displayPhone(digits: string): string {
  const m = /^593(\d{2})(\d{3})(\d{4})$/.exec(digits)
  return m ? `+593 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`
}
