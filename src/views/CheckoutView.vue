<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loadScript } from '@paypal/paypal-js'
import { listActiveProducts } from '../productsApi'
import { getSettings } from '../settingsApi'
import { reconcile } from '../cartLogic'
import { formatMoney } from '../productsLogic'
import { useCartStore } from '../stores/cart'
import { classifyCaptureError, clearPending, CURRENCY, loadPending, savePending, saveSummary, totalWithShipping, validateCheckoutForm, type CheckoutForm } from '../checkoutLogic'
import { captureOrder, createOrder, errorMessage } from '../checkoutApi'
import type { Product, StoreSettings } from '../types'

const cart = useCartStore()
const router = useRouter()
const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined
const canSimulate = import.meta.env.DEV // CU12: el boton no existe en el build de produccion

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
const total = computed(() => totalWithShipping(view.value.total, form.method, hasPrints.value, shippingCost.value))
const errors = computed(() => validateCheckoutForm(form, hasPrints.value))
const shown = computed(() => (submitted.value ? errors.value : {}))

/** Valida el formulario; si hay errores los muestra y no deja pagar. */
function ready(): boolean {
  submitted.value = true
  message.value = ''
  if (busy.value || retryId.value) return false
  if (blocked.value) { message.value = 'Quita del carrito los productos que ya no están disponibles.'; return false }
  return Object.keys(errors.value).length === 0
}

async function finish(paypalOrderId: string) {
  busy.value = true
  try {
    const summary = await captureOrder(paypalOrderId)
    saveSummary(summary)
    clearPending()
    cart.clear()
    await router.push({ name: 'order', params: { number: summary.number } })
  } catch (e) {
    const outcome = classifyCaptureError(e)
    message.value = errorMessage(e) // CU9: sin pedido pagado, el carrito se conserva
    if (outcome === 'retry') {
      retryId.value = paypalOrderId // se reintenta sobre el mismo id; no se crea otra orden
      message.value = 'No pudimos confirmar tu pago. Reintenta la confirmación; no pagues de nuevo.'
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
  const id = await createOrder({ lines: cart.lines, form, simulated })
  savePending(id)
  return id
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
    if (!paypal?.Buttons || !paypalContainer.value) { message.value = 'No pudimos cargar PayPal. Recarga la página.'; return }
    await paypal.Buttons({
      onClick: (_data, actions) => { if (!ready()) return actions.reject(); busy.value = true; return actions.resolve() },
      createOrder: async () => {
        try { return await start(false) } catch (e) { message.value = errorMessage(e); busy.value = false; throw e }
      },
      onApprove: async (data) => { await finish(data.orderID) },
      onCancel: () => { busy.value = false; message.value = 'Cancelaste el pago. Tu carrito sigue igual; puedes intentarlo de nuevo.' },
      onError: () => { busy.value = false; message.value ||= 'No pudimos completar el pago con PayPal. Intenta de nuevo.' },
    }).render(paypalContainer.value)
  } catch {
    message.value = 'No pudimos cargar PayPal. Recarga la página.'
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
  if (pending) { message.value = 'Confirmando tu pago anterior…'; await finish(pending) }
})
</script>

<template>
  <h1>Pagar</h1>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="loadError" role="alert">No pudimos cargar tu pedido. <button type="button" @click="router.go(0)">Reintentar</button></p>
  <template v-else-if="cart.lines.length">
    <section aria-label="Resumen">
      <h2>Resumen</h2>
      <ul class="lines">
        <li v-for="r in view.lines" :key="r.key" :class="{ off: !r.counted }">
          {{ r.product?.name ?? r.line.productName ?? 'Producto' }} × {{ r.quantity }}
          <span v-if="r.counted"> — {{ formatMoney(r.subtotal) }}</span>
          <span v-else class="warn"> — no disponible</span>
        </li>
      </ul>
    </section>

    <form novalidate @submit.prevent>
      <h2>Tus datos</h2>
      <label>Nombre <input v-model="form.name" autocomplete="name" /></label>
      <span v-if="shown.name" class="warn" role="alert">{{ shown.name }}</span>
      <label>Correo <input v-model="form.email" type="email" autocomplete="email" /></label>
      <span v-if="shown.email" class="warn" role="alert">{{ shown.email }}</span>
      <label>Teléfono <input v-model="form.phone" type="tel" autocomplete="tel" /></label>
      <span v-if="shown.phone" class="warn" role="alert">{{ shown.phone }}</span>

      <fieldset v-if="hasPrints">
        <legend>Entrega</legend>
        <label><input v-model="form.method" type="radio" value="retiro" /> Retiro en persona</label>
        <label><input v-model="form.method" type="radio" value="envio" /> Envío a domicilio (+ {{ formatMoney(shippingCost) }})</label>
        <p v-if="form.method === 'retiro' && settings?.pickupInfo" class="pickup">{{ settings.pickupInfo }}</p>
        <template v-if="form.method === 'envio'">
          <label>Dirección <textarea v-model="form.address" rows="3" autocomplete="street-address" /></label>
          <span v-if="shown.address" class="warn" role="alert">{{ shown.address }}</span>
        </template>
      </fieldset>
      <p v-else>Tu pedido es solo digital: no requiere entrega.</p>
    </form>

    <p class="total"><strong>Total:</strong> {{ formatMoney(total) }} {{ CURRENCY }}</p>
    <p v-if="message" class="warn" role="alert">{{ message }}</p>
    <button v-if="retryId" type="button" :disabled="busy" @click="retryCapture">Reintentar confirmación</button>
    <p v-if="!clientId">Pago con PayPal no configurado</p>
    <div v-show="!finalMessage" ref="paypalContainer" :aria-busy="busy" :class="{ off: busy }" />
    <button v-if="canSimulate && !finalMessage" type="button" :disabled="busy" @click="simulate">Simular pago</button>
    <p><RouterLink to="/carrito">Volver al carrito</RouterLink></p>
  </template>
</template>

<style scoped>
form { display: grid; gap: 0.4rem; max-width: 28rem; }
label { display: flex; flex-direction: column; gap: 0.2rem; }
fieldset label { flex-direction: row; gap: 0.5rem; }
.lines { list-style: none; padding: 0; }
.off { opacity: 0.6; pointer-events: none; }
.warn { color: #b42318; font-size: 0.9rem; }
.pickup { background: #f4f5f8; border-radius: 6px; padding: 0.5rem 1rem; white-space: pre-line; }
.total { font-size: 1.2rem; }
</style>
