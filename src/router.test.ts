// Prevents: ruta inexistente que deja pantalla en blanco en vez de la 404 del layout publico (UC1/UC2).
import { afterEach, describe, it, expect, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './router'

describe('router', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('resuelve / y /admin a layouts distintos y lo desconocido a not-found', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/admin').name).toBe('admin')
    expect(router.resolve('/no-existe').name).toBe('not-found')
    expect(router.resolve('/no-existe').matched[0].path).toBe('/')
  })

  // Prevents: /carrito cayendo en la 404 del layout publico.
  it('/carrito resuelve a cart bajo el layout publico', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/carrito').name).toBe('cart')
  })

  // Prevents: /checkout o /pedido/<n> cayendo en la 404 (el comprador pagaria y no veria su confirmacion).
  it('/checkout y /pedido/:number resuelven bajo el layout publico', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/checkout').name).toBe('checkout')
    const o = router.resolve('/pedido/ABCD2345')
    expect(o.name).toBe('order')
    expect(o.params.number).toBe('ABCD2345')
    expect(router.resolve('/descargas').name).toBe('downloads')
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

  // Daño: el comprador sin PayPal llega a un /checkout roto ("PayPal no configurado") desde un enlace viejo o URL escrita.
  it('/checkout redirige a /carrito sin VITE_PAYPAL_CLIENT_ID y entra con el', async () => {
    vi.stubEnv('VITE_PAYPAL_CLIENT_ID', '')
    const r1 = createRouter({ history: createMemoryHistory(), routes })
    await r1.push('/checkout')
    expect(r1.currentRoute.value.name).toBe('cart')
    vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'AbC123')
    const r2 = createRouter({ history: createMemoryHistory(), routes })
    await r2.push('/checkout')
    expect(r2.currentRoute.value.name).toBe('checkout')
  })
})
