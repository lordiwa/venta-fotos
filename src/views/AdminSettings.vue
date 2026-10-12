<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getSettings, saveSettings } from '../settingsApi'
import { OFFLINE_NOTICE, saveErrorMessage, settingsToForm, validateSettingsForm, withOfflineNotice, type SettingsErrors } from '../productsLogic'

const form = ref({ shippingCost: '', pickupInfo: '' })
const errors = ref<SettingsErrors>({})
const loading = ref(true)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)
const offline = ref<string | null>(null)

onMounted(async () => {
  try {
    const s = await getSettings()
    form.value = settingsToForm(s)
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
    await withOfflineNotice(saveSettings(form.value), () => { offline.value = OFFLINE_NOTICE })
    saved.value = true
  } catch (e) {
    // CU10: el formulario conserva lo escrito.
    saveError.value = saveErrorMessage(e)
  } finally {
    saving.value = false
    offline.value = null
  }
}
</script>

<template>
  <h1>Configuración</h1>
  <p v-if="loading">Cargando…</p>
  <p v-else-if="loadError" class="error" role="alert">{{ loadError }}</p>
  <form v-else novalidate @submit.prevent="submit">
    <label>Costo de envío <input :disabled="saving" v-model="form.shippingCost" inputmode="decimal" placeholder="4.50" /></label>
    <p v-if="errors.shippingCost" class="error" role="alert">{{ errors.shippingCost }}</p>
    <label>Instrucciones de retiro <textarea :disabled="saving" v-model="form.pickupInfo" rows="3" /></label>
    <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
    <p v-if="offline" role="status">{{ offline }}</p>
    <p v-if="saved" role="status">Guardado.</p>
    <button type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
  </form>
</template>

<style scoped>
form { display: grid; gap: 0.5rem; max-width: 26rem; }
.error { color: #b42318; margin: 0; }
</style>
