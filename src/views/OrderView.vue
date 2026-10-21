<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DownloadList from '../components/DownloadList.vue'
import { formatMoney } from '../productsLogic'
import { CURRENCY, loadSummary } from '../checkoutLogic'
import { downloadErrorMessage, getDownloadLinks } from '../downloadsApi'
import { hasDigital, type DownloadResult } from '../downloadsLogic'
import { packSavings } from '../ordersLogic'
import { getOrderStatus, type PublicOrder } from '../whatsappOrderApi'
import { deadlineText } from '../whatsappLogic'
import { Alert, Badge, Button, Card, Icon, OrderNumber } from '../ui'

const route = useRoute()
const number = computed(() => String(route.params.number))
// Los pedidos no son publicos: el resumen viene de captureOrder y vive en sessionStorage de esta pestana.
const order = computed(() => loadSummary(number.value))

// CU1: si el pedido trae archivos digitales, se piden los enlaces con numero + correo del resumen.
const savings = computed(() => (order.value ? packSavings(order.value) : 0))
const wantsLinks = computed(() => !!order.value?.email && hasDigital(order.value.lines))
const links = ref<DownloadResult | null>(null)
const linksError = ref('')
const busy = ref(false)

async function loadLinks() {
  if (!order.value?.email || busy.value) return
  busy.value = true
  linksError.value = ''
  try {
    links.value = await getDownloadLinks(number.value, order.value.email)
  } catch (e) {
    linksError.value = downloadErrorMessage(e)
  } finally {
    busy.value = false
  }
}
// TASK-037 CU9: sin resumen local (pedido por WhatsApp, u otro navegador) se consulta el estado publico, sin telefono ni correo completos.
const status = ref<PublicOrder | null>(null)
const statusError = ref('')
const statusLoading = ref(false)
async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await getOrderStatus(number.value)
  } catch (e) {
    const code = (e as { code?: string }).code
    statusError.value = code === 'functions/not-found' ? 'No encontramos un pedido con ese número.'
      : code === 'functions/resource-exhausted' ? 'Demasiados intentos. Prueba más tarde.'
      : 'No pudimos cargar tu pedido. Revisa tu conexión e intenta de nuevo.'
  } finally {
    statusLoading.value = false
  }
}
const paidLike = computed(() => !!status.value && !['pendiente_pago', 'cancelado', 'anulado'].includes(status.value.status))
const statusTitle = computed(() => {
  switch (status.value?.status) {
    case 'pendiente_pago': return 'Pedido registrado'
    case 'anulado': return 'Pedido anulado'
    case 'cancelado': return 'Pedido cancelado'
    case 'entregado': return 'Pedido entregado'
    default: return '¡Gracias por tu compra!'
  }
})
onMounted(() => {
  if (wantsLinks.value) void loadLinks()
  if (!order.value) void loadStatus()
})
</script>

<template>
  <div class="narrow">
    <div class="hero">
      <span v-if="order || paidLike" class="seal" aria-hidden="true"><Icon name="check" :size="34" :stroke-width="2.4" /></span>
      <h1 class="display-lg">{{ order ? '¡Gracias por tu compra!' : status ? statusTitle : 'Tu pedido' }}</h1>
      <div class="num">
        <OrderNumber><span data-testid="order-number">{{ number }}</span></OrderNumber>
        <span class="body-sm muted">Guárdalo: lo necesitas para volver a descargar tus archivos.</span>
      </div>
    </div>
    <template v-if="order">
      <Card aria-label="Detalle del pedido">
        <ul class="rows">
          <li v-for="(l, i) in order.lines" :key="i"><span>{{ l.productName }} × {{ l.quantity }}</span><span class="mono-md">{{ formatMoney(l.unitPrice * l.quantity) }}</span></li>
          <li v-for="(p, i) in order.packs ?? []" :key="`pk${i}`" class="muted"><span>{{ p.name }} × {{ p.times }} ({{ formatMoney(p.price) }} c/u)</span><span class="mono-md">—</span></li>
          <li v-if="savings"><span>Ahorro por paquetes</span><span class="mono-md">−{{ formatMoney(savings) }}</span></li>
          <li v-if="order.delivery.method === 'envio'"><span>Envío a domicilio: {{ order.delivery.address }}</span><span class="mono-md">+ {{ formatMoney(order.delivery.cost) }}</span></li>
          <li v-else class="muted"><span>Retiro en persona.</span><span class="mono-md">—</span></li>
        </ul>
        <p class="total"><strong>Total:</strong> <span class="display-md amount">{{ formatMoney(order.total) }} <span class="label muted">{{ CURRENCY }}</span></span></p>
      </Card>
      <Card v-if="wantsLinks" title="Tus archivos digitales" aria-label="Descargas">
        <p v-if="busy && !links" class="mono-sm muted">Preparando tus enlaces…</p>
        <template v-if="links">
          <Alert v-if="links.message">{{ links.message }}</Alert>
          <DownloadList :files="links.files" :busy="busy" @refresh="loadLinks" />
        </template>
        <Alert v-if="linksError" tone="danger">
          {{ linksError }}
          <template #action><Button :disabled="busy" @click="loadLinks">Generar un enlace nuevo</Button></template>
        </Alert>
      </Card>
    </template>
    <p v-else-if="statusLoading" class="mono-sm muted center">Cargando tu pedido…</p>
    <Alert v-else-if="statusError" tone="danger">
      {{ statusError }}
      <template #action><Button @click="loadStatus">Reintentar</Button></template>
    </Alert>
    <template v-else-if="status">
      <Card :aria-label="statusTitle">
        <div class="state-head">
          <span class="table-head muted">Estado</span>
          <Badge :status="status.status" />
        </div>
        <p v-if="status.status === 'pendiente_pago' && status.expiresAt" class="body-sm">
          Paga antes del <strong>{{ deadlineText(status.expiresAt) }}</strong>. Pasado ese plazo el pedido se anula solo.
          Coordina el pago por WhatsApp{{ status.customer.phone ? ` (te escribimos al ${status.customer.phone})` : '' }}.
        </p>
        <p v-else-if="status.status === 'anulado'" class="body-sm">Este pedido se anuló porque no se pagó dentro de las 24 horas. Si aún quieres las fotos, haz un pedido nuevo.</p>
        <p v-else-if="status.status === 'cancelado'" class="body-sm">Este pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.</p>
        <p v-else class="body-sm">Recibimos tu pago. Te avisamos por WhatsApp cuando tus fotos estén listas.</p>
        <ul class="rows">
          <li v-for="(l, i) in status.lines" :key="i"><span>{{ l.productName }} × {{ l.quantity }}</span><span class="mono-md">{{ formatMoney(l.unitPrice * l.quantity) }}</span></li>
          <li v-for="(p, i) in status.packs" :key="`pk${i}`" class="muted"><span>{{ p.name }} × {{ p.times }} ({{ formatMoney(p.price) }} c/u)</span><span class="mono-md">—</span></li>
          <li v-if="status.savings"><span>Ahorro por paquetes</span><span class="mono-md">−{{ formatMoney(status.savings) }}</span></li>
        </ul>
        <p class="total"><strong>Total:</strong> <span class="display-md amount">{{ formatMoney(status.total) }} <span class="label muted">{{ CURRENCY }}</span></span></p>
      </Card>
      <Alert v-if="paidLike && status.hasDigital">Tus fotos digitales están en <RouterLink to="/descargas">Mis descargas</RouterLink>, con este número y tu correo.</Alert>
    </template>
    <div class="links">
      <span>¿Necesitas volver a descargar tus archivos? <RouterLink to="/descargas" class="strong">Ir a Mis descargas</RouterLink></span>
      <RouterLink to="/" class="soft">Volver al inicio</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--ink-muted); }
.center { text-align: center; }
.state-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.state-head + p { margin: 0; }
.narrow { max-width: 760px; margin: 0 auto; padding: var(--space-8) 0 var(--space-12); display: flex; flex-direction: column; gap: var(--space-7); }
.hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-5); }
.hero h1 { margin: 0; font-size: clamp(36px, 7vw, 56px); text-wrap: balance; }
.seal { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: var(--radius-pill); background: var(--amber); color: var(--on-amber); box-shadow: 0 0 0 12px var(--amber-soft); }
.num { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); max-width: 100%; }
.num :deep(.es-ordernum-value) { overflow-wrap: anywhere; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); font-size: 15px; }
.rows li { display: flex; justify-content: space-between; gap: var(--space-3); }
.rows li > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.total { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.amount { font-size: 28px; }
.links { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-3) var(--space-7); font-size: 15px; text-align: center; }
.strong { font-weight: 500; }
.soft { color: var(--ink-muted); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; }
</style>
