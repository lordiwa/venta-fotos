<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getActiveCatalog } from '../productsApi'
import { formatMoney } from '../productsLogic'
import { useCartStore } from '../stores/cart'
import { Alert, Button, Eyebrow, OptionCard, Stepper } from '../ui'
import type { Product } from '../types'

/** Selector de producto y cantidad para la foto abierta (CU1, CU3, CU10, CU11). */
const props = defineProps<{ eventId: string; photoId: string; label?: string }>()
const cart = useCartStore()

const products = ref<Product[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const productId = ref('')
const qty = ref(1) // el Stepper acota 1..99 (CU10): no hay valores invalidos que corregir
const confirmed = ref(false)

async function load() {
  state.value = 'loading'
  try {
    products.value = await getActiveCatalog(true)
    productId.value = products.value[0]?.id ?? ''
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(async () => {
  // Cache: navegar entre fotos no recarga el catalogo ni parpadea.
  try { products.value = await getActiveCatalog(); productId.value = products.value[0]?.id ?? ''; state.value = 'ready' } catch { state.value = 'error' }
})
watch(() => props.photoId, () => { confirmed.value = false; qty.value = 1 })

const selected = computed(() => products.value.find((p) => p.id === productId.value) ?? null)
const isDigital = computed(() => selected.value?.kind === 'digital')
watch(isDigital, (d) => { if (d) qty.value = 1 })
watch([productId, qty], () => { confirmed.value = false })

function add() {
  if (!selected.value) return
  cart.add({ eventId: props.eventId, photoId: props.photoId }, selected.value, isDigital.value ? 1 : qty.value)
  confirmed.value = true
}
</script>

<template>
  <div class="buy">
    <p v-if="state === 'loading'" class="mono-sm muted">Cargando productos…</p>
    <Alert v-else-if="state === 'error'" tone="danger">
      No pudimos cargar los productos.
      <template #action><Button @click="load">Reintentar</Button></template>
    </Alert>
    <Alert v-else-if="!products.length">Por ahora no hay productos a la venta</Alert>
    <form v-else novalidate @submit.prevent="add">
      <div class="head">
        <Eyebrow v-if="label">{{ label }}</Eyebrow>
        <h2 class="display-sm">Elige tu formato</h2>
      </div>
      <fieldset>
        <legend class="sr">Producto</legend>
        <OptionCard
          v-for="p in products" :key="p.id" v-model="productId" name="producto" :value="p.id"
          :label="p.name" :meta="p.kind === 'digital' ? 'Descarga en alta resolución' : 'Copia impresa'" :price="formatMoney(p.price)"
        />
      </fieldset>
      <div v-if="!isDigital" class="qty">
        <span class="label muted">Cantidad</span>
        <Stepper v-model="qty" />
      </div>
      <p v-else class="body-sm muted note">Archivo digital: una descarga por foto, sin marca de agua.</p>
      <Button type="submit" variant="accent" size="lg" icon="carrito">Agregar al carrito</Button>
      <Alert v-if="confirmed" tone="success">
        Agregado al carrito
        <template #action><RouterLink to="/carrito" class="cart-link">Ver carrito</RouterLink></template>
      </Alert>
    </form>
  </div>
</template>

<style scoped>
.buy { flex: 1 1 340px; max-width: 400px; box-sizing: border-box; padding: var(--space-7); border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); color: var(--ink); }
form { display: flex; flex-direction: column; gap: var(--space-4); }
.head { display: flex; flex-direction: column; gap: var(--space-2); }
.head h2 { margin: 0; font-size: 28px; }
fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.qty { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.muted { color: var(--ink-muted); }
.note { margin: 0; }
p { margin: 0; }
.cart-link { font-weight: 500; color: inherit; }
@media (max-width: 720px) {
  .buy { padding: var(--space-5); max-width: none; flex-basis: 100%; }
}
</style>
