<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createPrint, listProducts, saveDigital, setProductActive, updateProduct } from '../productsApi'
import { formatMoney, PERMISSION_MESSAGE, saveErrorMessage, validateProductForm, type ProductErrors } from '../productsLogic'
import type { Product } from '../types'

const products = ref<Product[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const prints = computed(() => products.value.filter((p) => p.kind === 'print'))
const digital = computed(() => products.value.find((p) => p.kind === 'digital') ?? null)
const isActive = (p: Product) => p.active === true

async function load() {
  try {
    products.value = await listProducts()
    loadError.value = null
  } catch {
    loadError.value = 'No se pudieron cargar los productos.' // se conserva la lista anterior
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Formulario de copias (alta o edicion). Ante error de red los datos NO se borran (CU10).
const editingId = ref<string | null>(null)
const form = ref({ name: '', price: '' })
const errors = ref<ProductErrors>({})
const saveError = ref<string | null>(null)
const saving = ref(false)

function startEdit(p: Product) {
  editingId.value = p.id
  form.value = { name: p.name, price: formatMoney(p.price) }
  errors.value = {}
  saveError.value = null
}
function cancel() {
  editingId.value = null
  form.value = { name: '', price: '' }
  errors.value = {}
  saveError.value = null
}
async function submit() {
  errors.value = validateProductForm(form.value)
  if (Object.keys(errors.value).length) return
  saving.value = true
  saveError.value = null
  try {
    if (editingId.value) await updateProduct(editingId.value, form.value)
    else await createPrint(form.value)
    cancel()
    await load()
  } catch (e) {
    saveError.value = saveErrorMessage(e)
  } finally {
    saving.value = false
  }
}

// Archivo digital
const digitalPrice = ref('')
const digitalError = ref<string | null>(null)
const digitalSaveError = ref<string | null>(null)
const digitalSaving = ref(false)
async function submitDigital() {
  digitalError.value = validateProductForm({ name: '', price: digitalPrice.value }, { requireName: false }).price ?? null
  if (digitalError.value) return
  digitalSaving.value = true
  digitalSaveError.value = null
  try {
    await saveDigital({ name: '', price: digitalPrice.value })
    digitalPrice.value = ''
    await load()
  } catch (e) {
    digitalSaveError.value = saveErrorMessage(e)
  } finally {
    digitalSaving.value = false
  }
}

const toggleError = ref<string | null>(null)
async function toggle(p: Product) {
  toggleError.value = null
  try {
    await setProductActive(p.id, !isActive(p))
    await load()
  } catch (e) {
    const m = saveErrorMessage(e)
    toggleError.value = m === PERMISSION_MESSAGE ? m : 'No se pudo cambiar el estado. Inténtalo de nuevo.'
  }
}
</script>

<template>
  <h1>Productos</h1>
  <p v-if="loading">Cargando…</p>
  <template v-else>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <p v-if="toggleError" class="error" role="alert">{{ toggleError }}</p>

    <h2>Copias impresas</h2>
    <p v-if="!prints.length">Aún no hay tamaños. Agrega el primero.</p>
    <ul v-else class="list">
      <li v-for="p in prints" :key="p.id">
        <span><strong>{{ p.name }}</strong> · {{ formatMoney(p.price) }}</span>
        <span class="meta">
          <span class="badge" :class="{ on: isActive(p) }">{{ isActive(p) ? 'Activo' : 'Inactivo' }}</span>
          <button type="button" @click="startEdit(p)">Editar</button>
          <button type="button" @click="toggle(p)">{{ isActive(p) ? 'Desactivar' : 'Activar' }}</button>
        </span>
      </li>
    </ul>

    <form novalidate @submit.prevent="submit">
      <h3>{{ editingId ? 'Editar tamaño' : 'Nuevo tamaño' }}</h3>
      <label>Nombre <input v-model="form.name" placeholder="10x15" /></label>
      <p v-if="errors.name" class="error" role="alert">{{ errors.name }}</p>
      <label>Precio <input v-model="form.price" inputmode="decimal" placeholder="5.00" /></label>
      <p v-if="errors.price" class="error" role="alert">{{ errors.price }}</p>
      <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
      <button type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      <button v-if="editingId" type="button" @click="cancel">Cancelar</button>
    </form>

    <h2>Archivo digital</h2>
    <p v-if="digital">
      <strong>{{ digital.name }}</strong> · {{ formatMoney(digital.price) }}
      <span class="badge" :class="{ on: isActive(digital) }">{{ isActive(digital) ? 'Activo' : 'Inactivo' }}</span>
      <button type="button" @click="toggle(digital)">{{ isActive(digital) ? 'Desactivar' : 'Activar' }}</button>
    </p>
    <form novalidate @submit.prevent="submitDigital">
      <label>{{ digital ? 'Nuevo precio' : 'Precio' }} <input v-model="digitalPrice" inputmode="decimal" placeholder="3.00" /></label>
      <p v-if="digitalError" class="error" role="alert">{{ digitalError }}</p>
      <p v-if="digitalSaveError" class="error" role="alert">{{ digitalSaveError }}</p>
      <button type="submit" :disabled="digitalSaving">{{ digitalSaving ? 'Guardando…' : 'Guardar' }}</button>
    </form>
  </template>
</template>

<style scoped>
.list { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; border: 1px solid #e3e5ea; border-radius: 8px; padding: 0.6rem 1rem; }
.meta { display: flex; gap: 0.5rem; align-items: center; }
.badge { padding: 0.15rem 0.6rem; border-radius: 99px; background: #eef0f4; font-size: 0.8rem; }
.badge.on { background: #d9f2e1; color: #11632b; }
form { display: grid; gap: 0.5rem; max-width: 22rem; margin: 1rem 0; }
.error { color: #b42318; margin: 0; }
</style>
