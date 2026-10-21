<script setup lang="ts">
import type { whatsappLinkAttrs } from '../../whatsappLogic'
import { Button } from '../../ui'

defineProps<{ quoteHref: string; waAttrs: ReturnType<typeof whatsappLinkAttrs> }>()
</script>

<template>
  <section class="cta" aria-labelledby="cta-titulo">
    <div class="copy">
      <span class="eyebrow kicker">Trabajemos juntos</span>
      <h2 id="cta-titulo" class="display-md title">¿Una sesión, un evento o una campaña?</h2>
      <p class="lead text">Escríbeme por WhatsApp, cuéntame qué tienes en mente y te envío una propuesta.</p>
    </div>
    <Button variant="accent" size="lg" icon="telefono" :href="quoteHref" v-bind="waAttrs">Cotizar una sesión</Button>
  </section>
</template>

<style scoped>
.cta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-8); padding: var(--space-12); border-radius: var(--radius-lg); background: var(--rail); color: var(--on-rail); }
.copy { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.kicker { text-transform: uppercase; color: var(--amber); }
.title { margin: 0; color: var(--on-rail); font-size: clamp(30px, 4.4vw, 44px); text-wrap: balance; }
.text { margin: 0; max-width: 48ch; color: var(--on-rail-muted); }
@media (max-width: 720px) {
  .cta { padding: var(--space-8) var(--space-5); gap: var(--space-6); }
  .cta :deep(.es-btn) { width: 100%; }
}
</style>
