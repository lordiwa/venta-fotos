<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { deleteEvent, getEvent, setCover, setPublished } from '../eventsApi'
import PhotoThumb from '../components/PhotoThumb.vue'
import type { Event, Photo } from '../types'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)
const event = ref<Event | null>(null)
const photos = ref<Photo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
let unsub: (() => void) | undefined

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
  <p v-if="loading">Cargando…</p>
  <p v-else-if="!event">Evento no encontrado. <RouterLink to="/admin/eventos">Volver</RouterLink></p>
  <template v-else>
    <RouterLink to="/admin/eventos">← Eventos</RouterLink>
    <div class="head">
      <h1>{{ event.name }}</h1>
      <span class="badge" :class="{ pub: event.published }">{{ event.published ? 'Publicado' : 'Borrador' }}</span>
    </div>
    <p class="meta">
      {{ event.date.toDate().toLocaleDateString('es') }}<template v-if="event.place"> · {{ event.place }}</template>
    </p>
    <p v-if="event.description">{{ event.description }}</p>
    <div class="actions">
      <button @click="togglePublished">{{ event.published ? 'Despublicar' : 'Publicar' }}</button>
      <RouterLink class="btn2" :to="`/admin/eventos/${id}/editar`">Editar</RouterLink>
      <button class="danger" @click="remove">Eliminar</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <h2>Fotos ({{ photos.length }})</h2>
    <p v-if="!photos.length">Este evento aún no tiene fotos.</p>
    <ul class="grid">
      <li v-for="p in photos" :key="p.id" :class="{ cover: event.coverPhotoId === p.id }">
        <PhotoThumb :path="p.thumbPath" />
        <button class="small" :disabled="event.coverPhotoId === p.id" @click="chooseCover(p.id)">
          {{ event.coverPhotoId === p.id ? 'Portada' : 'Usar como portada' }}
        </button>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.meta { color: #6b7280; }
.badge { padding: 0.15rem 0.6rem; border-radius: 99px; background: #eef0f4; font-size: 0.8rem; }
.badge.pub { background: #d9f2e1; color: #11632b; }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin: 1rem 0; }
button, .btn2 { padding: 0.6rem 1rem; border: 1px solid #1f2430; border-radius: 6px; background: #fff; color: #1f2430; font: inherit; cursor: pointer; text-decoration: none; }
button.danger { border-color: #b42318; color: #b42318; }
button.small { width: 100%; padding: 0.4rem; font-size: 0.8rem; border-radius: 0 0 6px 6px; }
button:disabled { opacity: 0.6; cursor: default; }
.grid { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 0.75rem; }
.grid li { border: 2px solid transparent; border-radius: 8px; overflow: hidden; }
.grid li.cover { border-color: #11632b; }
.error { color: #b42318; }
</style>
