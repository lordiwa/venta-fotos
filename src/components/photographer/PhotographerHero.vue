<script setup lang="ts">
import { computed } from 'vue'
import { photographerContent, photoSources, type ContactLinks } from '../../photographerLogic'
import { useI18n } from '../../i18n'
import type { whatsappLinkAttrs } from '../../whatsappLogic'
import ContactList from './ContactList.vue'
import { Button } from '../../ui'

defineProps<{ links: ContactLinks; waAttrs: ReturnType<typeof whatsappLinkAttrs> }>()
const { t, locale } = useI18n()
const c = computed(() => photographerContent(locale.value))
const portrait = computed(() => photoSources(c.value.portrait))
</script>

<template>
  <section class="hero" aria-labelledby="fotografo-nombre">
    <figure class="portrait">
      <img :src="portrait.src" :alt="c.portrait.alt" :width="c.portrait.width" :height="c.portrait.height" fetchpriority="high" />
    </figure>
    <div class="body">
      <span class="eyebrow kicker">{{ t.photographer.kicker }}</span>
      <h1 id="fotografo-nombre" class="name">Mauricio <em>Reinoso</em></h1>
      <p class="role">{{ c.role }}</p>
      <span class="rule" aria-hidden="true" />
      <p class="lead bio">{{ c.bio }}</p>
      <div class="actions">
        <Button variant="accent" size="lg" icon="telefono" :href="links.quote" v-bind="waAttrs">{{ t.photographer.quote }}</Button>
        <a class="see" href="#portafolio">{{ t.photographer.seePortfolio }} <span aria-hidden="true">↓</span></a>
      </div>
      <ContactList :links="links" :wa-attrs="waAttrs" on-dark />
    </div>
  </section>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); overflow: hidden; border-radius: var(--radius-lg); background: var(--rail); color: var(--on-rail); }
.portrait { margin: 0; min-height: 100%; background: var(--surface-sunken); }
.portrait img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
.body { display: flex; flex-direction: column; justify-content: center; gap: var(--space-4); padding: var(--space-14) var(--space-12); min-width: 0; }
.kicker { text-transform: uppercase; color: var(--amber); }
.name { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: clamp(52px, 7vw, 92px); line-height: .92; letter-spacing: -.035em; color: var(--on-rail); }
.name em { display: block; font-style: normal; font-weight: 500; }
.role { margin: var(--space-2) 0 0; font-family: var(--font-mono); font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: var(--amber); }
.rule { width: 56px; height: 4px; border-radius: 2px; background: var(--amber); }
.bio { margin: 0; max-width: 52ch; color: var(--on-rail-muted); text-wrap: pretty; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-6); margin: var(--space-2) 0 var(--space-3); }
.see { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-md); color: var(--on-rail); font-weight: 600; text-decoration: none; }
.see:hover { color: var(--amber); }
@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; }
  .portrait { aspect-ratio: 1 / 1.1; }
  .body { padding: var(--space-8) var(--space-5); }
}
</style>
