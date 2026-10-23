<script setup lang="ts">
import { ref } from 'vue'
import DownloadList from '../components/DownloadList.vue'
import { getDownloadLinks } from '../downloadsApi'
import { downloadErrorMessage, downloadNotice } from '../serverErrors'
import { normalizeNumber, type DownloadResult } from '../downloadsLogic'
import { Alert, Button, Card, Eyebrow, Field } from '../ui'
import { useI18n } from '../i18n'

const { t, locale } = useI18n()

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
    error.value = downloadErrorMessage(e, locale.value)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="narrow">
    <div class="intro">
      <Eyebrow>{{ t.downloads.eyebrow }}</Eyebrow>
      <h1 class="display-lg">{{ t.downloads.title }}</h1>
      <p class="body">{{ t.downloads.intro }}</p>
    </div>
    <Card as="form" :aria-label="t.downloads.formAria" novalidate @submit.prevent="submit">
      <Field v-model="number" :label="t.downloads.number" mono placeholder="TYYXUQRC" autocomplete="off" />
      <Field v-model="email" :label="t.downloads.email" type="email" autocomplete="email" />
      <Button type="submit" variant="accent" size="lg" :disabled="busy">{{ t.downloads.submit }}</Button>
    </Card>
    <Alert v-if="error" tone="danger">{{ error }}</Alert>
    <Card v-if="result" :title="t.downloads.orderTitle(resultNumber)" :aria-label="t.downloads.filesAria">
      <Alert v-if="result.message">{{ downloadNotice(result.message, locale) }}</Alert>
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
