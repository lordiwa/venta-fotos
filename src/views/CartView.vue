<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listActiveProducts } from '../productsApi'
import { getPublicPhoto, getPublishedEvent } from '../publicApi'
import { getSettings } from '../settingsApi'
import { buildWhatsAppMessage, resolveWhatsappDigits, whatsappUrl, type WhatsAppLine } from '../whatsappLogic'
import { reconcile, STATUS_MESSAGE, type PhotoAvailability } from '../cartLogic'
import { formatMoney } from '../productsLogic'
import { currentPaymentMode } from '../paymentMode'
import { useCartStore } from '../stores/cart'
import { Alert, Button, Card, Stepper } from '../ui'
import type { Photo, Product } from '../types'

const cart = useCartStore()
const paypal = currentPaymentMode() === 'paypal'
const products = ref<Product[]>([])
const photos = ref<Record<string, PhotoAvailability>>({})
const thumbs = ref<Record<string, string | undefined>>({})
const eventNames = ref<Record<string, string | undefined>>({})
const photoNames = ref<Record<string, string | undefined>>({})
const whatsappDigits = ref(resolveWhatsappDigits(null))
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
    const events = new Map(await Promise.all(eventIds.map(async (id) => [id, await getPublishedEvent(id)] as const)))
    const published = new Map([...events].map(([id, e]) => [id, !!e]))
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
    eventNames.value = Object.fromEntries([...events].map(([id, e]) => [id, e?.name]))
    photoNames.value = Object.fromEntries(found.map(([k, p]) => [k, p?.name]))
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  if (cart.lines.length) load(); else loading.value = false
  // El numero es opcional: si falla la lectura se queda el por defecto y el boton sigue funcionando.
  getSettings().then((s) => { whatsappDigits.value = resolveWhatsappDigits(s?.whatsappPhone) }).catch(() => {})
})

const view = computed(() => reconcile(cart.lines, products.value, photos.value))

/** Pedido por WhatsApp: solo lineas disponibles; sin red, lo guardado localmente y sin precios. */
const whatsappHref = computed(() => {
  const name = (eventId: string, photoId: string) => photoNames.value[`${eventId}/${photoId}`] ?? photoId
  const msg = error.value
    ? buildWhatsAppMessage({ lines: cart.lines.map((l): WhatsAppLine => ({ photo: l.photoId, product: l.productName ?? 'Producto', quantity: l.quantity })) })
    : buildWhatsAppMessage({
      lines: view.value.lines.filter((r) => r.counted).map((r): WhatsAppLine => ({
        event: eventNames.value[r.line.eventId], photo: name(r.line.eventId, r.line.photoId),
        product: r.product?.name ?? r.line.productName ?? 'Producto', quantity: r.quantity, subtotal: r.subtotal,
      })),
      total: view.value.total,
    })
  return whatsappUrl(whatsappDigits.value, msg)
})
</script>

<template>
  <div class="head">
    <h1 class="display-lg">Carrito</h1>
    <span v-if="cart.lines.length" class="mono-sm muted">{{ cart.lines.length }} {{ cart.lines.length === 1 ? 'producto' : 'productos' }}</span>
  </div>
  <Alert v-if="!cart.lines.length">
    Tu carrito está vacío.
    <template #action><RouterLink to="/">Ver las fotos</RouterLink></template>
  </Alert>
  <p v-else-if="loading" class="mono-sm muted">Cargando…</p>
  <template v-else-if="error">
    <Alert tone="danger">
      No pudimos actualizar tu carrito.
      <template #action><Button @click="load">Reintentar</Button></template>
    </Alert>
    <ul class="lines">
      <li v-for="l in cart.lines" :key="`${l.eventId}/${l.photoId}/${l.productId}`">
        <span class="info display-sm">{{ l.productName ?? 'Producto' }} × {{ l.quantity }}</span>
        <Button variant="ghost" icon="quitar" @click="cart.remove(`${l.eventId}/${l.photoId}/${l.productId}`)">Quitar</Button>
      </li>
    </ul>
    <Button variant="secondary" size="lg" :href="whatsappHref" target="_blank" rel="noopener">Pedir por WhatsApp</Button>
  </template>
  <div v-else class="cols">
    <ul class="lines">
      <li v-for="r in view.lines" :key="r.key">
        <div class="thumb" :class="{ off: !r.counted }"><PhotoThumb :path="thumbs[`${r.line.eventId}/${r.line.photoId}`]" fill /></div>
        <div class="info" :class="{ off: !r.counted }">
          <strong class="display-sm name">{{ r.product?.name ?? r.line.productName ?? 'Producto' }}</strong>
          <span v-if="r.counted" class="mono-sm muted">{{ formatMoney(r.unitPrice) }} c/u</span>
          <span v-if="STATUS_MESSAGE[r.status]" class="body-sm warn" role="status">{{ STATUS_MESSAGE[r.status] }}</span>
        </div>
        <Stepper v-if="r.counted && r.product?.kind !== 'digital'" :model-value="r.quantity" @update:model-value="cart.setQuantity(r.key, String($event))" />
        <span v-else-if="r.counted" class="mono-sm muted">× 1</span>
        <span class="mono-md sub">{{ r.counted ? formatMoney(r.subtotal) : '—' }}</span>
        <Button variant="ghost" icon="quitar" icon-only :label="`Quitar ${r.product?.name ?? r.line.productName ?? 'producto'}`" @click="cart.remove(r.key)" />
      </li>
    </ul>
    <Card as="aside" title="Resumen" aria-label="Resumen" class="summary">
      <dl class="sum">
        <div v-for="r in view.lines.filter((x) => x.counted)" :key="r.key"><dt>{{ r.product?.name ?? r.line.productName ?? 'Producto' }} × {{ r.quantity }}</dt><dd class="mono-md">{{ formatMoney(r.subtotal) }}</dd></div>
      </dl>
      <p class="total"><strong>Total estimado:</strong> <span class="display-md amount">{{ formatMoney(view.total) }}</span></p>
      <p v-if="paypal" class="caption muted">El envío, si lo eliges, se suma al pagar.</p>
      <p v-else class="caption muted">El pago y la entrega (retiro o envío) se acuerdan por WhatsApp.</p>
      <Button v-if="paypal" variant="accent" size="lg" to="/checkout">Ir a pagar</Button>
      <Button v-if="view.lines.some((r) => r.counted)" :variant="paypal ? 'secondary' : 'accent'" size="lg" :href="whatsappHref" target="_blank" rel="noopener">Pedir por WhatsApp</Button>
      <RouterLink to="/" class="more">Seguir viendo fotos</RouterLink>
    </Card>
  </div>
</template>

<style scoped>
.muted { color: var(--ink-muted); }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-4); margin-bottom: var(--space-6); }
.head h1 { margin: 0; }
.cols { display: flex; flex-wrap: wrap; gap: var(--space-10); align-items: flex-start; }
.lines { list-style: none; margin: 0; padding: 0; flex: 999 1 460px; min-width: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.lines li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-5); padding: var(--space-5) 0; border-bottom: 1px solid var(--line); }
.off { opacity: 0.5; }
.thumb { width: 128px; aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-sunken); flex: 0 0 auto; }
.info { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.name { font-size: 20px; overflow-wrap: anywhere; }
.warn { color: var(--danger); }
.sub { min-width: 96px; text-align: right; font-size: 16px; }
.summary { flex: 1 1 320px; max-width: 380px; }
.sum { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); font-size: 15px; color: var(--ink-muted); }
.sum div { display: flex; justify-content: space-between; gap: var(--space-3); }
.sum dt { min-width: 0; overflow-wrap: anywhere; }
.sum dd { margin: 0; }
.total { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.amount { font-size: 30px; }
.summary .caption { margin: 0; }
.more { text-align: center; font-size: 14px; color: var(--ink-muted); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
@media (max-width: 720px) {
  .thumb { width: 96px; }
  .lines li { gap: var(--space-4); }
  .summary { max-width: none; }
}
</style>
