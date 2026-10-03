/** Logica pura de autenticacion del panel (sin Firebase, para poder probarla). */

export const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos'
export const NO_ACCESS_ERROR = 'Esta cuenta no tiene acceso'

/** CU5: solo rutas internas /admin; cualquier otra cosa (URL externa, //host, javascript:) vuelve a /admin. */
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string') return '/admin'
  if (!/^\/admin(\/[^\\\s]*)?(\?[^\\\s]*)?(#[^\\\s]*)?$/.test(raw)) return '/admin'
  if (raw === '/admin/login' || raw.startsWith('/admin/login?')) return '/admin'
  return raw
}

/** CU2 y CU10: mensajes en espanol; nunca revela si la cuenta existe. */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
    case 'auth/network-request-failed':
      return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
    default:
      return GENERIC_LOGIN_ERROR
  }
}

/** CU3 */
export function validateEmail(email: string): string | null {
  const v = email.trim()
  if (!v) return 'Ingresa tu correo'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Ingresa un correo válido'
  return null
}

export function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}

/** CU1/CU5/CU6/CU7: decide la navegacion. true = continuar; string = redirigir. */
export function decideAdminNavigation(to: { path: string; fullPath: string }, isAdmin: boolean): true | string {
  if (!isAdminPath(to.path)) return true
  if (to.path === '/admin/login') return isAdmin ? '/admin' : true
  if (isAdmin) return true
  return `/admin/login?redirect=${encodeURIComponent(to.fullPath)}`
}
