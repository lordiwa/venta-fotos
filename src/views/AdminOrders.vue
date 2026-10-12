<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listEvents } from '../eventsApi'
import { advanceOrder, getPhoto, listOrders } from '../ordersApi'
import { filterOrders, nextStatus, STATUS_LABEL, STATUSES, type OrderFilters, type OrderRow } from '../ordersLogic'
import { formatMoney } from '../productsLogic'
import { Alert, Badge, Button, Field, OrderNumber } from '../ui'
import type { Event } from '../types'

const orders = ref<OrderRow[]>([])
const events = ref<Event[]>([])
const loading = ref(true)
const loadError = ref(false)
const filters = ref<OrderFilters>({ eventId: '', status: '', method: '' })
const openId = ref<string | null>(null)
const thumbs = ref<Record<string, string | undefined>>({})
const busy = ref(false)
const actionError = ref('')
const capped = ref(false)
const FALLBACK = 'No se pudo cambiar el estado. Intenta de nuevo.'
// Solo se muestran los mensajes de negocio de la Function; un fallo de red o interno usa el generico.
const failure = (e: unknown) => {
  const x = e as { code?: string; message?: string }
  return x.code && !['functions/internal', 'functions/unavailable', 'functions/unknown'].includes(x.code) && x.message ? x.message : FALLBACK
}

const shown = computed(() => filterOrders(orders.value, filters.value))
const open = computed(() => orders.value.find((o) => o.id === openId.value) ?? null)
const eventName = (id: string) => events.value.find((e) => e.id === id)?.name ?? id
const dateText = (d: Date | null) => (d ? d.toLocaleString('es') : '—')

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [res, evs] = await Promise.all([listOrders(), listEvents()])
    orders.value = res.orders
    capped.value = res.capped
    events.value = evs
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function show(o: OrderRow) {
  openId.value = o.id
  actionError.value = ''
  await Promise.all(o.lines.map(async (l) => {
    const k = `${l.eventId}/${l.photoId}`
    if (k in thumbs.value) return
    thumbs.value[k] = undefined
    try { thumbs.value[k] = (await getPhoto(l.eventId, l.photoId))?.thumbPath } catch { /* sin miniatura */ }
  }))
}

async function advance(o: OrderRow) {
  if (busy.value) return // doble clic: la Function ademas rechaza el salto
  busy.value = true
  actionError.value = ''
  try {
    o.status = await advanceOrder(o.id, o.status)
  } catch (e) {
    actionError.value = failure(e)
    await load()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="head">
      <h1 class="display-md">Pedidos</h1>
      <Button icon="impresion" to="/admin/impresion">Lista de impresión</Button>
    </div>
    <p v-if="loading" class="note">Cargando…</p>
    <Alert v-else-if="loadError" tone="danger">
      No se pudieron cargar los pedidos.
      <template #action><Button type="button" @click="load">Reintentar</Button></template>
    </Alert>
    <template v-else>
      <div class="filters">
        <Field label="Evento">
          <template #default="{ id, inputClass }">
            <select :id="id" v-model="filters.eventId" :class="inputClass" aria-label="Evento">
              <option value="">Todos</option>
              <option v-for="e in events" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </template>
        </Field>
        <Field label="Estado">
          <template #default="{ id, inputClass }">
            <select :id="id" v-model="filters.status" :class="inputClass" aria-label="Estado">
              <option value="">Todos</option>
              <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
            </select>
          </template>
        </Field>
        <Field label="Entrega">
          <template #default="{ id, inputClass }">
            <select :id="id" v-model="filters.method" :class="inputClass" aria-label="Entrega">
              <option value="">Todas</option>
              <option value="retiro">Retiro en persona</option>
              <option value="envio">Envío a domicilio</option>
            </select>
          </template>
        </Field>
      </div>
      <p v-if="capped" role="status" class="mono-sm note">Mostrando los últimos 200 pedidos.</p>
      <p v-if="!shown.length" class="note">No hay pedidos.</p>
      <div v-else class="split">
        <div class="es-table-wrap table">
          <table class="es-table">
            <thead><tr><th scope="col">Número</th><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Total</th><th scope="col">Entrega</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              <tr v-for="o in shown" :key="o.id" :class="{ sel: o.id === openId }">
                <td class="mono-md num">{{ o.number }}</td>
                <td class="body-sm muted nowrap">{{ dateText(o.createdAt) }}</td>
                <td class="client">{{ o.buyer.name }}</td>
                <td class="mono-md money">{{ formatMoney(o.total) }}</td>
                <td class="body-sm muted">{{ o.delivery.method === 'envio' ? 'Envío' : 'Retiro' }}</td>
                <td><Badge :status="o.status" /></td>
                <td class="act"><Button type="button" @click="show(o)">Ver detalle</Button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="open" class="detail" aria-label="Detalle del pedido">
          <div class="detail-head">
            <OrderNumber size="sm" caption="Pedido">{{ open.number }}</OrderNumber>
            <Badge :status="open.status" />
          </div>
          <ul class="lines">
            <li v-for="(l, i) in open.lines" :key="i">
              <div class="thumb"><PhotoThumb :path="thumbs[`${l.eventId}/${l.photoId}`]" /></div>
              <span class="line-txt">
                <span class="line-name">{{ l.productName }} × {{ l.quantity }}</span>
                <small class="caption muted">{{ eventName(l.eventId) }}</small>
              </span>
            </li>
          </ul>
          <dl>
            <div><dt class="table-head">Contacto</dt><dd>{{ open.buyer.name }}<br><span class="muted">{{ open.buyer.email }}<template v-if="open.buyer.phone"> · {{ open.buyer.phone }}</template></span></dd></div>
            <div v-if="open.delivery.method === 'envio'"><dt class="table-head">Dirección</dt><dd>{{ open.delivery.address }}</dd></div>
            <div><dt class="table-head">Entrega</dt><dd>{{ open.delivery.method === 'envio' ? 'Envío a domicilio' : 'Retiro en persona' }}</dd></div>
            <div><dt class="table-head">Total</dt><dd class="mono-md">{{ formatMoney(open.total) }}</dd></div>
          </dl>
          <div v-if="nextStatus(open) || actionError" class="foot">
            <Button v-if="nextStatus(open)" type="button" variant="primary" size="lg" :disabled="busy" @click="advance(open)">Marcar como {{ STATUS_LABEL[nextStatus(open)!] }}</Button>
            <Alert v-if="actionError" tone="danger">{{ actionError }}</Alert>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-6); }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.note, .muted { color: var(--ink-muted); }
.note { margin: 0; }
.filters { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.filters > * { flex: 1 1 200px; max-width: 280px; min-width: 0; }
.split { display: flex; flex-wrap: wrap; gap: var(--space-5); align-items: flex-start; }
.table { flex: 999 1 560px; min-width: 0; }
.num { letter-spacing: 0.06em; font-size: 14px; }
.client { font-weight: 500; }
.money { font-size: 14px; }
.nowrap { white-space: nowrap; }
.act { text-align: right; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.detail { flex: 1 1 320px; max-width: 400px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-6); box-sizing: border-box; border-radius: var(--radius-lg); background: var(--surface-raised); border: 1px solid var(--line); box-shadow: var(--shadow-panel); }
.detail-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.lines li { display: flex; align-items: center; gap: var(--space-3); }
.thumb { flex: 0 0 64px; width: 64px; height: 48px; overflow: hidden; border-radius: 4px; background: var(--surface-sunken); }
.thumb :deep(img), .thumb :deep(.ph) { height: 100%; aspect-ratio: auto; }
.line-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.line-name { font-weight: 500; }
dl { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); font-size: 14px; }
dl > div { display: flex; flex-direction: column; gap: 2px; }
dt { text-transform: uppercase; color: var(--ink-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.foot { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
@media (max-width: 720px) { .detail { max-width: none; flex-basis: 100%; padding: var(--space-5); } }
</style>
