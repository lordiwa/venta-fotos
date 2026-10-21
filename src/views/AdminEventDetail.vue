<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { deleteEvent, getEvent, setCover, setPublished } from '../eventsApi'
import { dedicatedCoverPath } from '../eventsLogic'
import PhotoThumb from '../components/PhotoThumb.vue'
import PhotoUploader from '../components/PhotoUploader.vue'
import { deletePhoto, setPhotoVisible } from '../photosApi'
import { Alert, Badge, Button, Card, Icon } from '../ui'
import type { Event, Photo } from '../types'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)
const event = ref<Event | null>(null)
const photos = ref<Photo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
let unsub: (() => void) | undefined

/** TASK-028: portada dedicada si ya la genero la Function; si no, la miniatura de la foto elegida. */
const coverPath = computed(() => (event.value && dedicatedCoverPath(event.value)) ?? photos.value.find((p) => p.id === event.value?.coverPhotoId && p.status === 'ready')?.thumbPath)

async function load() {
  try {
    event.value = await getEvent(id.value)
  } catch {
    error.value = 'No se pudo cargar el evento.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  unsub = onSnapshot(
    query(collection(db, 'events', id.value, 'photos'), orderBy('createdAt', 'asc')),
    (s) => (photos.value = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Photo)),
    () => (error.value = 'No se pudieron cargar las fotos.'),
  )
})
onUnmounted(() => unsub?.())

async function run(fn: () => Promise<void>, msg: string) {
  error.value = null
  try {
    await fn()
    await load()
  } catch {
    error.value = msg
  }
}

const togglePublished = () =>
  run(() => setPublished(id.value, !event.value!.published), 'No se pudo cambiar el estado de publicación.')
const chooseCover = (photoId: string) => run(() => setCover(id.value, photoId), 'No se pudo elegir la portada.')

const toggleVisible = (p: Photo) =>
  run(() => setPhotoVisible(id.value, p.id, !p.visible), 'No se pudo cambiar la visibilidad de la foto.')

async function removePhoto(p: Photo) {
  if (!window.confirm(`¿Eliminar la foto "${p.name ?? p.id}"? Se borran también su vista previa y miniatura.`)) return
  run(() => deletePhoto(id.value, p.id, event.value?.coverPhotoId === p.id), 'No se pudo eliminar la foto.')
}

async function remove() {
  const n = photos.value.length
  const extra = n ? ` Se borrarán también sus ${n} fotos.` : ''
  if (!window.confirm(`¿Eliminar el evento "${event.value!.name}"?${extra} Esta acción no se puede deshacer.`)) return
  error.value = null
  try {
    const res = await deleteEvent(id.value)
    if (res.ok) await router.replace('/admin/eventos')
    else error.value = res.message
  } catch {
    error.value = 'No se pudo eliminar el evento.'
  }
}
</script>

<template>
  <div class="page">
    <p v-if="loading" class="note">Cargando…</p>
    <p v-else-if="!event" class="note">Evento no encontrado. <RouterLink to="/admin/eventos">Volver</RouterLink></p>
    <template v-else>
      <RouterLink class="back" to="/admin/eventos"><Icon name="flecha-izquierda" :size="16" />Eventos</RouterLink>
      <section class="hero">
        <div v-if="coverPath" class="hero-img" aria-hidden="true"><PhotoThumb :path="coverPath" /></div>
        <div class="veil" aria-hidden="true" />
        <div class="hero-body">
          <div class="hero-info">
            <div class="hero-title">
              <h1 class="display-lg">{{ event.name }}</h1>
              <Badge :status="event.published ? 'publicado' : 'borrador'" />
            </div>
            <span class="mono-sm hero-meta">
              {{ event.date.toDate().toLocaleDateString('es') }}<template v-if="event.place"> · {{ event.place }}</template>
            </span>
            <p v-if="event.description" class="body-sm hero-desc">{{ event.description }}</p>
          </div>
          <div class="actions">
            <Button @click="togglePublished">{{ event.published ? 'Despublicar' : 'Publicar' }}</Button>
            <Button :to="`/admin/eventos/${id}/editar`">Editar</Button>
            <Button variant="danger" @click="remove">Eliminar</Button>
          </div>
        </div>
      </section>
      <Alert v-if="error" tone="danger">{{ error }}</Alert>

      <Card title="Subir fotos">
        <PhotoUploader :event-id="id" />
      </Card>

      <Card title="Fotos" aria-label="Fotos del evento">
        <template #aside><span class="mono-sm count">{{ photos.length }} {{ photos.length === 1 ? 'foto' : 'fotos' }}</span></template>
        <p v-if="!photos.length" class="note">Este evento aún no tiene fotos.</p>
        <ul class="grid">
          <li v-for="p in photos" :key="p.id" :class="{ hidden: !p.visible }">
            <div class="tile" :class="{ cover: event.coverPhotoId === p.id }">
              <PhotoThumb v-if="p.status === 'ready'" :path="p.thumbPath" />
              <div v-else class="state" :class="p.status">
                {{ p.status === 'error' ? 'Error al procesar' : 'Procesando…' }}
              </div>
              <span v-if="event.coverPhotoId === p.id" class="tag tag-cover">Portada</span>
              <span v-if="!p.visible" class="tag tag-hidden">Oculta</span>
            </div>
            <div class="btns">
              <Button v-if="p.status === 'ready'" :disabled="event.coverPhotoId === p.id" @click="chooseCover(p.id)">
                {{ event.coverPhotoId === p.id ? 'Es la portada' : 'Usar de portada' }}
              </Button>
              <Button @click="toggleVisible(p)">{{ p.visible ? 'Ocultar' : 'Mostrar' }}</Button>
              <Button variant="danger" @click="removePhoto(p)">Eliminar</Button>
            </div>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
.note { margin: 0; color: var(--ink-muted); }
.back { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start; min-height: 44px; text-decoration: none; color: var(--ink-muted); font-size: 14px; font-weight: 500; }
.hero { position: relative; display: flex; align-items: flex-end; min-height: 260px; overflow: hidden; border-radius: var(--radius-xl); background: var(--rail); color: var(--on-rail); }
.hero-img { position: absolute; inset: 0; }
.hero-img :deep(img), .hero-img :deep(.ph) { height: 100%; aspect-ratio: auto; }
.veil { position: absolute; inset: 0; background: linear-gradient(180deg, #15140f0d 0%, #15140fd9 100%); }
.hero-body { position: relative; width: 100%; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-5); padding: var(--space-8); }
.hero-info { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.hero-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
h1 { margin: 0; font-size: 44px; color: var(--on-rail); overflow-wrap: anywhere; }
.hero-meta, .hero-desc { color: var(--on-rail-muted); }
.hero-desc { margin: 0; max-width: 60ch; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.count { color: var(--ink-muted); }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: var(--space-4); }
.grid li { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.tile { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 8px; background: var(--surface-sunken); }
.tile.cover { outline: 3px solid var(--amber); outline-offset: 2px; }
.tile :deep(img), .tile :deep(.ph) { height: 100%; aspect-ratio: auto; }
.grid li.hidden .tile :deep(img) { filter: grayscale(1); opacity: 0.6; }
.state { height: 100%; display: grid; place-items: center; padding: var(--space-2); box-sizing: border-box; color: var(--ink-muted); font: 13px var(--font-mono); text-align: center; }
.state.error { background: var(--danger-soft); color: var(--danger); }
.tag { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; }
.tag-cover { background: var(--amber); color: var(--on-amber); }
.tag-hidden { background: var(--ink); color: var(--on-ink); }
.tag-cover + .tag-hidden { top: 42px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 720px) {
  .hero-body { padding: var(--space-5); }
  h1 { font-size: 30px; }
}
</style>
