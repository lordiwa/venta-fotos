<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { newPhotoId, uploadOriginal } from '../photosApi'
import { requeueFailed, runQueue, validateFile, type UploadItem } from '../uploadLogic'
import { Button, Dropzone } from '../ui'

const props = defineProps<{ eventId: string }>()
type Item = UploadItem & { file: File }
const items = reactive<Item[]>([])
const rejected = ref<string[]>([])
const dragging = ref(false)
const running = ref(false)
let seq = 0

const failed = computed(() => items.filter((i) => i.status === 'failed').length)
const label: Record<Item['status'], string> = {
  queued: 'En cola', uploading: 'Subiendo…', uploaded: 'Subida (procesando en el servidor)', failed: 'Falló', rejected: '',
}

async function start() {
  if (running.value) return
  running.value = true
  try {
    await runQueue(items, (it, onProgress) => uploadOriginal(props.eventId, it as Item, onProgress))
  } finally {
    running.value = false
  }
}

function add(files: FileList | File[]) {
  const msgs: string[] = []
  for (const file of Array.from(files)) {
    const problem = validateFile(file)
    if (problem) msgs.push(problem)
    else items.push({ key: seq++, file, photoId: newPhotoId(props.eventId), status: 'queued', progress: 0 })
  }
  rejected.value = msgs // los rechazados no frenan al resto
  void start()
}

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files) add(e.dataTransfer.files)
}
function retry() {
  requeueFailed(items)
  void start()
}
function clearDone() {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].status === 'uploaded') items.splice(i, 1)
}
</script>

<template>
  <section class="uploader">
    <div
      class="drop"
      :class="{ over: dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <Dropzone @files="add" />
    </div>
    <ul v-if="rejected.length" class="errors" role="alert">
      <li v-for="m in rejected" :key="m">{{ m }}</li>
    </ul>
    <div v-if="items.length" class="queue">
      <div class="bar">
        <span class="sum">{{ items.length }} archivo(s)<template v-if="failed"> · <span class="bad">{{ failed }} con error</span></template></span>
        <span class="btns">
          <Button v-if="failed" :disabled="running" @click="retry">Reintentar fallidas</Button>
          <Button @click="clearDone">Limpiar subidas</Button>
        </span>
      </div>
      <ul>
        <li v-for="it in items" :key="it.key" :class="it.status">
          <span class="name mono-md">{{ it.file.name }}</span>
          <progress :value="it.progress" max="1" />
          <span class="state mono-sm">{{ label[it.status] }}</span>
          <span v-if="it.error" class="err caption">{{ it.error }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.uploader { display: flex; flex-direction: column; gap: var(--space-4); }
.drop.over :deep(.es-dropzone) { border-color: var(--amber); background: var(--surface-selected); }
.errors { margin: 0; padding: 12px 14px 12px 30px; border-radius: var(--radius-md); background: var(--danger-soft); color: var(--danger); font-size: 14px; }
.queue { display: flex; flex-direction: column; gap: var(--space-3); }
.queue ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.queue li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: 14px; }
.name { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
progress { flex: 2 1 200px; min-width: 0; height: 6px; accent-color: var(--amber); }
.state { color: var(--ink-muted); }
.err { flex: 1 0 100%; color: var(--danger); }
li.failed .state, .bad { color: var(--danger); }
li.uploaded .state { color: var(--success); }
.bar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); align-items: center; font-size: 14px; }
.sum { color: var(--ink-muted); }
.btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
