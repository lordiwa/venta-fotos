<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listActiveProducts } from '../productsApi'
import { getPublicPhoto, getPublishedEvent } from '../publicApi'
import { getSettings } from '../settingsApi'
import {
  buildWhatsAppMessage, currentLinkEnv, CUSTOMER_KEY, customerPayload, orderLink, parseStoredCustomer, resolveWhatsappDigits, validateCustomer,
  whatsappFromCart, whatsappLinkAttrs, whatsappOrderMessage, whatsappUrl, type WhatsAppLine,
} from '../whatsappLogic'
import { createWhatsappOrder, whatsappOpener } from '../whatsappOrderApi'
import { orderErrorMessage } from '../serverErrors'
import { packBreakdown, reconcile, type PhotoAvailability } from '../cartLogic'
import { formatMoney } from '../productsLogic'
import { currentPaymentMode } from '../paymentMode'
import { useCartStore } from '../stores/cart'
import { Alert, Button, Card, Field, Stepper } from '../ui'
import { useI18n } from '../i18n'
import { productLabel } from '../i18n/format'
import type { Photo, Product } from '../types'

const cart = useCartStore()
const router = useRouter()
const { t, locale } = useI18n()
// Nombre de un producto en el idioma activo (solo se traducen los que crea la tienda; el resto va como lo cargo el admin).
const pname = (name: string | undefined) => productLabel(name ?? t.value.common.product, t.value, locale.value)
const money = (n: number) => formatMoney(n, locale.value)
const paypal = currentPaymentMode() === 'paypal'
const products = ref<Product[]>([])
const photos = ref<Record<string, PhotoAvailability>>({})
const thumbs = ref<Record<string, string | undefined>>({})
const eventNames = ref<Record<string, string | undefined>>({})
const photoNames = ref<Record<string, string | undefined>>({})
const whatsappDigits = ref(resolveWhatsappDigits(null))
// Movil: misma pestaña para que el sistema abra la app de WhatsApp (TASK-036); escritorio: pestaña nueva.
const waLink = whatsappLinkAttrs(currentLinkEnv())
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
    photos.value = Object.fromEntries(found.map(([k, p]) => [k, !p ? 'unavailable' : p.printOnly === true ? 'printOnly' : 'available'])) as Record<string, PhotoAvailability>
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
    ? buildWhatsAppMessage({ lines: cart.lines.map((l): WhatsAppLine => ({ photo: l.photoId, product: pname(l.productName), quantity: l.quantity })) }, locale.value)
    : buildWhatsAppMessage(whatsappFromCart(view.value, (id) => eventNames.value[id], name, locale.value), locale.value)
  return whatsappUrl(whatsappDigits.value, msg)
})

// ---- TASK-037: el pedido por WhatsApp se registra en el servidor antes de abrir el chat ----

const linkEnv = currentLinkEnv()
const readStored = () => { try { return localStorage.getItem(CUSTOMER_KEY) } catch { return null } }
// Se recuerdan nombre, WhatsApp y correo para el proximo pedido en este navegador.
const customer = reactive(parseStoredCustomer(readStored()))
watch(customer, (v) => { try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(v)) } catch { /* sin almacenamiento */ } })
const hasDigital = computed(() => view.value.lines.some((r) => r.counted && r.product?.kind === 'digital'))
const customerErrors = computed(() => validateCustomer(customer, hasDigital.value, locale.value))
const submitted = ref(false)
const shownErrors = computed(() => (submitted.value ? customerErrors.value : {}))
const ordering = ref(false)
const orderError = ref('')

/** CU1: valida, crea el pedido (precio del servidor) y abre WhatsApp con el detalle, el total, el numero y el link. */
async function orderByWhatsapp() {
  submitted.value = true
  orderError.value = ''
  if (ordering.value || Object.keys(customerErrors.value).length) return
  const lines = view.value.lines.filter((r) => r.counted).map((r) => ({ ...r.line, quantity: r.quantity }))
  if (!lines.length) return
  ordering.value = true
  // En escritorio la pestaña se abre ya, dentro del clic; en movil se navega en la misma (TASK-036).
  const opener = whatsappOpener(linkEnv)
  try {
    const created = await createWhatsappOrder(lines, customerPayload(customer, hasDigital.value))
    const msg = whatsappOrderMessage(created, {
      name: customer.name.trim(),
      link: orderLink(window.location.origin, created.number),
      eventName: (id) => eventNames.value[id],
      photoName: (eventId, photoId) => photoNames.value[`${eventId}/${photoId}`] ?? photoId,
      lang: locale.value,
    })
    cart.clear() // el pedido ya existe: volver a pedir lo mismo crearia un duplicado
    opener.go(whatsappUrl(whatsappDigits.value, msg))
    if (whatsappLinkAttrs(linkEnv).target) await router.push({ name: 'order', params: { number: created.number } })
  } catch (e) {
    opener.cancel()
    orderError.value = orderErrorMessage(e, locale.value)
  } finally {
    ordering.value = false
  }
}

/** TASK-029: desglose por evento de las digitales cobradas con paquetes (el resto del resumen va linea por linea). */
const packGroups = computed(() => view.value.groups.filter((g) => g.pricing.packs.length).map((g) => ({
  eventId: g.eventId, event: eventNames.value[g.eventId], items: packBreakdown(g, locale.value), savings: g.pricing.savingsCents / 100,
})))
</script>

<template>
  <div class="head">
    <h1 class="display-lg">{{ t.cart.title }}</h1>
    <span v-if="cart.lines.length" class="mono-sm muted">{{ t.cart.count(cart.lines.length) }}</span>
  </div>
  <Alert v-if="!cart.lines.length">
    {{ t.cart.empty }}
    <template #action><RouterLink to="/#eventos">{{ t.cart.seePhotos }}</RouterLink></template>
  </Alert>
  <p v-else-if="loading" class="mono-sm muted">{{ t.common.loading }}</p>
  <template v-else-if="error">
    <Alert tone="danger">
      {{ t.cart.refreshFailed }}
      <template #action><Button @click="load">{{ t.common.retry }}</Button></template>
    </Alert>
    <ul class="lines">
      <li v-for="l in cart.lines" :key="`${l.eventId}/${l.photoId}/${l.productId}`">
        <span class="info display-sm">{{ pname(l.productName) }} × {{ l.quantity }}</span>
        <Button variant="ghost" icon="quitar" @click="cart.remove(`${l.eventId}/${l.photoId}/${l.productId}`)">{{ t.cart.remove }}</Button>
      </li>
    </ul>
    <!-- TASK-037: sin catalogo no se puede registrar el pedido; en modo WhatsApp solo queda reintentar. -->
    <Button v-if="paypal" variant="secondary" size="lg" :href="whatsappHref" v-bind="waLink">{{ t.cart.orderWhatsapp }}</Button>
  </template>
  <div v-else class="cols">
    <ul class="lines">
      <li v-for="r in view.lines" :key="r.key">
        <div class="thumb" :class="{ off: !r.counted }"><PhotoThumb :path="thumbs[`${r.line.eventId}/${r.line.photoId}`]" fill /></div>
        <div class="info" :class="{ off: !r.counted }">
          <strong class="display-sm name">{{ pname(r.product?.name ?? r.line.productName) }}</strong>
          <span v-if="r.counted" class="mono-sm muted">{{ t.cart.each(money(r.unitPrice)) }}</span>
          <span v-if="t.cart.status[r.status]" class="body-sm warn" role="status">{{ t.cart.status[r.status] }}</span>
        </div>
        <Stepper v-if="r.counted && r.product?.kind !== 'digital'" :model-value="r.quantity" :label="t.stepper.label" :less-label="t.stepper.less" :more-label="t.stepper.more" @update:model-value="cart.setQuantity(r.key, String($event))" />
        <span v-else-if="r.counted" class="mono-sm muted">× 1</span>
        <span v-if="r.inPack" class="mono-sm muted sub">{{ t.cart.inPack }}</span>
        <span v-else class="mono-md sub">{{ r.counted ? money(r.subtotal) : '—' }}</span>
        <Button variant="ghost" icon="quitar" icon-only :label="t.cart.removeLabel(pname(r.product?.name ?? r.line.productName))" @click="cart.remove(r.key)" />
      </li>
    </ul>
    <Card as="aside" :title="t.cart.summary" :aria-label="t.cart.summary" class="summary">
      <dl class="sum">
        <div v-for="r in view.lines.filter((x) => x.counted && !x.inPack)" :key="r.key"><dt>{{ pname(r.product?.name ?? r.line.productName) }} × {{ r.quantity }}</dt><dd class="mono-md">{{ money(r.subtotal) }}</dd></div>
      </dl>
      <section v-for="g in packGroups" :key="g.eventId" class="pack" :aria-label="t.cart.packsOf(g.event)">
        <span v-if="g.event" class="mono-sm muted">{{ g.event }}</span>
        <dl class="sum">
          <div v-for="i in g.items" :key="i.label"><dt>{{ i.label }} × {{ i.quantity }}</dt><dd class="mono-md">{{ money(i.subtotal) }}</dd></div>
        </dl>
        <p class="body-sm saving">{{ t.cart.saves(money(g.savings)) }}</p>
      </section>
      <p class="total"><strong>{{ t.cart.totalEstimated }}</strong> <span class="display-md amount">{{ money(view.total) }}</span></p>
      <p v-if="paypal" class="caption muted">{{ t.cart.shippingPaypal }}</p>
      <p v-else class="caption muted">{{ t.cart.terms }}</p>
      <Button v-if="paypal" variant="accent" size="lg" to="/checkout">{{ t.cart.checkout }}</Button>
      <Button v-if="paypal && view.lines.some((r) => r.counted)" variant="secondary" size="lg" :href="whatsappHref" v-bind="waLink">{{ t.cart.orderWhatsapp }}</Button>
      <form v-if="!paypal && view.lines.some((r) => r.counted)" class="customer" novalidate :aria-label="t.cart.yourData" @submit.prevent="orderByWhatsapp">
        <Field v-model="customer.name" :label="t.cart.name" autocomplete="name" :error="shownErrors.name" />
        <Field v-model="customer.phone" :label="t.cart.whatsapp" type="tel" inputmode="tel" autocomplete="tel" :hint="t.cart.phoneHint" :error="shownErrors.phone" />
        <!-- El correo solo se pide (y se guarda) si hay fotos digitales: las descargas se validan con el. -->
        <Field v-if="hasDigital" v-model="customer.email" :label="t.cart.email" type="email" inputmode="email" autocomplete="email" :hint="t.cart.emailHint" :error="shownErrors.email" />
        <Alert v-if="orderError" tone="danger">{{ orderError }}</Alert>
        <Button type="submit" variant="accent" size="lg" :disabled="ordering">{{ ordering ? t.cart.registering : t.cart.orderWhatsapp }}</Button>
      </form>
      <RouterLink to="/#eventos" class="more">{{ t.cart.keepBrowsing }}</RouterLink>
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
.pack { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px dashed var(--line); }
.saving { margin: 0; color: var(--success); font-weight: 600; }
.total { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.amount { font-size: 30px; }
.summary .caption { margin: 0; }
.customer { display: flex; flex-direction: column; gap: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.customer > .es-btn { width: 100%; }
.more { text-align: center; font-size: 14px; color: var(--ink-muted); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
@media (max-width: 720px) {
  .thumb { width: 96px; }
  .lines li { gap: var(--space-4); }
  .summary { max-width: none; }
}
</style>
