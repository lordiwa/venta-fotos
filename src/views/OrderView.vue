<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DownloadList from '../components/DownloadList.vue'
import { formatMoney } from '../productsLogic'
import { CURRENCY, loadSummary } from '../checkoutLogic'
import { getDownloadLinks } from '../downloadsApi'
import { downloadErrorMessage, downloadNotice, statusErrorMessage } from '../serverErrors'
import { hasDigital, type DownloadResult } from '../downloadsLogic'
import { packSavings } from '../ordersLogic'
import { getOrderStatus, type PublicOrder } from '../whatsappOrderApi'
import { deadlineText } from '../whatsappLogic'
import { Alert, Badge, Button, Card, Icon, OrderNumber } from '../ui'
import { useI18n } from '../i18n'
import { productLabel } from '../i18n/format'

const route = useRoute()
const { t, locale } = useI18n()
const money = (n: number) => formatMoney(n, locale.value)
const pname = (name: string) => productLabel(name, t.value, locale.value)
const number = computed(() => String(route.params.number))
// Los pedidos no son publicos: el resumen viene de captureOrder y vive en sessionStorage de esta pestana.
const order = computed(() => loadSummary(number.value))

// CU1: si el pedido trae archivos digitales, se piden los enlaces con numero + correo del resumen.
const savings = computed(() => (order.value ? packSavings(order.value) : 0))
const wantsLinks = computed(() => !!order.value?.email && hasDigital(order.value.lines))
const links = ref<DownloadResult | null>(null)
const linksErr = ref<{ e: unknown } | null>(null) // el error, no el texto: cambiar de idioma retraduce
const linksError = computed(() => (linksErr.value ? downloadErrorMessage(linksErr.value.e, locale.value) : ''))
const busy = ref(false)

async function loadLinks() {
  if (!order.value?.email || busy.value) return
  busy.value = true
  linksErr.value = null
  try {
    links.value = await getDownloadLinks(number.value, order.value.email)
  } catch (e) {
    linksErr.value = { e }
  } finally {
    busy.value = false
  }
}
// TASK-037 CU9: sin resumen local (pedido por WhatsApp, u otro navegador) se consulta el estado publico, sin telefono ni correo completos.
const status = ref<PublicOrder | null>(null)
const statusErr = ref<{ e: unknown } | null>(null)
const statusError = computed(() => (statusErr.value ? statusErrorMessage(statusErr.value.e, locale.value) : ''))
const statusLoading = ref(false)
async function loadStatus() {
  statusLoading.value = true
  statusErr.value = null
  try {
    status.value = await getOrderStatus(number.value)
  } catch (e) {
    statusErr.value = { e }
  } finally {
    statusLoading.value = false
  }
}
const paidLike = computed(() => !!status.value && !['pendiente_pago', 'cancelado', 'anulado'].includes(status.value.status))
const statusTitle = computed(() => {
  const o = t.value.order
  switch (status.value?.status) {
    case 'pendiente_pago': return o.registered
    case 'anulado': return o.voided
    case 'cancelado': return o.cancelled
    case 'entregado': return o.delivered
    default: return o.thanks
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
      <h1 class="display-lg">{{ order ? t.order.thanks : status ? statusTitle : t.order.yourOrder }}</h1>
      <div class="num">
        <OrderNumber :caption="t.order.numberCaption"><span data-testid="order-number">{{ number }}</span></OrderNumber>
        <span class="body-sm muted">{{ t.order.keepIt }}</span>
      </div>
    </div>
    <template v-if="order">
      <Card :aria-label="t.order.details">
        <ul class="rows">
          <li v-for="(l, i) in order.lines" :key="i"><span>{{ pname(l.productName) }} × {{ l.quantity }}</span><span class="mono-md">{{ money(l.unitPrice * l.quantity) }}</span></li>
          <li v-for="(p, i) in order.packs ?? []" :key="`pk${i}`" class="muted"><span>{{ pname(p.name) }} × {{ p.times }} ({{ t.order.each(money(p.price)) }})</span><span class="mono-md">—</span></li>
          <li v-if="savings"><span>{{ t.order.packSavings }}</span><span class="mono-md">−{{ money(savings) }}</span></li>
          <li v-if="order.delivery.method === 'envio'"><span>{{ t.order.homeDelivery(order.delivery.address) }}</span><span class="mono-md">+ {{ money(order.delivery.cost) }}</span></li>
          <li v-else class="muted"><span>{{ t.order.pickup }}</span><span class="mono-md">—</span></li>
        </ul>
        <p class="total"><strong>{{ t.order.total }}</strong> <span class="display-md amount">{{ money(order.total) }} <span class="label muted">{{ CURRENCY }}</span></span></p>
      </Card>
      <Card v-if="wantsLinks" :title="t.order.filesTitle" :aria-label="t.order.downloadsAria">
        <p v-if="busy && !links" class="mono-sm muted">{{ t.order.preparing }}</p>
        <template v-if="links">
          <Alert v-if="links.message">{{ downloadNotice(links.message, locale) }}</Alert>
          <DownloadList :files="links.files" :busy="busy" @refresh="loadLinks" />
        </template>
        <Alert v-if="linksError" tone="danger">
          {{ linksError }}
          <template #action><Button :disabled="busy" @click="loadLinks">{{ t.order.newLink }}</Button></template>
        </Alert>
      </Card>
    </template>
    <p v-else-if="statusLoading" class="mono-sm muted center">{{ t.order.loadingOrder }}</p>
    <Alert v-else-if="statusError" tone="danger">
      {{ statusError }}
      <template #action><Button @click="loadStatus">{{ t.common.retry }}</Button></template>
    </Alert>
    <template v-else-if="status">
      <Card :aria-label="statusTitle">
        <div class="state-head">
          <span class="table-head muted">{{ t.order.state }}</span>
          <Badge :status="status.status">{{ t.order.statuses[status.status] }}</Badge>
        </div>
        <p v-if="status.status === 'pendiente_pago' && status.expiresAt" class="body-sm">
          {{ t.order.payBefore }}<strong>{{ deadlineText(status.expiresAt, locale) }}</strong>{{ t.order.payAfter(status.customer.phone) }}
        </p>
        <p v-else-if="status.status === 'anulado'" class="body-sm">{{ t.order.voidedText }}</p>
        <p v-else-if="status.status === 'cancelado'" class="body-sm">{{ t.order.cancelledText }}</p>
        <p v-else class="body-sm">{{ t.order.paidText }}</p>
        <ul class="rows">
          <li v-for="(l, i) in status.lines" :key="i"><span>{{ pname(l.productName) }} × {{ l.quantity }}</span><span class="mono-md">{{ money(l.unitPrice * l.quantity) }}</span></li>
          <li v-for="(p, i) in status.packs" :key="`pk${i}`" class="muted"><span>{{ pname(p.name) }} × {{ p.times }} ({{ t.order.each(money(p.price)) }})</span><span class="mono-md">—</span></li>
          <li v-if="status.savings"><span>{{ t.order.packSavings }}</span><span class="mono-md">−{{ money(status.savings) }}</span></li>
        </ul>
        <p class="total"><strong>{{ t.order.total }}</strong> <span class="display-md amount">{{ money(status.total) }} <span class="label muted">{{ CURRENCY }}</span></span></p>
      </Card>
      <Alert v-if="paidLike && status.hasDigital">{{ t.order.digitalBefore }}<RouterLink to="/descargas">{{ t.order.digitalLink }}</RouterLink>{{ t.order.digitalAfter }}</Alert>
    </template>
    <div class="links">
      <span>{{ t.order.redownload }}<RouterLink to="/descargas" class="strong">{{ t.order.redownloadLink }}</RouterLink></span>
      <RouterLink to="/" class="soft">{{ t.common.home }}</RouterLink>
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
