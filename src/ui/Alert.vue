<script setup lang="ts">
import Icon from './Icon.vue'

/** Slots: default (mensaje), `action` (a la derecha). `danger` usa role=alert; el resto role=status. */
withDefaults(defineProps<{ tone?: 'neutral' | 'danger' | 'success' }>(), { tone: 'neutral' })
</script>

<template>
  <p :role="tone === 'danger' ? 'alert' : 'status'" class="es-alert" :class="`es-alert-${tone}`">
    <Icon v-if="tone === 'success'" name="check" :size="16" />
    <span><slot /></span>
    <span v-if="$slots.action" class="es-alert-action"><slot name="action" /></span>
  </p>
</template>
