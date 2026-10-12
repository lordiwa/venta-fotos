<script setup lang="ts">
import { Eyebrow, Icon, type IconName } from '../ui'

const SECTIONS: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: '/admin/eventos', icon: 'eventos', title: 'Eventos y fotos', text: 'Crea eventos, sube fotos y publícalos en la tienda.' },
  { to: '/admin/productos', icon: 'productos', title: 'Productos y precios', text: 'Tamaños de impresión, archivo digital y sus precios.' },
  { to: '/admin/pedidos', icon: 'pedidos', title: 'Pedidos', text: 'Revisa cada pedido y avanza su estado hasta la entrega.' },
  { to: '/admin/impresion', icon: 'impresion', title: 'Lista de impresión', text: 'Todas las copias pendientes, agrupadas por tamaño.' },
  { to: '/admin/configuracion', icon: 'configuracion', title: 'Configuración de la tienda', text: 'Costo de envío e instrucciones de retiro.' },
]
</script>

<template>
  <div class="page">
    <div class="title">
      <Eyebrow>Administración</Eyebrow>
      <h1 class="display-md">Panel de administración</h1>
    </div>
    <ul class="cards">
      <li v-for="s in SECTIONS" :key="s.to">
        <RouterLink class="card" :to="s.to">
          <span class="ico"><Icon :name="s.icon" :size="22" /></span>
          <span class="txt">
            <span class="display-sm name">{{ s.title }}</span>
            <span class="body-sm">{{ s.text }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
.title { display: flex; flex-direction: column; gap: var(--space-2); }
h1 { margin: 0; color: var(--ink); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: var(--space-4); }
.card { display: flex; flex-direction: column; gap: var(--space-4); height: 100%; padding: 26px; box-sizing: border-box; border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); text-decoration: none; color: var(--ink); transition: border-color .15s, transform .15s; }
.card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.ico { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--surface-sunken); color: var(--amber-ink); }
.txt { display: flex; flex-direction: column; gap: 6px; }
.name { font-size: 20px; }
.txt .body-sm { color: var(--ink-muted); }
</style>
