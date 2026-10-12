<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listActiveProducts } from '../productsApi'
import { formatMoney } from '../productsLogic'
import { parseQuantity } from '../cartLogic'
import { useCartStore } from '../stores/cart'
import type { Product } from '../types'

/** Selector de producto y cantidad para la foto abierta (CU1, CU3, CU10, CU11). */
const props = defineProps<{ eventId: string; photoId: string }>()
const cart = useCartStore()

const products = ref<Product[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const productId = ref('')
const qty = ref('1')
const confirmed = ref(false)
let lastValid = 1

async function load() {
  state.value = 'loading'
  try {
    products.value = await listActiveProducts()
    productId.value = products.value[0]?.id ?? ''
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)
watch(() => props.photoId, () => { confirmed.value = false; qty.value = '1'; lastValid = 1 })

const selected = computed(() => products.value.find((p) => p.id === productId.value) ?? null)
const isDigital = computed(() => selected.value?.kind === 'digital')
watch(isDigital, (d) => { if (d) qty.value = '1' })

// CU10: un valor invalido vuelve al ultimo valido.
function onQty() {
  lastValid = parseQuantity(qty.value, lastValid)
  qty.value = String(lastValid)
}
function add() {
  if (!selected.value) return
  onQty()
  cart.add({ eventId: props.eventId, photoId: props.photoId }, selected.value, isDigital.value ? 1 : lastValid)
  confirmed.value = true
}
</script>

<template>
  <div class="buy">
    <p v-if="state === 'loading'">Cargando productos…</p>
    <p v-else-if="state === 'error'" role="alert">No pudimos cargar los productos. <button type="button" @click="load">Reintentar</button></p>
    <p v-else-if="!products.length">Por ahora no hay productos a la venta</p>
    <form v-else novalidate @submit.prevent="add">
      <label>Producto
        <select v-model="productId" @change="confirmed = false">
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} · {{ formatMoney(p.price) }}</option>
        </select>
      </label>
      <label>Cantidad
        <input v-model="qty" inputmode="numeric" :disabled="isDigital" aria-label="Cantidad" @change="onQty" />
      </label>
      <button type="submit">Agregar al carrito</button>
      <p v-if="confirmed" role="status">Agregado al carrito</p>
    </form>
  </div>
</template>

<style scoped>
.buy { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.75rem 1rem; background: rgba(0, 0, 0, 0.7); z-index: 1; }
form { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; justify-content: center; }
input { width: 4rem; }
p { margin: 0; text-align: center; }
</style>
