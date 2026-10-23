<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getActiveCatalog } from '../productsApi'
import { formatMoney, hasPrintOffer, offeredProducts } from '../productsLogic'
import { getSettings } from '../settingsApi'
import { buildWhatsAppMessage, currentLinkEnv, resolveWhatsappDigits, whatsappLinkAttrs, whatsappUrl } from '../whatsappLogic'
import { useCartStore } from '../stores/cart'
import { Alert, Button, Eyebrow, OptionCard, Stepper } from '../ui'
import { useI18n } from '../i18n'
import { productLabel } from '../i18n/format'
import type { Product } from '../types'

/** Selector de producto y cantidad para la foto abierta (CU1, CU3, CU10, CU11). */
const props = defineProps<{ eventId: string; photoId: string; label?: string; eventName?: string; photoName?: string; printOnly?: boolean }>()
const cart = useCartStore()
const { t, locale } = useI18n()

const products = ref<Product[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const productId = ref('')
const qty = ref(1) // el Stepper acota 1..99 (CU10): no hay valores invalidos que corregir
const confirmed = ref(false)
const whatsappDigits = ref(resolveWhatsappDigits(null))
// Movil: misma pestaña para que el sistema abra la app de WhatsApp (TASK-036); escritorio: pestaña nueva.
const waLink = whatsappLinkAttrs(currentLinkEnv())

async function load() {
  state.value = 'loading'
  try {
    products.value = await getActiveCatalog(true)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(async () => {
  // Numero de pedidos: si falla la lectura queda el por defecto y el enlace sigue funcionando.
  getSettings().then((s) => { whatsappDigits.value = resolveWhatsappDigits(s?.whatsappPhone) }).catch(() => {})
  // Cache: navegar entre fotos no recarga el catalogo ni parpadea.
  try { products.value = await getActiveCatalog(); state.value = 'ready' } catch { state.value = 'error' }
})
watch(() => props.photoId, () => { confirmed.value = false; qty.value = 1 })

/** TASK-029/030: los paquetes no se eligen por foto; una foto "solo impresión" no ofrece lo digital. */
const offered = computed(() => offeredProducts(products.value, props.printOnly === true))
// Al cambiar de foto o de catalogo, si la eleccion ya no se ofrece, se elige el primero.
watch(offered, (o) => { if (!o.some((p) => p.id === productId.value)) productId.value = o[0]?.id ?? '' }, { immediate: true })
const selected = computed(() => offered.value.find((p) => p.id === productId.value) ?? null)
const isDigital = computed(() => selected.value?.kind === 'digital')
watch(isDigital, (d) => { if (d) qty.value = 1 })
watch([productId, qty], () => { confirmed.value = false })

/** CU2: pedido de esta unica foto con el producto y la cantidad elegidos. */
const whatsappHref = computed(() => {
  const p = selected.value
  if (!p) return ''
  const quantity = isDigital.value ? 1 : qty.value
  const line = { event: props.eventName, photo: props.photoName ?? props.photoId, product: productLabel(p.name, t.value, locale.value), quantity, subtotal: Math.round(p.price * quantity * 100) / 100 }
  return whatsappUrl(whatsappDigits.value, buildWhatsAppMessage({ lines: [line], total: line.subtotal }, locale.value))
})

function add() {
  if (!selected.value) return
  cart.add({ eventId: props.eventId, photoId: props.photoId }, selected.value, isDigital.value ? 1 : qty.value)
  confirmed.value = true
}
</script>

<template>
  <div class="buy">
    <p v-if="state === 'loading'" class="mono-sm muted">{{ t.purchase.loading }}</p>
    <Alert v-else-if="state === 'error'" tone="danger">
      {{ t.purchase.loadFailed }}
      <template #action><Button @click="load">{{ t.common.retry }}</Button></template>
    </Alert>
    <Alert v-else-if="!offered.length">{{ printOnly ? t.purchase.nonePrintOnly : t.purchase.none }}</Alert>
    <form v-else novalidate @submit.prevent="add">
      <div class="head">
        <Eyebrow v-if="label">{{ label }}</Eyebrow>
        <h2 class="display-sm">{{ t.purchase.choose }}</h2>
      </div>
      <fieldset>
        <legend class="sr">{{ t.purchase.legend }}</legend>
        <OptionCard
          v-for="p in offered" :key="p.id" v-model="productId" name="producto" :value="p.id"
          :label="productLabel(p.name, t, locale)" :meta="p.kind === 'digital' ? t.purchase.digitalMeta : t.purchase.printMeta" :price="formatMoney(p.price, locale)"
        />
      </fieldset>
      <section v-if="hasPrintOffer(offered)" class="fineart">
        <h3 class="label">{{ t.purchase.fineArtTitle }}</h3>
        <p class="body-sm muted">{{ t.purchase.fineArtBody }}</p>
        <p class="body-sm muted">{{ t.purchase.shipping }}</p>
      </section>
      <div v-if="!isDigital" class="qty">
        <span class="label muted">{{ t.purchase.quantity }}</span>
        <Stepper v-model="qty" :label="t.stepper.label" :less-label="t.stepper.less" :more-label="t.stepper.more" />
      </div>
      <p v-else class="body-sm muted note">{{ t.purchase.digitalNote }}</p>
      <p v-if="printOnly" class="body-sm muted note">{{ t.purchase.printOnlyNote }}</p>
      <Button type="submit" variant="accent" size="lg" icon="carrito">{{ t.purchase.add }}</Button>
      <Button variant="ghost" :href="whatsappHref" v-bind="waLink">{{ t.purchase.whatsapp }}</Button>
      <Alert v-if="confirmed" tone="success">
        {{ t.purchase.added }}
        <template #action><RouterLink to="/carrito" class="cart-link">{{ t.purchase.viewCart }}</RouterLink></template>
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
.fineart { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.fineart h3 { margin: 0; }
p { margin: 0; }
.cart-link { font-weight: 500; color: inherit; }
@media (max-width: 720px) {
  .buy { padding: var(--space-5); max-width: none; flex-basis: 100%; }
}
</style>
