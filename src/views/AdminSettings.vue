<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getSettings, saveSettings } from '../settingsApi'
import { formatMoney, validateSettingsForm, type SettingsErrors } from '../productsLogic'

const form = ref({ shippingCost: '', pickupInfo: '' })
const errors = ref<SettingsErrors>({})
const loading = ref(true)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)

onMounted(async () => {
  try {
    const s = await getSettings()
    if (s) form.value = { shippingCost: formatMoney(s.shippingCost), pickupInfo: s.pickupInfo }
  } catch {
    loadError.value = 'No se pudo cargar la configuración.'
  } finally {
    loading.value = false
  }
})

async function submit() {
  saved.value = false
  errors.value = validateSettingsForm(form.value)
  if (Object.keys(errors.value).length) return
  saving.value = true
  saveError.value = null
  try {
    await saveSettings(form.value)
    saved.value = true
  } catch {
    // CU10: el formulario conserva lo escrito.
    saveError.value = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo; tus datos siguen en el formulario.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <h1>Configuración</h1>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="loadError" class="error" role="alert">{{ loadError }}</p>
  <form v-else novalidate @submit.prevent="submit">
    <label>Costo de envío <input v-model="form.shippingCost" inputmode="decimal" placeholder="4.50" /></label>
    <p v-if="errors.shippingCost" class="error" role="alert">{{ errors.shippingCost }}</p>
    <label>Instrucciones de retiro <textarea v-model="form.pickupInfo" rows="3" /></label>
    <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
    <p v-if="saved" role="status">Guardado.</p>
    <button type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
  </form>
</template>

<style scoped>
form { display: grid; gap: 0.5rem; max-width: 26rem; }
.error { color: #b42318; margin: 0; }
</style>
