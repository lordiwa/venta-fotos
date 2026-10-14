<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import logoOnDark from '../assets/logo-dark-bg.png'
import logoOnLight from '../assets/logo-light-bg.png'

const props = defineProps<{ to?: string; href?: string; onRail?: boolean }>()
const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'span'))
const attrs = computed(() => (props.to ? { to: props.to } : props.href ? { href: props.href } : {}))
</script>

<template>
  <component :is="tag" v-bind="attrs" class="es-wordmark" :class="{ 'es-wordmark-rail': onRail }">
    <!-- alt vacio: el texto visible ya nombra la marca (un solo nombre para el lector de pantalla) -->
    <img v-if="!onRail" :src="logoOnLight" alt="" class="es-wordmark-logo es-wordmark-logo-onlight" width="40" height="40" />
    <img :src="logoOnDark" alt="" class="es-wordmark-logo es-wordmark-logo-ondark" width="40" height="40" />
    <slot>Martial Photo</slot>
  </component>
</template>
