<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PhotoThumb from '../components/PhotoThumb.vue'
import PhotoLightbox from '../components/PhotoLightbox.vue'
import { fetchPhotosPage, getPublishedEvent, type PhotoCursor } from '../publicApi'
import { eventPath, galleryState, isPrintOnly, photoNav, photoPath } from '../galleryLogic'
import { dedicatedCoverPath } from '../eventsLogic'
import { getActiveCatalog } from '../productsApi'
import { formatMoney } from '../productsLogic'
import { packsInfo, type PacksInfo } from '../packsInfo'
import { Alert, Button, Icon } from '../ui'
import { useI18n } from '../i18n'
import { formatDate } from '../i18n/format'
import { eventTitle } from '../i18n/pageMeta'
import type { Event, Photo } from '../types'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const eventId = computed(() => String(route.params.eventId))
const photoId = computed(() => (route.params.photoId ? String(route.params.photoId) : null))

const event = ref<Event | null>(null)
const photos = ref<Photo[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(false)
const failed = ref(false) // fallo al cargar una pagina posterior (hay fotos ya cargadas)
const loadError = ref(false) // fallo al cargar el evento o la primera pagina
let inflight: Promise<void> | null = null
let gen = 0 // descarta resultados de cargas de un evento anterior
let cursor: PhotoCursor = null
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const ids = () => photos.value.map((p) => p.id)
const state = computed(() => galleryState({ loading: loading.value, error: loadError.value, eventFound: !!event.value, photoCount: photos.value.length }))
const nav = computed(() => (photoId.value ? photoNav(ids(), photoId.value, hasMore.value) : null))
const cover = computed(() => photos.value.find((p) => p.id === event.value?.coverPhotoId) ?? null)
/** TASK-028: portada dedicada en alta si existe; si no, la miniatura (solo si la foto ya esta en la pagina cargada). */
const heroPath = computed(() => (event.value && dedicatedCoverPath(event.value)) ?? cover.value?.thumbPath)
const dateText = computed(() => {
  const e = event.value
  if (!e) return ''
  return `${formatDate(e.date.toDate(), locale.value)}${e.place ? ` · ${e.place}` : ''}`
})
const position = computed(() => photos.value.findIndex((p) => p.id === photoId.value) + 1) // 0 si aun no se cargo
const tag = computed(() => (position.value ? t.value.gallery.tag(position.value) : ''))
const caption = computed(() => {
  if (!position.value) return event.value?.name ?? ''
  return t.value.gallery.caption(event.value?.name ?? '', position.value, hasMore.value ? null : photos.value.length)
})
// Mosaico: algunas miniaturas ocupan mas espacio (patron cada 15 fotos, como en el diseno).
const spanOf = (i: number) => ([0, 7].includes(i % 15) ? 'es-tile-big' : [3, 9].includes(i % 15) ? 'es-tile-wide' : '')
const current = computed(() => photos.value.find((p) => p.id === photoId.value) ?? null)
// TASK-034: precios de paquetes desde el catalogo activo (cache de sesion). Si falla, no se muestra el bloque.
const packs = ref<PacksInfo | null>(null)
onMounted(() => getActiveCatalog().then((xs) => { packs.value = packsInfo(xs) }, () => {}))

function loadMore(): Promise<void> {
  if (inflight) return inflight // quien pide mas mientras hay una carga en curso espera a la misma
  if (!hasMore.value || failed.value) return Promise.resolve()
  const mine = gen
  loadingMore.value = true
  const p = (async () => {
    try {
      const page = await fetchPhotosPage(eventId.value, cursor)
      if (mine !== gen) return
      photos.value.push(...page.photos)
      cursor = page.cursor
      hasMore.value = page.hasMore
    } catch {
      if (mine === gen) failed.value = true
    } finally {
      if (mine === gen) { loadingMore.value = false; inflight = null }
    }
  })()
  inflight = p
  return p
}

async function load() {
  const mine = ++gen
  loading.value = true; failed.value = false; loadError.value = false; photos.value = []; cursor = null
  event.value = null; inflight = null; loadingMore.value = false; hasMore.value = false
  try {
    const ev = await getPublishedEvent(eventId.value)
    if (mine !== gen) return
    event.value = ev
    if (ev) {
      hasMore.value = true
      await loadMore()
      if (mine === gen && failed.value && !photos.value.length) loadError.value = true
    }
  } catch {
    if (mine === gen) loadError.value = true
  }
  if (mine === gen) loading.value = false
}

function retryMore() { failed.value = false; loadMore() }

// Enlace directo a una foto fuera de lo cargado: se pagina hasta encontrarla o agotar las paginas.
watch([nav, loading, loadingMore], async () => {
  if (!loading.value && !loadingMore.value && nav.value && !nav.value.found && nav.value.needsMore) await loadMore()
})

const open = (id: string) => router.push(photoPath(eventId.value, id))
// replace: prev/next no apilan historial, asi "atras" cierra el lightbox.
const go = async (id: string | null) => { if (id) await router.replace(photoPath(eventId.value, id)) }
async function next() {
  if (nav.value?.nextId) return go(nav.value.nextId)
  if (nav.value?.needsMore) {
    await loadMore() // espera la carga en curso (si la hay) y luego avanza
    await go(photoNav(ids(), photoId.value!, hasMore.value).nextId)
  }
}
const prev = () => go(nav.value?.prevId ?? null)
function close() {
  if (window.history.state?.back) router.back()
  else router.replace(eventPath(eventId.value))
}

function observe() {
  observer?.disconnect()
  if (sentinel.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMore() }, { rootMargin: '400px' })
    observer.observe(sentinel.value)
  }
}
watch(sentinel, observe)
onMounted(load)
// Titulo de la pestaña: el nombre del evento (tal como se cargo en el admin) una vez cargado.
watch(() => event.value?.name ?? null, (n) => { eventTitle.value = n }, { immediate: true })
// Cambio de evento (no de foto) recarga; cambiar de foto no.
watch(eventId, load)
onBeforeUnmount(() => { observer?.disconnect(); eventTitle.value = null })
</script>

<template>
  <p v-if="state === 'loading'" class="mono-sm muted">{{ t.common.loading }}</p>
  <div v-else-if="state === 'error'" class="stack">
    <Alert tone="danger">
      {{ t.gallery.loadError }}
      <template #action><Button @click="load">{{ t.common.retry }}</Button></template>
    </Alert>
  </div>
  <div v-else-if="state === 'unavailable'" class="stack">
    <h1 class="display-lg">{{ t.gallery.unavailableTitle }}</h1>
    <p class="muted">{{ t.gallery.unavailableText }}</p>
    <Button variant="secondary" to="/#eventos">{{ t.gallery.seeAll }}</Button>
  </div>
  <template v-else>
    <section class="hero">
      <div v-if="heroPath" class="hero-img"><PhotoThumb :path="heroPath" fill /></div>
      <div class="hero-shade" aria-hidden="true" />
      <div class="hero-body">
        <RouterLink to="/#eventos" class="back"><Icon name="flecha-izquierda" :size="16" />{{ t.gallery.back }}</RouterLink>
        <div class="hero-row">
          <div class="hero-title-box">
            <h1 class="display-lg hero-title">{{ event!.name }}</h1>
            <span class="mono-sm hero-meta">{{ dateText }}</span>
          </div>
          <span v-if="state === 'ready' && !hasMore" class="mono-sm hero-meta">{{ t.gallery.count(photos.length) }}</span>
        </div>
      </div>
    </section>
    <section v-if="packs && state === 'ready'" class="packs" aria-labelledby="packs-title">
      <h2 id="packs-title" class="es-eyebrow packs-title">{{ t.gallery.packsTitle }}</h2>
      <ul class="packs-list" role="list">
        <li class="pack"><span class="pack-qty">{{ t.gallery.onePhoto }}</span><span class="sr">: </span><span class="pack-price">{{ formatMoney(packs.unitPrice, locale) }}</span></li>
        <li v-for="r in packs.packs" :key="r.quantity" class="pack">
          <span class="pack-qty">{{ t.gallery.nPhotos(r.quantity) }}</span><span class="sr">: </span><span class="pack-price">{{ formatMoney(r.price, locale) }}</span><span class="sr">, </span>
          <span class="pack-save">{{ t.gallery.save(formatMoney(r.savings, locale)) }}</span>
        </li>
      </ul>
      <p class="body-sm muted packs-note">
        {{ t.gallery.packsNote }}
      </p>
    </section>
    <Alert v-if="failed" tone="danger" class="gap">
      {{ t.gallery.loadAllFailed }}
      <template #action><Button @click="retryMore">{{ t.common.retry }}</Button></template>
    </Alert>
    <Alert v-if="state === 'empty' && !failed" class="gap">{{ t.gallery.empty }}</Alert>
    <ul v-else-if="state === 'ready'" class="es-gallery">
      <li v-for="(p, i) in photos" :key="p.id">
        <a :href="photoPath(eventId, p.id)" :aria-label="t.gallery.viewPhoto(i + 1, isPrintOnly(p))" class="es-tile" :class="spanOf(i)" @click.prevent="open(p.id)">
          <PhotoThumb :path="p.thumbPath" fill />
          <span v-if="isPrintOnly(p)" class="es-print-tag" aria-hidden="true">{{ t.gallery.printOnly }}</span>
          <span class="es-tile-veil" aria-hidden="true"><span>#{{ i + 1 }}</span><span class="es-tile-cta">{{ t.gallery.view }}</span></span>
        </a>
      </li>
    </ul>
    <div ref="sentinel" class="sentinel" />
    <p v-if="loadingMore" role="status" class="more"><span class="more-bar" aria-hidden="true" />{{ t.gallery.loadingMore }}</p>
  </template>

  <PhotoLightbox
    v-if="photoId && (state === 'ready' || state === 'empty')"
    :photo="current"
    :loading="!nav?.found && !!nav?.needsMore && !failed"
    :caption="caption" :tag="tag" :event-name="event?.name"
    :has-prev="!!nav?.prevId"
    :has-next="!!nav?.nextId || !!nav?.needsMore"
    @prev="prev" @next="next" @close="close"
  />
</template>

<style scoped>
.muted { color: var(--ink-muted); }
.stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-4); }
.stack h1, .stack p { margin: 0; }
.hero { position: relative; min-height: 280px; display: flex; align-items: flex-end; overflow: hidden; border-radius: var(--radius-lg); background: var(--rail); margin-bottom: var(--space-6); }
.hero-img { position: absolute; inset: 0; }
.hero-shade { position: absolute; inset: 0; background: linear-gradient(180deg, #15140f40 0%, #15140f99 50%, #15140fe6 100%); }
.hero-body { position: relative; width: 100%; padding: var(--space-12) var(--space-8) var(--space-8); display: flex; flex-direction: column; gap: var(--space-4); color: var(--on-rail); min-width: 0; }
.back { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start; text-decoration: none; color: var(--on-rail-muted); font-size: 14px; font-weight: 500; min-height: 44px; }
.back:hover { color: var(--on-rail); }
.hero-row { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
.hero-title-box { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.hero-title { margin: 0; font-size: clamp(36px, 7vw, 72px); color: var(--on-rail); overflow-wrap: anywhere; }
.hero-meta { color: var(--on-rail-muted); }
.gap { margin-bottom: var(--space-4); }
.packs { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-6); padding: var(--space-5) var(--space-6); border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); }
.packs-title { margin: 0; font-weight: 400; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.packs-list { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.pack { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); background: var(--surface-sunken); font-size: 14px; }
.pack-qty { font-weight: 600; }
.pack-price { font-family: var(--font-mono); }
.pack-save { font-family: var(--font-mono); font-size: 12px; color: var(--amber-ink); }
.packs-note { margin: 0; max-width: 72ch; }
.sentinel { height: 1px; }
.more { display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin: 0; padding: var(--space-5); font: 13px var(--font-mono); color: var(--ink-muted); }
.more-bar { display: inline-block; width: 40px; height: 2px; background: linear-gradient(90deg, var(--amber), #0000); }
@media (max-width: 720px) {
  .hero { min-height: 220px; }
  .hero-body { padding: var(--space-6) var(--space-5) var(--space-6); }
  .packs { padding: var(--space-4); }
  .pack { flex: 1 1 0; box-sizing: border-box; min-width: 96px; flex-direction: column; align-items: flex-start; padding: var(--space-2) var(--space-3); }
  .pack-save { font-size: 11px; }
}
</style>
