<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loadScript } from '@paypal/paypal-js'
import { listActiveProducts } from '../productsApi'
import { getSettings } from '../settingsApi'
import { reconcile } from '../cartLogic'
import { formatMoney } from '../productsLogic'
import { useCartStore } from '../stores/cart'
import { currentPaymentMode } from '../paymentMode'
import { classifyCaptureError, clearPending, CURRENCY, loadPending, loadPendingEmail, savePending, saveSummary, totalWithShipping, validateCheckoutForm, type CheckoutForm } from '../checkoutLogic'
import { captureOrder, createOrder } from '../checkoutApi'
import { checkoutErrorMessage } from '../serverErrors'
import { Alert, Button, Card, Field, OptionCard } from '../ui'
import { useI18n } from '../i18n'
import { productLabel } from '../i18n/format'
import type { Product, StoreSettings } from '../types'

const cart = useCartStore()
const router = useRouter()
const clientId = currentPaymentMode() === 'whatsapp' ? undefined : (import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined)
const canSimulate = import.meta.env.DEV // CU12: el boton no existe en el build de produccion

const { t, locale } = useI18n()
const errorMessage = (e: unknown) => checkoutErrorMessage(e, locale.value)
const money = (n: number) => formatMoney(n, locale.value)
const pname = (name: string | undefined) => productLabel(name ?? t.value.common.product, t.value, locale.value)
// Marca el aviso de "pago anterior" (informativo, no es un error); el texto cambia con el idioma.
const pendingNotice = ref(false)
const form = reactive<CheckoutForm>({ name: '', email: '', phone: '', method: 'retiro', address: '' })
const products = ref<Product[]>([])
const settings = ref<StoreSettings | null>(null)
const loading = ref(true)
const loadError = ref(false)
const message = ref('')
const busy = ref(false)
const submitted = ref(false)
const finalMessage = ref('') // cobro registrado sin pedido: no se vuelve a pagar
const retryId = ref<string | null>(null) // captura pendiente de reintento
const paypalContainer = ref<HTMLElement | null>(null)

// Sin fotos que consultar: el servidor valida que cada foto siga publica y rechaza con mensaje.
const view = computed(() => reconcile(cart.lines, products.value, {}))
const hasPrints = computed(() => view.value.lines.some((l) => l.counted && l.product?.kind === 'print'))
const blocked = computed(() => view.value.lines.some((l) => !l.counted))
const shippingCost = computed(() => settings.value?.shippingCost ?? 0)
/** TASK-029: las lineas van a precio suelto; el ahorro de paquetes se resta aparte (igual que en el servidor). */
const packSavings = computed(() => view.value.groups.reduce((s, g) => s + g.pricing.savingsCents, 0) / 100)
const total = computed(() => totalWithShipping(view.value.total, form.method, hasPrints.value, shippingCost.value))
const errors = computed(() => validateCheckoutForm(form, hasPrints.value, locale.value))
const shown = computed(() => (submitted.value ? errors.value : {}))

/** Valida el formulario; si hay errores los muestra y no deja pagar. */
function ready(): boolean {
  submitted.value = true
  message.value = ''
  pendingNotice.value = false
  if (busy.value || retryId.value) return false
  if (blocked.value) { message.value = t.value.checkout.removeUnavailable; return false }
  return Object.keys(errors.value).length === 0
}

async function finish(paypalOrderId: string, recovered = false) {
  busy.value = true
  try {
    const summary = await captureOrder(paypalOrderId)
    // Recuperado tras recargar: el formulario esta vacio, el correo viene de lo guardado con el id pendiente.
    const email = recovered ? loadPendingEmail() : form.email.trim()
    saveSummary({ ...summary, ...(email ? { email } : {}) })
    clearPending()
    cart.clear()
    await router.push({ name: 'order', params: { number: summary.number } })
  } catch (e) {
    pendingNotice.value = false // el aviso informativo deja paso al resultado (error) de este intento
    const outcome = classifyCaptureError(e)
    message.value = recovered && outcome === 'definitive'
      ? t.value.checkout.recoverFailed
      : errorMessage(e) // CU9: sin pedido pagado, el carrito se conserva
    if (outcome === 'retry') {
      retryId.value = paypalOrderId // se reintenta sobre el mismo id; no se crea otra orden
      message.value = t.value.checkout.retryHint
    } else {
      clearPending()
      retryId.value = null
      if (outcome === 'final') finalMessage.value = message.value
    }
  } finally {
    busy.value = false
  }
}

const retryCapture = () => { if (retryId.value && !busy.value) { const id = retryId.value; retryId.value = null; void finish(id) } }

async function start(simulated: boolean): Promise<string> {
  return createOrder({ lines: cart.lines, form, simulated })
}

async function simulate() {
  if (!ready()) return
  busy.value = true // sincrono, antes de cualquier await: un doble clic no dispara dos createOrder
  try { await finish(await start(true)) } catch (e) { message.value = errorMessage(e); busy.value = false }
}

async function mountButtons() {
  if (!clientId) return
  try {
    const paypal = await loadScript({ clientId, currency: CURRENCY })
    await nextTick()
    if (!paypal?.Buttons || !paypalContainer.value) { message.value = t.value.checkout.paypalLoadFailed; return }
    await paypal.Buttons({
      onClick: (_data, actions) => { if (!ready()) return actions.reject(); busy.value = true; return actions.resolve() },
      createOrder: async () => {
        try { return await start(false) } catch (e) { clearPending(); message.value = errorMessage(e); busy.value = false; throw e }
      },
      onApprove: async (data) => { savePending(data.orderID, form.email); await finish(data.orderID) }, // pendiente solo una vez aprobada en PayPal
      onCancel: () => { clearPending(); busy.value = false; message.value = t.value.checkout.cancelled },
      onError: () => { clearPending(); busy.value = false; message.value ||= t.value.checkout.paypalError },
    }).render(paypalContainer.value)
  } catch {
    message.value = t.value.checkout.paypalLoadFailed
  }
}

onMounted(async () => {
  if (!cart.lines.length) { router.replace('/carrito'); return } // CU1
  try {
    ;[products.value, settings.value] = await Promise.all([listActiveProducts(), getSettings()])
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
  if (loadError.value) return
  await nextTick()
  await mountButtons()
  const pending = loadPending() // un pago anterior quedo sin confirmar: reintentar la captura del mismo id
  if (pending) { pendingNotice.value = true; await finish(pending, true) }
})
</script>

<template>
  <div class="top">
    <ol class="eyebrow steps">
      <li><RouterLink to="/carrito">{{ t.checkout.cart }}</RouterLink></li><li aria-hidden="true">→</li><li aria-current="step" class="here">{{ t.checkout.pay }}</li><li aria-hidden="true">→</li><li>{{ t.checkout.confirmation }}</li>
    </ol>
    <h1 class="display-lg">{{ t.checkout.pay }}</h1>
  </div>
  <p v-if="loading" class="mono-sm muted">{{ t.common.loading }}</p>
  <Alert v-else-if="loadError" tone="danger">
    {{ t.checkout.loadFailed }}
    <template #action><Button @click="router.go(0)">{{ t.common.retry }}</Button></template>
  </Alert>
  <div v-else-if="cart.lines.length" class="cols">
    <form novalidate class="form" @submit.prevent>
      <Card :title="t.checkout.yourData" :aria-label="t.checkout.yourData">
        <div class="pair">
          <Field v-model="form.name" :label="t.checkout.name" autocomplete="name" :error="shown.name" />
          <Field v-model="form.phone" :label="t.checkout.phone" type="tel" autocomplete="tel" :error="shown.phone" />
        </div>
        <Field v-model="form.email" :label="t.checkout.email" type="email" autocomplete="email" :error="shown.email" />
        <p class="caption muted">{{ t.checkout.emailNote }}</p>
      </Card>
      <Card as="div" :title="t.checkout.delivery" :aria-label="t.checkout.delivery">
        <template v-if="hasPrints">
          <fieldset>
            <legend class="sr">{{ t.checkout.delivery }}</legend>
            <OptionCard v-model="form.method" name="metodo" value="retiro" :label="t.checkout.pickup" />
            <OptionCard v-model="form.method" name="metodo" value="envio" :label="t.checkout.shipping" :meta="`+ ${money(shippingCost)}`" />
          </fieldset>
          <p v-if="form.method === 'retiro' && settings?.pickupInfo" class="pickup">{{ settings.pickupInfo }}</p>
          <Field v-if="form.method === 'envio'" v-model="form.address" as="textarea" :label="t.checkout.address" :rows="3" autocomplete="street-address" :error="shown.address" />
        </template>
        <p v-else class="body-sm muted">{{ t.checkout.digitalOnly }}</p>
      </Card>
    </form>

    <Card as="aside" :title="t.checkout.summary" :aria-label="t.checkout.summaryAria" class="summary">
      <ul class="lines">
        <li v-for="r in view.lines" :key="r.key" :class="{ off: !r.counted }">
          <span class="lname" :class="{ gone: !r.counted }">{{ pname(r.product?.name ?? r.line.productName) }} × {{ r.quantity }}</span>
          <span v-if="r.counted" class="mono-sm">{{ money(r.subtotal) }}</span>
          <span v-else class="caption warn">{{ t.checkout.unavailable }}</span>
        </li>
        <li v-if="packSavings"><span class="lname">{{ t.checkout.packSavings }}</span><span class="mono-sm">−{{ money(packSavings) }}</span></li>
      </ul>
      <p class="total"><strong>{{ t.checkout.total }}</strong> <span class="display-md amount">{{ money(total) }} <span class="label muted">{{ CURRENCY }}</span></span></p>
      <Alert v-if="pendingNotice || message" :tone="pendingNotice ? 'neutral' : 'danger'">{{ pendingNotice ? t.checkout.pending : message }}</Alert>
      <Button v-if="retryId" variant="secondary" :disabled="busy" @click="retryCapture">{{ t.checkout.retryConfirm }}</Button>
      <Alert v-if="!clientId">{{ t.checkout.paypalMissing }}</Alert>
      <div v-show="!finalMessage" ref="paypalContainer" :aria-busy="busy" :class="{ off: busy }" />
      <div v-if="canSimulate && !finalMessage" class="sim">
        <Button variant="ghost" :disabled="busy" @click="simulate">{{ t.checkout.simulate }}</Button>
        <span class="table-head muted">{{ t.checkout.testOnly }}</span>
      </div>
      <RouterLink to="/carrito" class="back">{{ t.checkout.backToCart }}</RouterLink>
    </Card>
  </div>
</template>

<style scoped>
.muted { color: var(--ink-muted); }
.top { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-8); }
.top h1 { margin: 0; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); text-transform: uppercase; color: var(--ink-muted); }
.steps a { color: var(--ink-muted); text-decoration: none; }
.steps .here { color: var(--amber-ink); }
.cols { display: flex; flex-wrap: wrap; gap: var(--space-12); align-items: flex-start; }
.form { flex: 999 1 460px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-6); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: var(--space-4); }
.caption { margin: 0; }
fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pickup { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-sunken); font-size: 14px; white-space: pre-line; overflow-wrap: anywhere; }
.summary { flex: 1 1 340px; max-width: 400px; }
.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.lines li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: 15px; }
.lines li.off { opacity: 0.55; }
.lname { min-width: 0; overflow-wrap: anywhere; }
.gone { text-decoration: line-through; }
.warn { color: var(--danger); }
.total { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.amount { font-size: 30px; }
.off { opacity: 0.6; pointer-events: none; }
.sim { display: flex; flex-direction: column; gap: var(--space-2); }
.sim .table-head { text-align: center; text-transform: uppercase; }
.back { text-align: center; font-size: 14px; color: var(--ink-muted); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
@media (max-width: 720px) {
  .cols { gap: var(--space-6); }
  .summary { max-width: none; }
}
</style>
