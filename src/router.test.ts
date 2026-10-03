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
})
