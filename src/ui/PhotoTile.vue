<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

/** Miniatura con velo al pasar el cursor. Con `to`/`href` es un enlace; sin ellos, un div. Dentro de `<ul class="es-gallery"><li>` forma la galería. */
const props = defineProps<{ src: string; alt?: string; label?: string; cta?: string; span?: 'big' | 'wide'; to?: string; href?: string }>()

const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'div'))
const attrs = computed(() => (props.to ? { to: props.to } : props.href ? { href: props.href } : {}))
</script>

<template>
  <component :is="tag" v-bind="attrs" class="es-tile" :class="{ 'es-tile-big': span === 'big', 'es-tile-wide': span === 'wide' }" :aria-label="to || href ? `Ver ${label || 'foto'}` : undefined">
    <img :src="src" :alt="alt ?? ''">
    <span class="es-tile-veil" aria-hidden="true"><span>{{ label }}</span><span class="es-tile-cta">{{ cta || 'Ver' }}</span></span>
  </component>
</template>
