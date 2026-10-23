<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listScrollAfterLoad } from '../router'
import { listPublishedEvents, type PublicEvent } from '../publicApi'
import { eventPath } from '../galleryLogic'
import { Alert, Eyebrow, Icon } from '../ui'
import { useI18n } from '../i18n'
import { formatDate } from '../i18n/format'

const route = useRoute()
const { t, locale } = useI18n()
const events = ref<PublicEvent[]>([])
const loading = ref(true)
const failed = ref(false)
const featured = computed(() => events.value[0] ?? null)
const rest = computed(() => events.value.slice(1))
const meta = (e: PublicEvent) => `${fmt(e)}${e.place ? ` · ${e.place}` : ''}`
const fmt = (e: PublicEvent) => formatDate(e.date.toDate(), locale.value)

onMounted(async () => {
  try { events.value = await listPublishedEvents() } catch { failed.value = true }
  loading.value = false
  const behavior = listScrollAfterLoad(route.hash)
  if (behavior) { await nextTick(); document.getElementById('eventos')?.scrollIntoView({ behavior }) }
})
</script>

<template>
  <section class="hero">
    <div v-if="featured?.coverImagePath" class="hero-img"><PhotoThumb :path="featured.coverImagePath" fill /></div>
    <div class="hero-shade" aria-hidden="true" />
    <div class="hero-body">
      <span class="eyebrow hero-eyebrow">{{ t.home.eyebrow }}</span>
      <h1 class="display-xl hero-title">{{ t.home.title }}</h1>
      <p class="lead hero-lead">{{ t.home.lead }}</p>
    </div>
  </section>

  <div class="list-head">
    <h2 id="eventos" class="display-md">{{ t.home.events }}</h2>
    <span v-if="events.length" class="mono-sm muted">{{ t.home.published(events.length) }}</span>
  </div>
  <p v-if="loading" class="mono-sm muted">{{ t.common.loading }}</p>
  <Alert v-else-if="failed" tone="danger">{{ t.home.loadFailed }}</Alert>
  <Alert v-else-if="!events.length">{{ t.home.none }}</Alert>
  <template v-else>
    <RouterLink v-if="featured" :to="eventPath(featured.id)" class="card feature">
      <div class="feature-img"><PhotoThumb :path="featured.coverImagePath" fill /></div>
      <div class="feature-body">
        <Eyebrow>{{ t.home.latest }}</Eyebrow>
        <span class="display-lg feature-name">{{ featured.name }}</span>
        <span class="mono-sm muted">{{ meta(featured) }}</span>
        <span class="feature-cta">{{ t.home.viewPhotos }} <Icon name="flecha-derecha" :size="18" /></span>
      </div>
    </RouterLink>
    <ul v-if="rest.length" class="events">
      <li v-for="e in rest" :key="e.id">
        <RouterLink :to="eventPath(e.id)" class="card item">
          <div class="item-img"><PhotoThumb :path="e.coverImagePath" fill /></div>
          <span class="display-sm">{{ e.name }}</span>
          <span class="mono-sm muted">{{ meta(e) }}</span>
        </RouterLink>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.muted { color: var(--ink-muted); }
.hero { position: relative; min-height: 420px; display: flex; align-items: flex-end; overflow: hidden; border-radius: var(--radius-lg); background: var(--rail); margin-bottom: var(--space-8); }
.hero-img { position: absolute; inset: 0; }
.hero-shade { position: absolute; inset: 0; background: linear-gradient(180deg, #15140f1a 0%, #15140f80 55%, #15140fe6 100%); }
.hero-body { position: relative; width: 100%; padding: var(--space-18) var(--space-8) var(--space-10); display: flex; flex-direction: column; gap: var(--space-5); color: var(--on-rail); }
.hero-eyebrow { text-transform: uppercase; color: var(--amber); }
.hero-title { margin: 0; font-size: clamp(44px, 8vw, 104px); max-width: 11ch; text-wrap: balance; color: var(--on-rail); }
.hero-lead { margin: 0; max-width: 46ch; color: var(--on-rail-muted); text-wrap: pretty; }
.list-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-4); margin-bottom: var(--space-7); border-bottom: 1px solid var(--line); }
.list-head h2 { margin: 0; font-size: 30px; }
.card { text-decoration: none; color: var(--ink); }
.card :deep(img) { transition: transform .7s cubic-bezier(.2, .8, .2, 1); }
.card:hover :deep(img) { transform: scale(1.045); }
.feature { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); overflow: hidden; border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); margin-bottom: var(--space-7); }
.feature-img { aspect-ratio: 16 / 10; overflow: hidden; background: var(--surface-sunken); }
.feature-body { display: flex; flex-direction: column; justify-content: flex-end; gap: var(--space-3); padding: var(--space-8); min-width: 0; }
.feature-name { font-size: clamp(30px, 5vw, 44px); overflow-wrap: anywhere; }
.feature-cta { display: inline-flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); color: var(--amber-ink); font-weight: 600; }
.events { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: var(--space-6); }
.item { display: flex; flex-direction: column; gap: var(--space-3); }
.item-img { aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-sunken); }
.item .display-sm { overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .hero { min-height: 340px; }
  .hero-body { padding: var(--space-12) var(--space-5) var(--space-6); }
  .feature-body { padding: var(--space-6) var(--space-5); }
}
</style>
