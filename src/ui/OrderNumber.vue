<script setup lang="ts">
/** El número va en el slot. `caption` vacío (cadena vacía) oculta el rótulo. */
withDefaults(defineProps<{ size?: 'md' | 'sm'; caption?: string }>(), { size: 'md', caption: 'Número de pedido' })
</script>

<template>
  <div class="es-ordernum" :class="{ 'es-ordernum-sm': size === 'sm' }">
    <span v-if="caption" class="es-eyebrow es-eyebrow-muted">{{ caption }}</span>
    <strong class="es-ordernum-value"><slot /></strong>
  </div>
</template>
