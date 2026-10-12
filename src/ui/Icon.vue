<script setup lang="ts">
import { ICONS, type IconName } from './icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number; strokeWidth?: number; label?: string }>(), { size: 18, strokeWidth: 1.8 })
</script>

<template>
  <svg
    class="es-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round"
    :aria-hidden="label ? undefined : 'true'" :role="label ? 'img' : undefined" :aria-label="label"
    v-html="ICONS[props.name]"
  />
</template>
