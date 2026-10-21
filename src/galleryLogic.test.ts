import { describe, it, expect } from 'vitest'
import { galleryState, photoNav, photoPath, swipeAction, swipeDirection } from './galleryLogic'

describe('galleryLogic', () => {
  // Prevents: prev/next que se traba o salta en el limite de pagina de la cuadricula.
  it('photoNav sigue el orden y pide mas paginas al llegar a la ultima cargada', () => {
    expect(photoNav(['a', 'b', 'c'], 'b', true)).toMatchObject({ prevId: 'a', nextId: 'c', needsMore: false })
    expect(photoNav(['a', 'b', 'c'], 'c', true)).toMatchObject({ nextId: null, needsMore: true })
    expect(photoNav(['a', 'b', 'c'], 'c', false)).toMatchObject({ nextId: null, needsMore: false })
    // un link compartido a una foto aun no cargada pide mas paginas en vez de declararla inexistente
    expect(photoNav(['a'], 'zzz', true)).toMatchObject({ found: false, needsMore: true })
    expect(photoNav(['a'], 'zzz', false)).toMatchObject({ found: false, needsMore: false })
  })
  // Prevents: cambiar de foto al hacer scroll vertical o con un roce corto en el movil.
  it('swipeDirection respeta umbral y predominio horizontal', () => {
    expect(swipeDirection(-80, 5)).toBe('next')
    expect(swipeDirection(80, 5)).toBe('prev')
    expect(swipeDirection(-20, 0)).toBeNull()
    expect(swipeDirection(-60, 120)).toBeNull()
  })
  // Prevents: que mover la foto ampliada con un dedo, o el pinch-zoom, salte a otra foto.
  it('swipeAction no cambia de foto con varios dedos ni con la pagina ampliada', () => {
    expect(swipeAction(-80, 5, { multi: false, scale: 1 })).toBe('next')
    expect(swipeAction(80, 5, { multi: false })).toBe('prev')
    expect(swipeAction(-20, 0, { multi: false, scale: 1 })).toBeNull()
    expect(swipeAction(-60, 120, { multi: false, scale: 1 })).toBeNull()
    expect(swipeAction(-80, 5, { multi: true, scale: 1 })).toBeNull()
    expect(swipeAction(-80, 5, { multi: false, scale: 1.5 })).toBeNull()
  })
  // Prevents: links compartidos rotos por ids con caracteres especiales.
  it('photoPath arma la URL compartible y escapa ids', () => {
    expect(photoPath('ev1', 'p1')).toBe('/eventos/ev1/fotos/p1')
    expect(photoPath('a/b', 'c d')).toBe('/eventos/a%2Fb/fotos/c%20d')
  })
  // Prevents: mostrar "sin fotos" mientras carga, o confundir evento no disponible con evento vacio.
  it('galleryState separa cargando, no disponible, vacio y listo', () => {
    expect(galleryState({ loading: true, eventFound: false, photoCount: 0 })).toBe('loading')
    expect(galleryState({ loading: false, eventFound: false, photoCount: 0 })).toBe('unavailable')
    expect(galleryState({ loading: false, eventFound: true, photoCount: 0 })).toBe('empty')
    expect(galleryState({ loading: false, eventFound: true, photoCount: 3 })).toBe('ready')
    // Prevents: un fallo de red que se muestra como "evento sin fotos" o "no disponible".
    expect(galleryState({ loading: false, error: true, eventFound: true, photoCount: 0 })).toBe('error')
    expect(galleryState({ loading: false, error: true, eventFound: false, photoCount: 0 })).toBe('error')
  })
})
