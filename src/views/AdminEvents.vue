<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listEvents } from '../eventsApi'
import type { Event } from '../types'

const events = ref<(Event & { photoCount: number })[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    events.value = await listEvents()
  } catch {
    error.value = 'No se pudieron cargar los eventos.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="head">
    <h1>Eventos</h1>
    <RouterLink class="btn" to="/admin/eventos/nuevo">Nuevo evento</RouterLink>
  </div>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="error" class="error" role="alert">{{ error }}</p>
  <p v-else-if="!events.length">Aún no hay eventos. Crea el primero.</p>
  <ul v-else class="list">
    <li v-for="e in events" :key="e.id">
      <RouterLink :to="`/admin/eventos/${e.id}`">
        <strong>{{ e.name }}</strong>
        <span>{{ e.date.toDate().toLocaleDateString('es') }}<template v-if="e.place"> · {{ e.place }}</template></span>
      </RouterLink>
      <span class="meta">
        <span class="badge" :class="{ pub: e.published }">{{ e.published ? 'Publicado' : 'Borrador' }}</span>
        {{ e.photoCount }} {{ e.photoCount === 1 ? 'foto' : 'fotos' }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
.btn { background: #1f2430; color: #fff; padding: 0.6rem 1rem; border-radius: 6px; text-decoration: none; }
.list { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: 0.5rem; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; border: 1px solid #e3e5ea; border-radius: 8px; padding: 0.75rem 1rem; }
.list a { display: flex; flex-direction: column; text-decoration: none; }
.list a span { color: #6b7280; font-size: 0.9rem; }
.meta { display: flex; gap: 0.75rem; align-items: center; font-size: 0.9rem; }
.badge { padding: 0.15rem 0.6rem; border-radius: 99px; background: #eef0f4; font-size: 0.8rem; }
.badge.pub { background: #d9f2e1; color: #11632b; }
.error { color: #b42318; }
</style>
