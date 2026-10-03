<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listPublishedEvents, type PublicEvent } from '../publicApi'
import { eventPath } from '../galleryLogic'

const events = ref<PublicEvent[]>([])
const loading = ref(true)
const failed = ref(false)
const fmt = (e: PublicEvent) => e.date.toDate().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })

onMounted(async () => {
  try { events.value = await listPublishedEvents() } catch { failed.value = true }
  loading.value = false
})
</script>

<template>
  <h1>Eventos</h1>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="failed">No pudimos cargar los eventos. Intenta de nuevo más tarde.</p>
  <p v-else-if="!events.length">Todavía no hay eventos publicados.</p>
  <ul v-else class="events">
    <li v-for="e in events" :key="e.id">
      <RouterLink :to="eventPath(e.id)">
        <PhotoThumb :path="e.coverThumbPath" />
        <strong>{{ e.name }}</strong>
        <span>{{ fmt(e) }}<template v-if="e.place"> · {{ e.place }}</template></span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.events { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); gap: 1rem; }
a { display: flex; flex-direction: column; gap: 0.25rem; text-decoration: none; }
span { color: #6b7280; font-size: 0.9rem; }
</style>
