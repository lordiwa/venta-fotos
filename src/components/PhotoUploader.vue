<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { newPhotoId, uploadOriginal } from '../photosApi'
import { requeueFailed, runQueue, validateFile, type UploadItem } from '../uploadLogic'

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

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) add(input.files)
  input.value = ''
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
  <section>
    <label
      class="drop"
      :class="{ over: dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <strong>Arrastra fotos aquí o toca para elegirlas</strong>
      <small>JPEG o PNG, hasta 50 MB cada una</small>
      <input type="file" multiple accept="image/jpeg,image/png" @change="onPick" />
    </label>
    <ul v-if="rejected.length" class="errors" role="alert">
      <li v-for="m in rejected" :key="m">{{ m }}</li>
    </ul>
    <div v-if="items.length" class="queue">
      <div class="bar">
        <span>{{ items.length }} archivo(s)<template v-if="failed"> · {{ failed }} con error</template></span>
        <span>
          <button v-if="failed" :disabled="running" @click="retry">Reintentar fallidas</button>
          <button @click="clearDone">Limpiar subidas</button>
        </span>
      </div>
      <ul>
        <li v-for="it in items" :key="it.key" :class="it.status">
          <span class="name">{{ it.file.name }}</span>
          <progress :value="it.progress" max="1" />
          <span class="state">{{ label[it.status] }}</span>
          <span v-if="it.error" class="err">{{ it.error }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.drop { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 1.5rem 1rem; border: 2px dashed #c9ccd4; border-radius: 10px; text-align: center; cursor: pointer; }
.drop.over { border-color: #1f2430; background: #f5f6f8; }
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.errors { color: #b42318; font-size: 0.9rem; }
.queue ul { list-style: none; padding: 0; margin: 0.5rem 0; display: grid; gap: 0.25rem; }
.queue li { display: grid; grid-template-columns: minmax(0, 1fr) 7rem auto; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err { grid-column: 1 / -1; color: #b42318; }
li.failed .state { color: #b42318; }
li.uploaded .state { color: #11632b; }
.bar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-size: 0.9rem; }
button { padding: 0.4rem 0.8rem; border: 1px solid #1f2430; border-radius: 6px; background: #fff; font: inherit; cursor: pointer; margin-left: 0.4rem; }
</style>
