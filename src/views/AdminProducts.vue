<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createPack, createPrint, deleteProduct, newProductId, listProducts, saveDigital, setProductActive, updatePack, updateProduct } from '../productsApi'
import {
  formatMoney, OFFLINE_NOTICE, PERMISSION_MESSAGE, saveErrorMessage, validatePackForm, validateProductForm, withOfflineNotice, type PackErrors, type ProductErrors,
} from '../productsLogic'
import { Alert, Badge, Button, Card, Field } from '../ui'
import type { Product } from '../types'

const products = ref<Product[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const prints = computed(() => products.value.filter((p) => p.kind === 'print'))
const digital = computed(() => products.value.find((p) => p.kind === 'digital') ?? null)
const packs = computed(() => products.value.filter((p) => p.kind === 'pack').sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0)))
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
const offline = ref<string | null>(null) // aviso de escritura en cola (sin red)
const slow = () => { offline.value = OFFLINE_NOTICE }
let pendingId: string | null = null // id del alta en curso: un reintento no duplica

function startEdit(p: Product) {
  editingId.value = p.id
  form.value = { name: p.name, price: formatMoney(p.price) }
  errors.value = {}
  saveError.value = null
}
function cancel() {
  editingId.value = null
  pendingId = null
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
    if (editingId.value) await withOfflineNotice(updateProduct(editingId.value, form.value), slow)
    else await withOfflineNotice(createPrint(form.value, (pendingId ??= newProductId())), slow)
    cancel()
    await load()
  } catch (e) {
    saveError.value = saveErrorMessage(e)
  } finally {
    saving.value = false
    offline.value = null
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
    await withOfflineNotice(saveDigital({ name: '', price: digitalPrice.value }), slow)
    digitalPrice.value = ''
    await load()
  } catch (e) {
    digitalSaveError.value = saveErrorMessage(e)
  } finally {
    digitalSaving.value = false
    offline.value = null
  }
}

// Paquetes digitales (TASK-029): cantidad + precio; el carrito elige solo la combinacion mas barata por evento.
const packEditingId = ref<string | null>(null)
const packForm = ref({ quantity: '', price: '' })
const packErrors = ref<PackErrors>({})
const packSaveError = ref<string | null>(null)
const packSaving = ref(false)
let pendingPackId: string | null = null
/** Precio por foto de un paquete, para comparar con la foto suelta. */
const perPhoto = (p: Product) => formatMoney(Math.round((p.price / (p.quantity ?? 1)) * 100) / 100)

function startPackEdit(p: Product) {
  packEditingId.value = p.id
  packForm.value = { quantity: String(p.quantity ?? ''), price: formatMoney(p.price) }
  packErrors.value = {}
  packSaveError.value = null
}
function cancelPack() {
  packEditingId.value = null
  pendingPackId = null
  packForm.value = { quantity: '', price: '' }
  packErrors.value = {}
  packSaveError.value = null
}
async function submitPack() {
  const others = packs.value.filter((p) => p.id !== packEditingId.value).map((p) => p.quantity ?? 0)
  packErrors.value = validatePackForm(packForm.value, others)
  if (Object.keys(packErrors.value).length) return
  packSaving.value = true
  packSaveError.value = null
  try {
    if (packEditingId.value) await withOfflineNotice(updatePack(packEditingId.value, packForm.value), slow)
    else await withOfflineNotice(createPack(packForm.value, (pendingPackId ??= newProductId())), slow)
    cancelPack()
    await load()
  } catch (e) {
    packSaveError.value = saveErrorMessage(e)
  } finally {
    packSaving.value = false
    offline.value = null
  }
}
async function removePack(p: Product) {
  if (!window.confirm(`¿Borrar "${p.name}"? Los pedidos ya hechos no cambian.`)) return
  toggleError.value = null
  try {
    await withOfflineNotice(deleteProduct(p.id), slow)
    if (packEditingId.value === p.id) cancelPack()
    await load()
  } catch (e) {
    const m = saveErrorMessage(e)
    toggleError.value = m === PERMISSION_MESSAGE ? m : 'No se pudo borrar el paquete. Inténtalo de nuevo.'
  } finally {
    offline.value = null
  }
}

const toggleError = ref<string | null>(null)
async function toggle(p: Product) {
  toggleError.value = null
  try {
    await withOfflineNotice(setProductActive(p.id, !isActive(p)), slow)
    await load()
  } catch (e) {
    const m = saveErrorMessage(e)
    toggleError.value = m === PERMISSION_MESSAGE ? m : 'No se pudo cambiar el estado. Inténtalo de nuevo.'
  } finally {
    offline.value = null
  }
}
</script>

<template>
  <div class="page">
    <h1 class="display-md">Productos</h1>
    <p v-if="loading" class="note">Cargando…</p>
    <template v-else>
      <Alert v-if="loadError" tone="danger">{{ loadError }}</Alert>
      <Alert v-if="toggleError" tone="danger">{{ toggleError }}</Alert>
      <Alert v-if="offline">{{ offline }}</Alert>

      <div class="cols">
        <Card title="Copias impresas">
          <p v-if="!prints.length" class="note">Aún no hay tamaños. Agrega el primero.</p>
          <ul v-else class="list">
            <li v-for="p in prints" :key="p.id">
              <span class="name"><strong class="display-xs">{{ p.name }}</strong><span class="mono-sm">{{ formatMoney(p.price) }}</span></span>
              <Badge :status="isActive(p) ? 'activo' : 'inactivo'" />
              <span class="btns">
                <Button type="button" @click="startEdit(p)">Editar</Button>
                <Button type="button" @click="toggle(p)">{{ isActive(p) ? 'Desactivar' : 'Activar' }}</Button>
              </span>
            </li>
          </ul>

          <Card as="form" sunken novalidate aria-label="Tamaño de copia" @submit.prevent="submit">
            <h3>{{ editingId ? 'Editar tamaño' : 'Nuevo tamaño' }}</h3>
            <div class="fields">
              <Field label="Nombre" :error="errors.name">
                <template #default="{ id, describedby, invalid, inputClass }">
                  <input :id="id" v-model="form.name" :class="inputClass" :disabled="saving" placeholder="10x15" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
                </template>
              </Field>
              <Field label="Precio" mono :error="errors.price">
                <template #default="{ id, describedby, invalid, inputClass }">
                  <input :id="id" v-model="form.price" :class="inputClass" :disabled="saving" inputmode="decimal" placeholder="5.00" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
                </template>
              </Field>
            </div>
            <Alert v-if="saveError" tone="danger">{{ saveError }}</Alert>
            <div class="btns">
              <Button type="submit" variant="primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</Button>
              <Button v-if="editingId" type="button" @click="cancel">Cancelar</Button>
            </div>
          </Card>
        </Card>

        <Card title="Archivo digital">
          <template v-if="digital" #aside><Badge :status="isActive(digital) ? 'activo' : 'inactivo'" /></template>
          <p class="body-sm note">Descarga en alta resolución sin marca de agua. Un solo precio para todas las fotos.</p>
          <div v-if="digital" class="current">
            <span class="display-md price">{{ formatMoney(digital.price) }}</span>
            <span class="mono-sm note">{{ digital.name }}</span>
          </div>
          <Card as="form" sunken novalidate aria-label="Precio del archivo digital" @submit.prevent="submitDigital">
            <Field :label="digital ? 'Nuevo precio' : 'Precio'" :error="digitalError ?? undefined" mono>
              <template #default="{ id, describedby, invalid, inputClass }">
                <input :id="id" v-model="digitalPrice" :class="inputClass" :disabled="digitalSaving" inputmode="decimal" placeholder="3.00" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
              </template>
            </Field>
            <Alert v-if="digitalSaveError" tone="danger">{{ digitalSaveError }}</Alert>
            <div class="btns">
              <Button type="submit" variant="primary" :disabled="digitalSaving">{{ digitalSaving ? 'Guardando…' : 'Guardar' }}</Button>
              <Button v-if="digital" type="button" @click="toggle(digital)">{{ isActive(digital) ? 'Desactivar' : 'Activar' }}</Button>
            </div>
          </Card>
        </Card>

        <Card title="Paquetes digitales">
          <p class="body-sm note">El carrito aplica solo la combinación más barata de paquetes y fotos sueltas, por evento.</p>
          <p v-if="!packs.length" class="note">Aún no hay paquetes.</p>
          <ul v-else class="list">
            <li v-for="p in packs" :key="p.id">
              <span class="name">
                <strong class="display-xs">{{ p.name }}</strong>
                <span class="mono-sm">{{ formatMoney(p.price) }} · {{ perPhoto(p) }} por foto</span>
              </span>
              <Badge :status="isActive(p) ? 'activo' : 'inactivo'" />
              <span class="btns">
                <Button type="button" @click="startPackEdit(p)">Editar</Button>
                <Button type="button" @click="toggle(p)">{{ isActive(p) ? 'Desactivar' : 'Activar' }}</Button>
                <Button type="button" variant="danger" @click="removePack(p)">Borrar</Button>
              </span>
            </li>
          </ul>
          <Card as="form" sunken novalidate aria-label="Paquete digital" @submit.prevent="submitPack">
            <h3>{{ packEditingId ? 'Editar paquete' : 'Nuevo paquete' }}</h3>
            <div class="fields">
              <Field label="Fotos" mono :error="packErrors.quantity">
                <template #default="{ id, describedby, invalid, inputClass }">
                  <input :id="id" v-model="packForm.quantity" :class="inputClass" :disabled="packSaving" inputmode="numeric" placeholder="5" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
                </template>
              </Field>
              <Field label="Precio" mono :error="packErrors.price">
                <template #default="{ id, describedby, invalid, inputClass }">
                  <input :id="id" v-model="packForm.price" :class="inputClass" :disabled="packSaving" inputmode="decimal" placeholder="12.00" :aria-invalid="invalid || undefined" :aria-describedby="describedby">
                </template>
              </Field>
            </div>
            <Alert v-if="packSaveError" tone="danger">{{ packSaveError }}</Alert>
            <div class="btns">
              <Button type="submit" variant="primary" :disabled="packSaving">{{ packSaving ? 'Guardando…' : 'Guardar' }}</Button>
              <Button v-if="packEditingId" type="button" @click="cancelPack">Cancelar</Button>
            </div>
          </Card>
        </Card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-7); }
h1 { margin: 0; color: var(--ink); }
h3 { margin: 0; font-size: 15px; font-weight: 600; }
.note { margin: 0; color: var(--ink-muted); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: var(--space-5); align-items: start; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.list li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
.name { flex: 1 1 120px; display: flex; flex-direction: column; gap: 2px; }
.name .mono-sm { color: var(--ink-muted); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: var(--space-3); }
.btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.current { display: flex; align-items: baseline; gap: var(--space-2); }
.price { font-size: 34px; }
</style>
