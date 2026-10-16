<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getSettings, saveSettings } from '../settingsApi'
import { DEFAULT_WHATSAPP_PHONE, phoneToStore, validateWhatsappPhone } from '../whatsappLogic'
import { OFFLINE_NOTICE, saveErrorMessage, settingsToForm, validateSettingsForm, withOfflineNotice, type SettingsErrors } from '../productsLogic'
import { Alert, Button, Card, Field } from '../ui'

const form = ref({ shippingCost: '', pickupInfo: '', whatsappPhone: '' })
const errors = ref<SettingsErrors & { whatsappPhone?: string }>({})
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
  const phoneError = validateWhatsappPhone(form.value.whatsappPhone)
  if (phoneError) errors.value.whatsappPhone = phoneError
  if (Object.keys(errors.value).length) return
  saving.value = true
  saveError.value = null
  try {
    await withOfflineNotice(saveSettings({ ...form.value, whatsappPhone: phoneToStore(form.value.whatsappPhone) }), () => { offline.value = OFFLINE_NOTICE })
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
  <div class="page">
    <div class="title">
      <h1 class="display-md">Configuración</h1>
      <p class="body-sm">Lo que el comprador ve al elegir la entrega.</p>
    </div>
    <p v-if="loading" class="note">Cargando…</p>
    <Alert v-else-if="loadError" tone="danger">{{ loadError }}</Alert>
    <Card v-else as="form" class="form" novalidate aria-label="Configuración de la tienda" @submit.prevent="submit">
      <Field class="narrow" label="Costo de envío" prefix="USD" mono hint="Se suma al total cuando el comprador elige envío a domicilio." :error="errors.shippingCost">
        <template #default="{ id, describedby, invalid, inputClass }">
          <input :id="id" v-model="form.shippingCost" :class="inputClass" :disabled="saving" inputmode="decimal" placeholder="4.50" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
        </template>
      </Field>
      <Field label="Instrucciones de retiro" hint="Aparece en la pantalla de pago y en la confirmación.">
        <template #default="{ id, describedby, inputClass }">
          <textarea :id="id" v-model="form.pickupInfo" :class="inputClass" :disabled="saving" rows="4" placeholder="Dónde, cuándo y cómo retirar las copias impresas" :aria-describedby="describedby" />
        </template>
      </Field>
      <Field label="WhatsApp para pedidos" mono :hint="`Número al que escriben los compradores. Si lo dejas vacío se usa ${DEFAULT_WHATSAPP_PHONE}.`" :error="errors.whatsappPhone">
        <template #default="{ id, describedby, invalid, inputClass }">
          <input :id="id" v-model="form.whatsappPhone" :class="inputClass" :disabled="saving" type="tel" inputmode="tel" :placeholder="DEFAULT_WHATSAPP_PHONE" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
        </template>
      </Field>
      <Alert v-if="saveError" tone="danger">{{ saveError }}</Alert>
      <Alert v-if="offline">{{ offline }}</Alert>
      <div class="foot">
        <Button type="submit" variant="primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</Button>
        <Alert v-if="saved" tone="success">Guardado.</Alert>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
.title { display: flex; flex-direction: column; gap: var(--space-2); }
h1 { margin: 0; color: var(--ink); }
.title p, .note { margin: 0; color: var(--ink-muted); }
.form { max-width: 560px; }
.narrow { max-width: 240px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); padding-top: var(--space-2); border-top: 1px solid var(--line); }
</style>
