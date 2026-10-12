<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'
import type { IconName } from './icons'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'lg'
  icon?: IconName
  /** Solo icono: no se dibuja el slot; `label` es el aria-label. */
  iconOnly?: boolean
  label?: string
  /** Ruta interna (RouterLink). */
  to?: string
  /** Enlace externo (<a>). Sin to ni href es un <button>. */
  href?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}>(), { variant: 'secondary', size: 'md', type: 'button' })

const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'button'))
const attrs = computed(() => (props.to ? { to: props.to } : props.href ? { href: props.href } : { type: props.type, disabled: props.disabled }))
</script>

<template>
  <component
    :is="tag" v-bind="attrs" class="es-btn" :class="[`es-btn-${variant}`, `es-btn-${size}`, { 'es-btn-icon': iconOnly }]"
    :aria-label="iconOnly ? label : undefined"
  >
    <Icon v-if="icon" :name="icon" :size="size === 'lg' ? 18 : 16" />
    <slot v-if="!iconOnly" />
  </component>
</template>
