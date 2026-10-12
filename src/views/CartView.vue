<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listActiveProducts } from '../productsApi'
import { getPublicPhoto, getPublishedEvent } from '../publicApi'
import { reconcile, STATUS_MESSAGE, type PhotoAvailability } from '../cartLogic'
import { formatMoney } from '../productsLogic'
import { useCartStore } from '../stores/cart'
import type { Photo, Product } from '../types'

const cart = useCartStore()
const products = ref<Product[]>([])
const photos = ref<Record<string, PhotoAvailability>>({})
const thumbs = ref<Record<string, string | undefined>>({})
const loading = ref(true)
const error = ref(false) // red u otro fallo: NUNCA se interpreta como "no disponible"

async function load() {
  loading.value = true
  error.value = false
  try {
    const lines = cart.lines
    const keys = [...new Set(lines.map((l) => `${l.eventId}/${l.photoId}`))]
    // Un evento se consulta una sola vez aunque tenga muchas fotos en el carrito.
    const eventIds = [...new Set(lines.map((l) => l.eventId))]
    const published = new Map(await Promise.all(eventIds.map(async (id) => [id, !!(await getPublishedEvent(id))] as [string, boolean])))
    const [prods, found] = await Promise.all([
      listActiveProducts(),
      Promise.all(keys.map(async (k) => {
        const [eventId, photoId] = k.split('/')
        return [k, published.get(eventId) ? await getPublicPhoto(eventId, photoId) : null] as [string, Photo | null]
      })),
    ])
    products.value = prods
    photos.value = Object.fromEntries(found.map(([k, p]) => [k, p ? 'available' : 'unavailable'])) as Record<string, PhotoAvailability>
    thumbs.value = Object.fromEntries(found.map(([k, p]) => [k, p?.thumbPath]))
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
onMounted(() => { if (cart.lines.length) load(); else loading.value = false })

const view = computed(() => reconcile(cart.lines, products.value, photos.value))
function onQty(key: string, ev: Event) {
  const input = ev.target as HTMLInputElement
  cart.setQuantity(key, input.value)
  // CU10: si el valor no era valido la cantidad no cambia; se muestra la vigente.
  input.value = String(cart.lines.find((l) => `${l.eventId}/${l.photoId}/${l.productId}` === key)?.quantity ?? '')
}
</script>

<template>
  <h1>Carrito</h1>
  <p v-if="!cart.lines.length">Tu carrito está vacío. <RouterLink to="/">Ver las fotos</RouterLink></p>
  <p v-else-if="loading">Cargando…</p>
  <template v-else-if="error">
    <p role="alert">No pudimos actualizar tu carrito. <button type="button" @click="load">Reintentar</button></p>
    <ul class="lines">
      <li v-for="l in cart.lines" :key="`${l.eventId}/${l.photoId}/${l.productId}`">
        <span class="info">{{ l.productName ?? 'Producto' }} × {{ l.quantity }}</span>
        <button type="button" @click="cart.remove(`${l.eventId}/${l.photoId}/${l.productId}`)">Quitar</button>
      </li>
    </ul>
  </template>
  <template v-else>
    <ul class="lines">
      <li v-for="r in view.lines" :key="r.key" :class="{ off: !r.counted }">
        <div class="thumb"><PhotoThumb :path="thumbs[`${r.line.eventId}/${r.line.photoId}`]" /></div>
        <div class="info">
          <strong>{{ r.product?.name ?? r.line.productName ?? 'Producto' }}</strong>
          <span v-if="r.counted">{{ formatMoney(r.unitPrice) }} c/u</span>
          <span v-if="STATUS_MESSAGE[r.status]" class="warn" role="status">{{ STATUS_MESSAGE[r.status] }}</span>
        </div>
        <label v-if="r.counted && r.product?.kind !== 'digital'">Cantidad
          <input :value="r.quantity" inputmode="numeric" aria-label="Cantidad" @change="onQty(r.key, $event)" />
        </label>
        <span v-else-if="r.counted">Cantidad: 1</span>
        <span class="sub">{{ r.counted ? formatMoney(r.subtotal) : '—' }}</span>
        <button type="button" @click="cart.remove(r.key)">Quitar</button>
      </li>
    </ul>
    <p class="total"><strong>Total estimado:</strong> {{ formatMoney(view.total) }}</p>
    <RouterLink class="pay" to="/checkout">Ir a pagar</RouterLink>
  </template>
</template>

<style scoped>
.lines { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.lines li { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; border: 1px solid #e3e5ea; border-radius: 8px; padding: 0.5rem 1rem; }
.lines li.off { opacity: 0.7; }
.thumb { width: 4rem; }
.info { display: flex; flex-direction: column; flex: 1; min-width: 8rem; }
.warn { color: #b42318; font-size: 0.9rem; }
input { width: 4rem; }
.total { font-size: 1.2rem; }
.pay { display: inline-block; background: #1f2430; color: #fff; border-radius: 6px; padding: 0.5rem 1.2rem; text-decoration: none; }
</style>
