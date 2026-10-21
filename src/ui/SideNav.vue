<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Wordmark from './Wordmark.vue'
import type { IconName } from './icons'
import { centerActiveItem } from './railScroll'

export interface SideNavItem { label: string; to: string; icon?: IconName; active?: boolean }

/** `items[].active` lo decide el llamador (según la ruta). Emite `logout` al pulsar Cerrar sesión. */
const props = withDefaults(defineProps<{ items: SideNavItem[]; homeTo?: string; storeTo?: string; subtitle?: string }>(), { homeTo: '/admin', storeTo: '/', subtitle: 'Administración' })
defineEmits<{ logout: [] }>()

// En movil el nav es una fila con scroll horizontal: mantener visible el enlace activo (solo dentro del nav).
const nav = ref<HTMLElement | null>(null)
onMounted(() => centerActiveItem(nav.value))
watch(() => props.items.findIndex((i) => i.active), () => nextTick(() => centerActiveItem(nav.value)))
</script>

<template>
  <aside class="es-rail">
    <RouterLink :to="homeTo" class="es-rail-brand"><Wordmark on-rail /><span class="es-rail-sub">{{ subtitle }}</span></RouterLink>
    <nav ref="nav" class="es-rail-nav" aria-label="Secciones">
      <RouterLink v-for="it in items" :key="it.label" :to="it.to" class="es-rail-item" :class="{ on: it.active }" :aria-current="it.active ? 'page' : undefined"><Icon v-if="it.icon" :name="it.icon" />{{ it.label }}</RouterLink>
    </nav>
    <div class="es-rail-foot">
      <RouterLink :to="storeTo" class="es-rail-item es-rail-item-sm" title="Ver tienda"><Icon name="externo" /><span class="es-rail-foot-label">Ver tienda</span></RouterLink>
      <button type="button" class="es-rail-item es-rail-item-sm es-rail-button" title="Cerrar sesión" @click="$emit('logout')"><Icon name="salir" /><span class="es-rail-foot-label">Cerrar sesión</span></button>
    </div>
  </aside>
</template>
