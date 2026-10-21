<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listEvents } from '../eventsApi'
import { dedicatedCoverPath } from '../eventsLogic'
import { getPhoto } from '../ordersApi'
import { Alert, Badge, Button, Icon } from '../ui'
import type { Event } from '../types'

const events = ref<(Event & { photoCount: number })[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const covers = ref<Record<string, string | undefined>>({})

onMounted(async () => {
  try {
    events.value = await listEvents()
  } catch {
    error.value = 'No se pudieron cargar los eventos.'
  } finally {
    loading.value = false
  }
  // Las portadas se completan despues de mostrar la lista; sin portada queda el recuadro vacio.
  // TASK-028: la portada dedicada (coverPath) no requiere leer la foto; sin ella se cae a la miniatura.
  await Promise.all(events.value.filter((e) => e.coverPhotoId).map(async (e) => {
    covers.value[e.id] = dedicatedCoverPath(e)
    if (covers.value[e.id]) return
    try { covers.value[e.id] = (await getPhoto(e.id, e.coverPhotoId!))?.thumbPath } catch { /* sin portada */ }
  }))
})
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="display-md">Eventos</h1>
      <Button variant="primary" icon="mas" to="/admin/eventos/nuevo">Nuevo evento</Button>
    </div>
    <p v-if="loading" class="note">Cargando…</p>
    <Alert v-else-if="error" tone="danger">{{ error }}</Alert>
    <p v-else-if="!events.length" class="note">Aún no hay eventos. Crea el primero.</p>
    <ul v-else class="list">
      <li v-for="e in events" :key="e.id" class="row">
        <RouterLink class="main" :to="`/admin/eventos/${e.id}`">
          <span class="cover"><PhotoThumb v-if="covers[e.id]" :path="covers[e.id]" /></span>
          <span class="info">
            <strong class="display-xs">{{ e.name }}</strong>
            <span class="mono-sm">{{ e.date.toDate().toLocaleDateString('es') }}<template v-if="e.place"> · {{ e.place }}</template></span>
          </span>
        </RouterLink>
        <span class="mono-sm count">{{ e.photoCount }} {{ e.photoCount === 1 ? 'foto' : 'fotos' }}</span>
        <Badge :status="e.published ? 'publicado' : 'borrador'" />
        <Icon class="chev" name="siguiente" :size="16" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.note { margin: 0; color: var(--ink-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); overflow: hidden; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--surface-sunken); }
.main { display: flex; align-items: center; gap: var(--space-4); flex: 1 1 280px; min-width: 0; text-decoration: none; color: var(--ink); }
.cover { flex: 0 0 auto; width: 88px; height: 62px; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-sunken); }
.cover :deep(img), .cover :deep(.ph) { height: 100%; aspect-ratio: auto; }
.info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.info .mono-sm, .count { color: var(--ink-muted); }
.count { min-width: 64px; }
.chev { color: var(--ink-muted); }
@media (max-width: 720px) { .row { padding: var(--space-3) var(--space-4); } }
</style>
