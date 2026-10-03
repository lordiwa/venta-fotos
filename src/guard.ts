import type { Router } from 'vue-router'
import { decideAdminNavigation } from './authLogic'

/** CU8: espera el estado inicial de auth antes de decidir (el panel nunca se pinta antes). */
export function installAdminGuard(router: Router, ready: Promise<void>, isAdmin: () => boolean) {
  router.beforeEach(async (to) => {
    await ready
    return decideAdminNavigation(to, isAdmin())
  })
}
