<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { getPhoto, listOrders, originalUrl } from '../ordersApi'
import { printList, type OrderRow } from '../ordersLogic'

const orders = ref<OrderRow[]>([])
const loading = ref(true)
const loadError = ref(false)
const thumbs = ref<Record<string, string | undefined>>({})
const downloadError = ref('')

const groups = computed(() => printList(orders.value))

async function load() {
  loading.value = true
  loadError.value = false
  try {
    orders.value = await listOrders()
    for (const p of groups.value.flatMap((g) => g.photos)) {
      const k = `${p.eventId}/${p.photoId}`
      if (k in thumbs.value) continue
      thumbs.value[k] = undefined
      try { thumbs.value[k] = (await getPhoto(p.eventId, p.photoId))?.thumbPath } catch { /* sin miniatura */ }
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** CU6: abre el original (privado; solo el admin lo lee). */
async function download(eventId: string, photoId: string) {
  downloadError.value = ''
  try {
    const photo = await getPhoto(eventId, photoId)
    if (!photo) throw new Error('foto borrada')
    window.open(await originalUrl(photo.originalPath), '_blank', 'noopener')
  } catch {
    downloadError.value = 'No se pudo obtener el original de esa foto.'
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
          <button type="button" @click="download(p.eventId, p.photoId)">Descargar original</button>
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
