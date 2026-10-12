<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { downloadOriginal, getPhoto, listPaidOrders } from '../ordersApi'
import { downloadName, printList, type OrderRow } from '../ordersLogic'
import { Alert, Button, Card } from '../ui'

const orders = ref<OrderRow[]>([])
const loading = ref(true)
const loadError = ref(false)
const thumbs = ref<Record<string, string | undefined>>({})
const downloadError = ref('')
const downloading = ref<string | null>(null)

const groups = computed(() => printList(orders.value))

async function load() {
  loading.value = true
  loadError.value = false
  try {
    orders.value = await listPaidOrders()
  } catch {
    loadError.value = true
    return
  } finally {
    loading.value = false
  }
  // Las miniaturas se completan despues de mostrar la lista.
  await Promise.all(groups.value.flatMap((g) => g.photos).map(async (p) => {
    const k = `${p.eventId}/${p.photoId}`
    if (k in thumbs.value) return
    thumbs.value[k] = undefined
    try { thumbs.value[k] = (await getPhoto(p.eventId, p.photoId))?.thumbPath } catch { /* sin miniatura */ }
  }))
}
onMounted(load)

/** CU6: baja el original (privado; solo el admin lo lee) sin dejar una URL publica. */
async function download(eventId: string, photoId: string) {
  if (downloading.value) return
  downloading.value = `${eventId}/${photoId}`
  downloadError.value = ''
  try {
    const photo = await getPhoto(eventId, photoId)
    if (!photo) throw new Error('foto borrada')
    await downloadOriginal(photo.originalPath, downloadName(eventId, photo.name ?? photoId))
  } catch {
    downloadError.value = 'No se pudo obtener el original de esa foto.'
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="title">
        <h1 class="display-md">Lista de impresión</h1>
        <p class="body-sm">Copias pendientes de los pedidos pagados, agrupadas por tamaño.</p>
      </div>
      <Button icon="pedidos" to="/admin/pedidos">Pedidos</Button>
    </div>
    <p v-if="loading" class="note">Cargando…</p>
    <Alert v-else-if="loadError" tone="danger">
      No se pudo cargar la lista.
      <template #action><Button type="button" @click="load">Reintentar</Button></template>
    </Alert>
    <p v-else-if="!groups.length" class="note">No hay copias pendientes de imprimir.</p>
    <template v-else>
      <Alert v-if="downloadError" tone="danger">{{ downloadError }}</Alert>
      <Card v-for="g in groups" :key="g.productId" :title="g.productName">
        <template #aside><span class="mono-sm count">{{ g.total }} {{ g.total === 1 ? 'copia' : 'copias' }}</span></template>
        <ul class="photos">
          <li v-for="p in g.photos" :key="`${p.eventId}/${p.photoId}`">
            <div class="thumb">
              <PhotoThumb :path="thumbs[`${p.eventId}/${p.photoId}`]" />
              <span class="qty">× {{ p.quantity }}</span>
            </div>
            <Button type="button" icon="descargar" :disabled="downloading !== null" @click="download(p.eventId, p.photoId)">{{ downloading === `${p.eventId}/${p.photoId}` ? 'Descargando…' : 'Descargar original' }}</Button>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
.title { display: flex; flex-direction: column; gap: var(--space-2); }
h1 { margin: 0; color: var(--ink); }
.title p, .note, .count { margin: 0; color: var(--ink-muted); }
.photos { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: var(--space-4); }
.photos li { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.thumb { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 8px; background: var(--surface-sunken); }
.thumb :deep(img), .thumb :deep(.ph) { height: 100%; aspect-ratio: auto; }
.qty { position: absolute; top: 10px; right: 10px; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--ink); color: var(--on-ink); font: 13px var(--font-mono); }
</style>
