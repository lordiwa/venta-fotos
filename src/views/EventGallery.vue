<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PhotoThumb from '../components/PhotoThumb.vue'
import PhotoLightbox from '../components/PhotoLightbox.vue'
import { fetchPhotosPage, getPublishedEvent, type PhotoCursor } from '../publicApi'
import { eventPath, galleryState, photoNav, photoPath } from '../galleryLogic'
import type { Event, Photo } from '../types'

const route = useRoute()
const router = useRouter()
const eventId = computed(() => String(route.params.eventId))
const photoId = computed(() => (route.params.photoId ? String(route.params.photoId) : null))

const event = ref<Event | null>(null)
const photos = ref<Photo[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(false)
const failed = ref(false)
let cursor: PhotoCursor = null
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const ids = () => photos.value.map((p) => p.id)
const state = computed(() => galleryState({ loading: loading.value, eventFound: !!event.value, photoCount: photos.value.length }))
const nav = computed(() => (photoId.value ? photoNav(ids(), photoId.value, hasMore.value) : null))
const current = computed(() => photos.value.find((p) => p.id === photoId.value) ?? null)

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const page = await fetchPhotosPage(eventId.value, cursor)
    photos.value.push(...page.photos)
    cursor = page.cursor
    hasMore.value = page.hasMore
  } catch { failed.value = true; hasMore.value = false }
  loadingMore.value = false
}

async function load() {
  loading.value = true; failed.value = false; photos.value = []; cursor = null
  event.value = await getPublishedEvent(eventId.value)
  if (event.value) {
    hasMore.value = true
    await loadMore()
  }
  loading.value = false
}

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
    await loadMore()
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
// Cambio de evento (no de foto) recarga; cambiar de foto no.
watch(eventId, load)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <p v-if="state === 'loading'">Cargando…</p>
  <div v-else-if="state === 'unavailable'">
    <h1>Evento no disponible</h1>
    <p>Este evento no existe o todavía no fue publicado.</p>
    <RouterLink to="/">Ver todos los eventos</RouterLink>
  </div>
  <template v-else>
    <RouterLink to="/">&larr; Eventos</RouterLink>
    <h1>{{ event!.name }}</h1>
    <p v-if="failed">No pudimos cargar todas las fotos. Intenta de nuevo más tarde.</p>
    <p v-if="state === 'empty'">Este evento todavía no tiene fotos.</p>
    <ul v-else class="grid">
      <li v-for="p in photos" :key="p.id">
        <a :href="photoPath(eventId, p.id)" @click.prevent="open(p.id)"><PhotoThumb :path="p.thumbPath" /></a>
      </li>
    </ul>
    <div ref="sentinel" class="sentinel" />
    <p v-if="loadingMore">Cargando más…</p>
  </template>

  <PhotoLightbox
    v-if="photoId && state !== 'loading' && state !== 'unavailable'"
    :photo="current"
    :loading="!nav?.found && !!nav?.needsMore"
    :has-prev="!!nav?.prevId"
    :has-next="!!nav?.nextId || !!nav?.needsMore"
    @prev="prev" @next="next" @close="close"
  />
</template>

<style scoped>
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 8rem), 1fr)); gap: 0.25rem; }
.grid a { display: block; }
.sentinel { height: 1px; }
h1 { overflow-wrap: anywhere; }
</style>
