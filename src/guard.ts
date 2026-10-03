import type { Router } from 'vue-router'
import { decideAdminNavigation } from './authLogic'

/** CU8: espera el estado inicial de auth antes de decidir (el panel nunca se pinta antes). */
export function installAdminGuard(router: Router, ready: Promise<void>, isAdmin: () => boolean) {
  router.beforeEach(async (to) => {
    const info = {
      fullPath: to.fullPath,
      requiresAdmin: to.matched.some((r) => r.meta.requiresAdmin),
      isLogin: to.matched.some((r) => r.meta.adminLogin),
    }
    if (!info.requiresAdmin && !info.isLogin) return true // paginas publicas no esperan a Firebase Auth
    await ready
    return decideAdminNavigation(info, isAdmin())
  })
}
