// Prevents: ruta inexistente que deja pantalla en blanco en vez de la 404 del layout publico (UC1/UC2).
import { describe, it, expect } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './router'

describe('router', () => {
  it('resuelve / y /admin a layouts distintos y lo desconocido a not-found', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/admin').name).toBe('admin')
    expect(router.resolve('/no-existe').name).toBe('not-found')
    expect(router.resolve('/no-existe').matched[0].path).toBe('/')
  })

  // Prevents: link compartido a una foto que no resuelve (o que monta otra vista) en vez de la galeria del evento.
  it('/eventos/:id y /eventos/:id/fotos/:photoId resuelven con sus params bajo el layout publico', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const ev = router.resolve('/eventos/e1')
    const ph = router.resolve('/eventos/e1/fotos/p9')
    expect(ev.name).toBe('event')
    expect(ph.name).toBe('event-photo')
    expect(ph.params).toMatchObject({ eventId: 'e1', photoId: 'p9' })
    expect(ph.matched.map((m) => m.name)).toContain('event')
  })
})
