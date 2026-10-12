<script setup lang="ts">
import { computed, ref } from 'vue'
import { isExpired, type DownloadFile } from '../downloadsLogic'

const props = defineProps<{ files: DownloadFile[]; busy?: boolean }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()
const now = ref(Date.now())
const expired = computed(() => props.files.some((f) => isExpired(f.expiresAt, now.value)))

/** CU3: si el enlace ya vencio no se abre; se ofrece generar uno nuevo. */
function onClick(ev: Event, f: DownloadFile) {
  now.value = Date.now()
  if (isExpired(f.expiresAt, now.value)) ev.preventDefault()
}
const expiryText = (f: DownloadFile) => new Date(f.expiresAt).toLocaleDateString('es')
</script>

<template>
  <ul class="files">
    <li v-for="f in files" :key="`${f.eventId}/${f.photoId}`">
      <span>{{ f.name }}</span>
      <a v-if="!isExpired(f.expiresAt, now)" :href="f.url" download target="_blank" rel="noopener" @click="onClick($event, f)">Descargar</a>
      <span v-else class="warn">El enlace venció</span>
      <small v-if="!isExpired(f.expiresAt, now)">Disponible hasta el {{ expiryText(f) }}</small>
    </li>
  </ul>
  <button v-if="expired" type="button" :disabled="busy" @click="emit('refresh')">Generar un enlace nuevo</button>
</template>

<style scoped>
.files { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.files li { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.warn { color: #b42318; }
</style>
