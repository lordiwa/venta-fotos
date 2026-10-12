<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{ to?: string; href?: string; onRail?: boolean }>()
const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'span'))
const attrs = computed(() => (props.to ? { to: props.to } : props.href ? { href: props.href } : {}))
</script>

<template>
  <component :is="tag" v-bind="attrs" class="es-wordmark" :class="{ 'es-wordmark-rail': onRail }">
    <span class="es-wordmark-dot" aria-hidden="true" /><slot>Venta de Fotos</slot>
  </component>
</template>
