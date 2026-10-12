<script setup lang="ts">
import { ref } from 'vue'
import DownloadList from '../components/DownloadList.vue'
import { downloadErrorMessage, getDownloadLinks } from '../downloadsApi'
import { normalizeNumber, type DownloadResult } from '../downloadsLogic'
import { Alert, Button, Card, Eyebrow, Field } from '../ui'

const number = ref('')
const email = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<DownloadResult | null>(null)
const resultNumber = ref('')

/** CU4/CU5: pide enlaces nuevos con numero + correo; un solo mensaje si algo no coincide. */
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  result.value = null
  try {
    const n = normalizeNumber(number.value)
    result.value = await getDownloadLinks(n, email.value.trim())
    resultNumber.value = n
  } catch (e) {
    error.value = downloadErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="narrow">
    <div class="intro">
      <Eyebrow>Archivos digitales</Eyebrow>
      <h1 class="display-lg">Mis descargas</h1>
      <p class="body">Escribe el número de tu pedido y el correo con el que compraste para generar enlaces nuevos a tus archivos digitales.</p>
    </div>
    <Card as="form" aria-label="Buscar pedido" novalidate @submit.prevent="submit">
      <Field v-model="number" label="Número de pedido" mono placeholder="TYYXUQRC" autocomplete="off" />
      <Field v-model="email" label="Correo" type="email" autocomplete="email" />
      <Button type="submit" variant="accent" size="lg" :disabled="busy">Generar enlaces</Button>
    </Card>
    <Alert v-if="error" tone="danger">{{ error }}</Alert>
    <Card v-if="result" :title="`Pedido ${resultNumber}`" aria-label="Tus archivos">
      <Alert v-if="result.message">{{ result.message }}</Alert>
      <DownloadList :files="result.files" :busy="busy" @refresh="submit" />
    </Card>
  </div>
</template>

<style scoped>
.narrow { max-width: 640px; margin: 0 auto; padding: var(--space-8) 0 var(--space-12); display: flex; flex-direction: column; gap: var(--space-7); }
.intro { display: flex; flex-direction: column; gap: var(--space-3); }
.intro h1 { margin: 0; }
.intro p { margin: 0; color: var(--ink-muted); text-wrap: pretty; }
</style>
