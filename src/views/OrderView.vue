<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatMoney } from '../productsLogic'
import { CURRENCY, loadSummary } from '../checkoutLogic'

const route = useRoute()
const number = computed(() => String(route.params.number))
// Los pedidos no son publicos: el resumen viene de captureOrder y vive en sessionStorage de esta pestana.
const order = computed(() => loadSummary(number.value))
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
  </template>
  <p v-else>No tenemos el detalle de este pedido en este navegador. Guarda tu número de pedido.</p>
  <RouterLink to="/">Volver al inicio</RouterLink>
</template>
