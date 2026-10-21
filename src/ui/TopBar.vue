<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import Wordmark from './Wordmark.vue'

export interface TopBarLink { label: string; to: string }

const props = withDefaults(defineProps<{ links?: TopBarLink[]; cartCount?: number; homeTo?: string; cartTo?: string }>(), {
  links: () => [{ label: 'Eventos', to: '/#eventos' }, { label: 'El fotógrafo', to: '/fotografo' }, { label: 'Mis descargas', to: '/descargas' }],
  cartCount: 0,
  homeTo: '/',
  cartTo: '/carrito',
})

const cartLabel = computed(() => `Carrito, ${props.cartCount ? `${props.cartCount} productos` : 'vacío'}`)
</script>

<template>
  <header class="es-topbar">
    <Wordmark :to="homeTo" />
    <nav aria-label="Principal" class="es-topbar-nav">
      <RouterLink v-for="l in links" :key="l.label" :to="l.to" class="es-topbar-link">{{ l.label }}</RouterLink>
    </nav>
    <!-- Fuera del nav: en movil el carrito sube a la fila de la marca y los enlaces quedan en una sola fila debajo. -->
    <RouterLink :to="cartTo" class="es-cart" :aria-label="cartLabel"><Icon name="carrito" /><span class="es-cart-text">Carrito</span><span class="es-cart-count" data-testid="cart-badge">{{ cartCount }}</span></RouterLink>
  </header>
</template>
