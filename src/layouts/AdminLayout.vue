<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout } from '../auth'
import { SideNav, type SideNavItem } from '../ui'

const router = useRouter()
const route = useRoute()
async function salir() {
  await logout()
  await router.replace('/admin/login')
}

const NAV: Omit<SideNavItem, 'active'>[] = [
  { label: 'Panel', to: '/admin', icon: 'panel' },
  { label: 'Eventos', to: '/admin/eventos', icon: 'eventos' },
  { label: 'Productos', to: '/admin/productos', icon: 'productos' },
  { label: 'Pedidos', to: '/admin/pedidos', icon: 'pedidos' },
  { label: 'Impresión', to: '/admin/impresion', icon: 'impresion' },
  { label: 'Configuración', to: '/admin/configuracion', icon: 'configuracion' },
]
const items = computed<SideNavItem[]>(() => NAV.map((i) => ({
  ...i,
  active: i.to === '/admin' ? route.path === '/admin' : route.path === i.to || route.path.startsWith(`${i.to}/`),
})))
</script>

<template>
  <div class="admin">
    <SideNav class="admin-rail" :items="items" @logout="salir" />
    <main class="admin-main"><RouterView /></main>
  </div>
</template>

<style scoped>
.admin { min-height: 100vh; display: flex; flex-wrap: wrap; background: var(--surface); }
.admin-rail { flex: 1 1 var(--rail-width); max-width: 100%; }
.admin-main { flex: 999 1 560px; min-width: 0; padding: 44px var(--space-12) var(--space-18); box-sizing: border-box; }
@media (min-width: 900px) {
  .admin-rail { position: sticky; top: 0; height: 100vh; max-width: var(--rail-width); }
}
/* Bajo 900 el rail es la barra superior: siempre fila completa (si no, entre ~800 y 899 queda como columna de 240px),
   y las filas no se estiran a la altura de la ventana (la barra mide lo que su contenido). */
@media (max-width: 899.98px) {
  .admin { align-content: flex-start; }
  .admin-rail { flex-basis: 100%; }
}
@media (max-width: 720px) {
  .admin-main { padding: var(--space-6) var(--space-4) var(--space-12); }
}
</style>
