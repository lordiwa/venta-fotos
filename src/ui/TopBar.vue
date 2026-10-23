<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import Wordmark from './Wordmark.vue'
import { LOCALES, useI18n } from '../i18n'

export interface TopBarLink { label: string; to: string }

const props = withDefaults(defineProps<{ links?: TopBarLink[]; cartCount?: number; homeTo?: string; cartTo?: string }>(), {
  links: undefined,
  cartCount: 0,
  homeTo: '/',
  cartTo: '/carrito',
})

const { t, locale, setLocale } = useI18n()
const items = computed<TopBarLink[]>(() => props.links ?? [
  { label: t.value.topbar.events, to: '/#eventos' }, { label: t.value.topbar.photographer, to: '/fotografo' }, { label: t.value.topbar.downloads, to: '/descargas' },
])
const cartLabel = computed(() => t.value.topbar.cartLabel(props.cartCount))
</script>

<template>
  <header class="es-topbar">
    <Wordmark :to="homeTo" />
    <nav :aria-label="t.topbar.nav" class="es-topbar-nav">
      <RouterLink v-for="l in items" :key="l.to" :to="l.to" class="es-topbar-link">{{ l.label }}</RouterLink>
    </nav>
    <!-- Fuera del nav: en movil el carrito (y el idioma) suben a la fila de la marca y los enlaces quedan en una sola fila debajo. -->
    <div class="es-topbar-tools">
      <div class="es-lang" role="group" :aria-label="t.lang.switcher">
        <button
          v-for="l in LOCALES" :key="l" type="button" class="es-lang-btn" :lang="l" :aria-label="t.lang[l]" :aria-pressed="locale === l" :data-testid="`lang-${l}`"
          @click="setLocale(l)"
        >{{ l.toUpperCase() }}</button>
      </div>
      <RouterLink :to="cartTo" class="es-cart" :aria-label="cartLabel"><Icon name="carrito" /><span class="es-cart-text">{{ t.topbar.cart }}</span><span class="es-cart-count" data-testid="cart-badge">{{ cartCount }}</span></RouterLink>
    </div>
  </header>
</template>
