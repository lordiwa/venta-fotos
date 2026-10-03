import { describe, it, expect, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './router'
import { installAdminGuard } from './guard'
import { GENERIC_LOGIN_ERROR, authErrorMessage, safeRedirect, validateEmail } from './authLogic'

// Las vistas lazy importan ./auth (Firebase real); se reemplaza para no inicializarlo en tests.
vi.mock('./auth', () => ({ login: vi.fn(), logout: vi.fn(), authState: { isAdmin: false }, authReady: Promise.resolve() }))

const mk = (ready: Promise<void>, admin: () => boolean) => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  installAdminGuard(router, ready, admin)
  return router
}

describe('auth', () => {
  // Evita: un visitante o cuenta sin claim ve el panel; el admin logueado ve el login (CU5, CU6, CU7).
  it('guard: sin admin /admin/** va al login con redirect; con admin /admin/login va al panel', async () => {
    const out = mk(Promise.resolve(), () => false)
    await out.push('/admin/eventos?x=1')
    expect(out.currentRoute.value.path).toBe('/admin/login')
    expect(out.currentRoute.value.query.redirect).toBe('/admin/eventos?x=1')
    const adm = mk(Promise.resolve(), () => true)
    await adm.push('/admin/login')
    expect(adm.currentRoute.value.path).toBe('/admin')
  })

  // Evita: saltarse el login con otra capitalizacion o ruta hija (/Admin, /ADMIN/, /admin/, /admin/x/y) (R-1).
  it('guard: variantes de mayusculas y rutas hijas tambien exigen login', async () => {
    for (const p of ['/Admin', '/ADMIN/', '/admin/', '/admin/x/y', '/Admin/Eventos']) {
      const r = mk(Promise.resolve(), () => false)
      await r.push(p)
      expect(r.currentRoute.value.path, p).toBe('/admin/login')
    }
  })

  // Evita: que las paginas publicas se bloqueen esperando a Firebase Auth.
  it('guard: la ruta publica no espera el estado de auth', async () => {
    const r = mk(new Promise<void>(() => {}), () => false)
    await r.push('/')
    expect(r.currentRoute.value.name).toBe('home')
  })

  // Evita: parpadeo del panel al recargar porque se decide antes de conocer la sesion (CU8).
  it('guard: espera el estado inicial de auth antes de decidir', async () => {
    let release!: () => void
    let admin = false
    const router = mk(new Promise<void>((r) => (release = r)), () => admin)
    const nav = router.push('/admin')
    await new Promise((r) => setTimeout(r, 20))
    expect(router.currentRoute.value.path).toBe('/') // sigue sin resolver: ni panel ni login
    admin = true
    release()
    await nav
    expect(router.currentRoute.value.path).toBe('/admin')
  })

  // Evita: open redirect tras el login hacia sitios externos (CU5).
  it('safeRedirect: solo rutas internas /admin', () => {
    expect(safeRedirect('/admin/eventos?a=1')).toBe('/admin/eventos?a=1')
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/adminx', 'javascript:alert(1)', '/otra', '/admin/../x', '/admin/%2e%2e/x', '/admin/%2E%2E%2fx', undefined, ['/admin']])
      expect(safeRedirect(bad)).toBe('/admin')
    expect(safeRedirect('/admin/login')).toBe('/admin')
  })

  // Evita: revelar si la cuenta existe y dejar al usuario sin explicacion en el bloqueo (CU2, CU10).
  it('authErrorMessage: generico para credenciales, claro para too-many-requests', () => {
    for (const c of ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-email', undefined])
      expect(authErrorMessage(c)).toBe(GENERIC_LOGIN_ERROR)
    expect(authErrorMessage('auth/too-many-requests')).toMatch(/Demasiados intentos/)
  })

  // Evita: enviar a Firebase correos vacios o mal formados (CU3).
  it('validateEmail: rechaza vacio y mal formado', () => {
    expect(validateEmail('  ')).not.toBeNull()
    expect(validateEmail('foo')).not.toBeNull()
    expect(validateEmail('a@b.co')).toBeNull()
  })
})
