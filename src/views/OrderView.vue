<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DownloadList from '../components/DownloadList.vue'
import { formatMoney } from '../productsLogic'
import { CURRENCY, loadSummary } from '../checkoutLogic'
import { downloadErrorMessage, getDownloadLinks } from '../downloadsApi'
import { hasDigital, type DownloadResult } from '../downloadsLogic'

const route = useRoute()
const number = computed(() => String(route.params.number))
// Los pedidos no son publicos: el resumen viene de captureOrder y vive en sessionStorage de esta pestana.
const order = computed(() => loadSummary(number.value))

// CU1: si el pedido trae archivos digitales, se piden los enlaces con numero + correo del resumen.
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
onMounted(() => { if (wantsLinks.value) void loadLinks() })
</script>

<template>
  <h1>¡Gracias por tu compra!</h1>
  <p>Número de pedido: <strong data-testid="order-number">{{ number }}</strong></p>
  <template v-if="order">
    <ul>
      <li v-for="(l, i) in order.lines" :key="i">{{ l.productName }} × {{ l.quantity }} — {{ formatMoney(l.unitPrice * l.quantity) }}</li>
    </ul>
    <p v-if="order.delivery.method === 'envio'">Envío a domicilio: {{ order.delivery.address }} (+ {{ formatMoney(order.delivery.cost) }})</p>
    <p v-else>Retiro en persona.</p>
    <p><strong>Total:</strong> {{ formatMoney(order.total) }} {{ CURRENCY }}</p>
    <section v-if="wantsLinks" aria-label="Descargas">
      <h2>Tus archivos digitales</h2>
      <p v-if="busy && !links">Preparando tus enlaces…</p>
      <template v-if="links">
        <p v-if="links.message">{{ links.message }}</p>
        <DownloadList :files="links.files" :busy="busy" @refresh="loadLinks" />
      </template>
      <p v-if="linksError" role="alert">{{ linksError }} <button type="button" :disabled="busy" @click="loadLinks">Generar un enlace nuevo</button></p>
    </section>
  </template>
  <p v-else>No tenemos el detalle de este pedido en este navegador. Guarda tu número de pedido.</p>
  <p>¿Necesitas volver a descargar tus archivos? <RouterLink to="/descargas">Ir a Mis descargas</RouterLink></p>
  <RouterLink to="/">Volver al inicio</RouterLink>
</template>
