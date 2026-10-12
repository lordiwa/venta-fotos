<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { downloadOriginal, getPhoto, listPaidOrders } from '../ordersApi'
import { printList, type OrderRow } from '../ordersLogic'

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
    await downloadOriginal(photo.originalPath, `${eventId}-${photo.name ?? photoId}`)
  } catch {
    downloadError.value = 'No se pudo obtener el original de esa foto.'
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <h1>Lista de impresión</h1>
  <p><RouterLink to="/admin">Volver</RouterLink> · <RouterLink to="/admin/pedidos">Pedidos</RouterLink></p>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="loadError" role="alert">No se pudo cargar la lista. <button type="button" @click="load">Reintentar</button></p>
  <p v-else-if="!groups.length">No hay copias pendientes de imprimir.</p>
  <template v-else>
    <p v-if="downloadError" role="alert" class="warn">{{ downloadError }}</p>
    <section v-for="g in groups" :key="g.productId">
      <h2>{{ g.productName }} — {{ g.total }} {{ g.total === 1 ? 'copia' : 'copias' }}</h2>
      <ul class="photos">
        <li v-for="p in g.photos" :key="`${p.eventId}/${p.photoId}`">
          <div class="thumb"><PhotoThumb :path="thumbs[`${p.eventId}/${p.photoId}`]" /></div>
          <span>× {{ p.quantity }}</span>
          <button type="button" :disabled="downloading !== null" @click="download(p.eventId, p.photoId)">{{ downloading === `${p.eventId}/${p.photoId}` ? 'Descargando…' : 'Descargar original' }}</button>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.photos { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.photos li { display: flex; gap: 1rem; align-items: center; }
.thumb { width: 4rem; }
.warn { color: #b42318; }
</style>
