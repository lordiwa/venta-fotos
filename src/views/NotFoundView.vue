<script setup lang="ts">
import { Button } from '../ui'
</script>

<template>
  <div class="nf">
    <h1 class="display-lg">Página no encontrada</h1>
    <Button variant="secondary" to="/">Volver al inicio</Button>
  </div>
</template>

<style scoped>
.nf { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-5); padding: var(--space-8) 0; }
.nf h1 { margin: 0; }
</style>
