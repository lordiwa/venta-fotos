<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createEvent, getEvent, updateEvent } from '../eventsApi'
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
  <h1>{{ id ? 'Editar evento' : 'Nuevo evento' }}</h1>
  <p v-if="missing">Evento no encontrado. <RouterLink to="/admin/eventos">Volver</RouterLink></p>
  <form v-else novalidate @submit.prevent="submit">
    <label>
      Nombre *
      <input v-model="form.name" :aria-invalid="!!errors.name" />
      <small v-if="errors.name" class="error">{{ errors.name }}</small>
    </label>
    <label>
      Fecha *
      <input v-model="form.date" type="date" :aria-invalid="!!errors.date" />
      <small v-if="errors.date" class="error">{{ errors.date }}</small>
    </label>
    <label>Lugar <input v-model="form.place" /></label>
    <label>Descripción <textarea v-model="form.description" rows="4" /></label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="row">
      <button type="submit" :disabled="loading">{{ loading ? 'Guardando…' : 'Guardar' }}</button>
      <RouterLink :to="id ? `/admin/eventos/${id}` : '/admin/eventos'">Cancelar</RouterLink>
    </div>
    <small v-if="!id">El evento se crea como borrador; podrás publicarlo después.</small>
  </form>
</template>

<style scoped>
form { max-width: 32rem; display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
input, textarea { padding: 0.6rem; font: inherit; border: 1px solid #c9ccd4; border-radius: 6px; }
input[aria-invalid='true'] { border-color: #b42318; }
.row { display: flex; gap: 1rem; align-items: center; }
button { padding: 0.7rem 1.2rem; border: 0; border-radius: 6px; background: #1f2430; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: 0.6; }
.error { color: #b42318; margin: 0; }
</style>
