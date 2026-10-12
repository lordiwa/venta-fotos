<script setup lang="ts">
import { ref } from 'vue'
import DownloadList from '../components/DownloadList.vue'
import { downloadErrorMessage, getDownloadLinks } from '../downloadsApi'
import { normalizeNumber, type DownloadResult } from '../downloadsLogic'

const number = ref('')
const email = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<DownloadResult | null>(null)

/** CU4/CU5: pide enlaces nuevos con numero + correo; un solo mensaje si algo no coincide. */
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await getDownloadLinks(normalizeNumber(number.value), email.value.trim())
  } catch (e) {
    error.value = downloadErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1>Mis descargas</h1>
  <p>Escribe el número de tu pedido y el correo con el que compraste para generar enlaces nuevos a tus archivos digitales.</p>
  <form novalidate @submit.prevent="submit">
    <label>Número de pedido <input v-model="number" autocomplete="off" /></label>
    <label>Correo <input v-model="email" type="email" autocomplete="email" /></label>
    <button type="submit" :disabled="busy">Generar enlaces</button>
  </form>
  <p v-if="error" role="alert" class="warn">{{ error }}</p>
  <template v-if="result">
    <p v-if="result.message">{{ result.message }}</p>
    <DownloadList :files="result.files" :busy="busy" @refresh="submit" />
  </template>
</template>

<style scoped>
form { display: grid; gap: 0.5rem; max-width: 24rem; }
label { display: flex; flex-direction: column; gap: 0.2rem; }
.warn { color: #b42318; }
</style>
