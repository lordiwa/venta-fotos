<script setup lang="ts">
defineProps<{ muted?: boolean }>()
</script>

<template>
  <span class="es-eyebrow" :class="{ 'es-eyebrow-muted': muted }"><slot /></span>
</template>
