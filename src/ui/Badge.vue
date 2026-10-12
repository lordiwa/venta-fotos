<script setup lang="ts">
import { computed } from 'vue'

type Tone = 'neutral' | 'success' | 'amber' | 'info' | 'teal' | 'violet' | 'danger'
const TONES: Record<string, Tone> = { publicado: 'success', activo: 'success', entregado: 'success', borrador: 'neutral', inactivo: 'neutral', pagado: 'amber', impreso: 'info', listo: 'teal', listo_retiro: 'teal', enviado: 'violet' }
const LABELS: Record<string, string> = { publicado: 'Publicado', activo: 'Activo', entregado: 'Entregado', borrador: 'Borrador', inactivo: 'Inactivo', pagado: 'Pagado', impreso: 'Impreso', listo: 'Listo para retiro', listo_retiro: 'Listo para retiro', enviado: 'Enviado' }

const props = defineProps<{ tone?: Tone; status?: string }>()
const resolvedTone = computed<Tone>(() => props.tone ?? (props.status ? TONES[props.status] : undefined) ?? 'neutral')
const statusLabel = computed(() => (props.status ? LABELS[props.status] ?? '' : ''))
</script>

<template>
  <span class="es-badge" :class="`es-badge-${resolvedTone}`"><span class="es-badge-dot" aria-hidden="true" /><slot>{{ statusLabel }}</slot></span>
</template>
