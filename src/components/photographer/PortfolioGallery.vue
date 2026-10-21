<script setup lang="ts">
import { computed, ref } from 'vue'
import PhotoLightbox from '../PhotoLightbox.vue'
import { PORTFOLIO, mobileSolo, photoSources } from '../../photographerLogic'

const num = (i: number) => String(i + 1).padStart(2, '0')
const categories = PORTFOLIO.map((c) => {
  const solo = mobileSolo(c.photos)
  return { ...c, tiles: c.photos.map((p, i) => ({ ...p, ...photoSources(p), solo: solo[i] })) }
})
// El visor recorre todo el portafolio, en orden de categorias.
const all = categories.flatMap((c, ci) => c.tiles.map((t, i) => ({ ...t, caption: `${num(ci)} · ${c.name} · ${i + 1} de ${c.tiles.length}` })))
const open = ref<number | null>(null)
const current = computed(() => (open.value === null ? null : all[open.value]))
const show = (slug: string) => { open.value = all.findIndex((t) => t.slug === slug) }
const step = (d: number) => { if (open.value !== null) open.value = Math.min(all.length - 1, Math.max(0, open.value + d)) }
</script>

<template>
  <section id="portafolio" class="folio" aria-labelledby="portafolio-titulo">
    <div class="folio-head">
      <h2 id="portafolio-titulo" class="display-md">Portafolio</h2>
      <nav class="cats" aria-label="Categorías del portafolio">
        <a v-for="c in categories" :key="c.id" :href="`#${c.id}`">{{ c.name }}</a>
      </nav>
    </div>
    <section v-for="(c, ci) in categories" :id="c.id" :key="c.id" class="cat" :aria-labelledby="`${c.id}-t`">
      <header class="cat-head">
        <span class="num">{{ num(ci) }}</span>
        <h3 :id="`${c.id}-t`" class="display-sm cat-name">{{ c.name }}</h3>
        <p class="blurb">{{ c.blurb }}</p>
      </header>
      <ul class="row">
        <li v-for="t in c.tiles" :key="t.slug" class="tile" :class="{ solo: t.solo }" :style="{ flexGrow: t.width / t.height, aspectRatio: `${t.width} / ${t.height}` }">
          <button type="button" class="open" :aria-label="`Ampliar: ${t.alt}`" @click="show(t.slug)">
            <img :src="t.src" :srcset="t.srcset" sizes="(max-width: 720px) 100vw, 50vw" :alt="t.alt" :width="t.width" :height="t.height" loading="lazy" decoding="async" />
          </button>
        </li>
      </ul>
    </section>
    <PhotoLightbox
      v-if="current && open !== null" :photo="null" :src="current.full" :alt="current.alt" :caption="current.caption" :loading="false"
      :has-prev="open > 0" :has-next="open < all.length - 1" @prev="step(-1)" @next="step(1)" @close="open = null"
    />
  </section>
</template>

<style scoped>
.folio-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-6); padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); }
.folio-head h2 { margin: 0; }
.cats { display: flex; flex-wrap: wrap; gap: 0 var(--space-5); }
.cats a { display: inline-flex; align-items: center; min-height: var(--control-md); font-size: 15px; color: var(--ink-muted); text-decoration: none; }
.cats a:hover { color: var(--amber-ink); }
.cat { margin-top: var(--space-12); scroll-margin-top: var(--space-6); }
.cat-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-4); margin-bottom: var(--space-5); }
.num { font: 13px var(--font-mono); color: var(--amber-ink); }
.cat-name { margin: 0; font-size: clamp(26px, 3.4vw, 34px); font-weight: 800; }
.blurb { margin: 0 0 0 auto; color: var(--ink-muted); font-style: italic; }
/* Cada celda tiene la proporcion de su foto y crece segun ella: en una fila todas quedan de la misma altura y nada se recorta. */
.row { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--space-3); }
.tile { flex-shrink: 1; flex-basis: 0; min-width: 0; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-sunken); }
.open { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.open img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .7s cubic-bezier(.2, .8, .2, 1); }
.open:hover img { transform: scale(1.03); }
.open:focus-visible { outline: 3px solid var(--amber); outline-offset: -3px; }
@media (max-width: 720px) {
  .row { flex-wrap: wrap; gap: var(--space-2); }
  .tile.solo { flex-basis: 100%; }
  .blurb { flex-basis: 100%; margin-left: 0; }
  .cat { margin-top: var(--space-10); }
}
@media (prefers-reduced-motion: reduce) {
  .open img { transition: none; }
  .open:hover img { transform: none; }
}
</style>
