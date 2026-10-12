<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotoThumb from '../components/PhotoThumb.vue'
import { listEvents } from '../eventsApi'
import { advanceOrder, getPhoto, listOrders } from '../ordersApi'
import { filterOrders, nextStatus, STATUS_LABEL, STATUSES, type OrderFilters, type OrderRow } from '../ordersLogic'
import { formatMoney } from '../productsLogic'
import { errorMessage } from '../checkoutApi'
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

const shown = computed(() => filterOrders(orders.value, filters.value))
const open = computed(() => orders.value.find((o) => o.id === openId.value) ?? null)
const eventName = (id: string) => events.value.find((e) => e.id === id)?.name ?? id
const dateText = (d: Date | null) => (d ? d.toLocaleString('es') : '—')

async function load() {
  loading.value = true
  loadError.value = false
  try {
    ;[orders.value, events.value] = await Promise.all([listOrders(), listEvents()])
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
  for (const l of o.lines) {
    const k = `${l.eventId}/${l.photoId}`
    if (k in thumbs.value) continue
    thumbs.value[k] = undefined
    try { thumbs.value[k] = (await getPhoto(l.eventId, l.photoId))?.thumbPath } catch { /* sin miniatura */ }
  }
}

async function advance(o: OrderRow) {
  if (busy.value) return // doble clic: la Function ademas rechaza el salto
  busy.value = true
  actionError.value = ''
  try {
    o.status = await advanceOrder(o.id, o.status)
  } catch (e) {
    actionError.value = errorMessage(e)
    await load()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1>Pedidos</h1>
  <p><RouterLink to="/admin">Volver</RouterLink> · <RouterLink to="/admin/impresion">Lista de impresión</RouterLink></p>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="loadError" role="alert">No se pudieron cargar los pedidos. <button type="button" @click="load">Reintentar</button></p>
  <template v-else>
    <div class="filters">
      <label>Evento
        <select v-model="filters.eventId" aria-label="Evento">
          <option value="">Todos</option>
          <option v-for="e in events" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </label>
      <label>Estado
        <select v-model="filters.status" aria-label="Estado">
          <option value="">Todos</option>
          <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
        </select>
      </label>
      <label>Entrega
        <select v-model="filters.method" aria-label="Entrega">
          <option value="">Todas</option>
          <option value="retiro">Retiro en persona</option>
          <option value="envio">Envío a domicilio</option>
        </select>
      </label>
    </div>
    <p v-if="!shown.length">No hay pedidos.</p>
    <table v-else>
      <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Entrega</th><th>Estado</th><th /></tr></thead>
      <tbody>
        <tr v-for="o in shown" :key="o.id" :class="{ sel: o.id === openId }">
          <td>{{ o.number }}</td>
          <td>{{ dateText(o.createdAt) }}</td>
          <td>{{ o.buyer.name }}</td>
          <td>{{ formatMoney(o.total) }}</td>
          <td>{{ o.delivery.method === 'envio' ? 'Envío' : 'Retiro' }}</td>
          <td>{{ STATUS_LABEL[o.status] }}</td>
          <td><button type="button" @click="show(o)">Ver detalle</button></td>
        </tr>
      </tbody>
    </table>

    <section v-if="open" class="detail" aria-label="Detalle del pedido">
      <h2>Pedido {{ open.number }}</h2>
      <ul class="lines">
        <li v-for="(l, i) in open.lines" :key="i">
          <div class="thumb"><PhotoThumb :path="thumbs[`${l.eventId}/${l.photoId}`]" /></div>
          <span>{{ l.productName }} × {{ l.quantity }} <small>({{ eventName(l.eventId) }})</small></span>
        </li>
      </ul>
      <p><strong>Contacto:</strong> {{ open.buyer.name }} · {{ open.buyer.email }} · {{ open.buyer.phone }}</p>
      <p v-if="open.delivery.method === 'envio'"><strong>Dirección:</strong> {{ open.delivery.address }}</p>
      <p><strong>Estado:</strong> {{ STATUS_LABEL[open.status] }}</p>
      <button v-if="nextStatus(open)" type="button" :disabled="busy" @click="advance(open)">Marcar como {{ STATUS_LABEL[nextStatus(open)!] }}</button>
      <p v-if="actionError" role="alert" class="warn">{{ actionError }}</p>
    </section>
  </template>
</template>

<style scoped>
.filters { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.3rem 0.6rem; border-bottom: 1px solid #e3e5ea; }
tr.sel { background: #f4f5f8; }
.detail { margin-top: 1.5rem; border: 1px solid #e3e5ea; border-radius: 8px; padding: 1rem; }
.lines { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.lines li { display: flex; gap: 1rem; align-items: center; }
.thumb { width: 4rem; }
.warn { color: #b42318; }
</style>
