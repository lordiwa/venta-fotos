<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createEvent, getEvent, updateEvent } from '../eventsApi'
import { Alert, Button, Card, Field, Icon } from '../ui'
import { formatDateInput, validateEventForm, type EventErrors } from '../eventsLogic'

const route = useRoute()
const router = useRouter()
const id = computed(() => (route.params.id as string | undefined) ?? null)
const form = reactive({ name: '', date: '', place: '', description: '' })
const errors = ref<EventErrors>({})
const error = ref<string | null>(null)
const loading = ref(false)
const missing = ref(false)

onMounted(async () => {
  if (!id.value) return
  try {
    const e = await getEvent(id.value)
    if (!e) {
      missing.value = true
      return
    }
    Object.assign(form, { name: e.name, date: formatDateInput(e.date.toDate()), place: e.place ?? '', description: e.description ?? '' })
  } catch {
    error.value = 'No se pudo cargar el evento.'
  }
})

async function submit() {
  if (loading.value) return
  error.value = null
  errors.value = validateEventForm(form)
  if (Object.keys(errors.value).length) return
  loading.value = true
  try {
    if (id.value) {
      await updateEvent(id.value, form)
      await router.push(`/admin/eventos/${id.value}`)
    } else {
      await router.push(`/admin/eventos/${await createEvent(form)}`)
    }
  } catch {
    error.value = 'No se pudo guardar el evento. Inténtalo de nuevo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <RouterLink class="back" :to="id ? `/admin/eventos/${id}` : '/admin/eventos'"><Icon name="flecha-izquierda" :size="16" />{{ id ? 'Evento' : 'Eventos' }}</RouterLink>
    <h1 class="display-md">{{ id ? 'Editar evento' : 'Nuevo evento' }}</h1>
    <p v-if="missing" class="note">Evento no encontrado. <RouterLink to="/admin/eventos">Volver</RouterLink></p>
    <Card v-else as="form" class="form" novalidate @submit.prevent="submit">
      <Field v-model="form.name" label="Nombre *" :error="errors.name" />
      <Field v-model="form.date" label="Fecha *" type="date" :error="errors.date" />
      <Field v-model="form.place" label="Lugar" />
      <Field v-model="form.description" label="Descripción" as="textarea" :rows="4" />
      <Alert v-if="error" tone="danger">{{ error }}</Alert>
      <div class="row">
        <Button type="submit" variant="primary" :disabled="loading">{{ loading ? 'Guardando…' : 'Guardar' }}</Button>
        <Button variant="ghost" :to="id ? `/admin/eventos/${id}` : '/admin/eventos'">Cancelar</Button>
      </div>
      <small v-if="!id" class="hint">El evento se crea como borrador; podrás publicarlo después.</small>
    </Card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-5); }
h1 { margin: 0; color: var(--ink); }
.back { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start; min-height: 44px; text-decoration: none; color: var(--ink-muted); font-size: 14px; font-weight: 500; }
.note { margin: 0; color: var(--ink-muted); }
.form { max-width: 560px; }
.row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
.hint { font-size: 13px; color: var(--ink-muted); }
</style>
