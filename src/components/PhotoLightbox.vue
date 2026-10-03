<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { publicUrl } from '../photosApi'
import { swipeDirection } from '../galleryLogic'
import type { Photo } from '../types'

/** Vista ampliada: SOLO previewPath (con marca de agua). Nunca originalPath. */
const props = defineProps<{ photo: Photo | null; loading: boolean; hasPrev: boolean; hasNext: boolean }>()
const emit = defineEmits<{ prev: []; next: []; close: [] }>()
const url = ref<string | null>(null)
const failed = ref(false)

watchEffect(async () => {
  url.value = null; failed.value = false
  const path = props.photo?.previewPath
  if (!path) return
  try { url.value = await publicUrl(path) } catch { failed.value = true }
})

const root = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)
let opener: HTMLElement | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Tab' && root.value) { // el foco no sale del dialogo
    const f = Array.from(root.value.querySelectorAll<HTMLElement>('button'))
    if (!f.length) return
    const first = f[0], last = f[f.length - 1], at = document.activeElement
    if (!root.value.contains(at)) { e.preventDefault(); first.focus() }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    return
  }
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft' && props.hasPrev) emit('prev')
  else if (e.key === 'ArrowRight' && props.hasNext) emit('next')
}
let sx = 0, sy = 0
let multi = false
const start = (e: TouchEvent) => { multi = e.touches.length > 1; sx = e.touches[0].clientX; sy = e.touches[0].clientY }
function end(e: TouchEvent) {
  if (multi || e.touches.length) return // gestos multitactiles (zoom) no cambian de foto
  const d = swipeDirection(e.changedTouches[0].clientX - sx, e.changedTouches[0].clientY - sy)
  if (d === 'next' && props.hasNext) emit('next')
  else if (d === 'prev' && props.hasPrev) emit('prev')
}
onMounted(() => {
  opener = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'
  closeBtn.value?.focus()
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; opener?.focus?.() })
</script>

<template>
  <div ref="root" class="lb" role="dialog" aria-modal="true" aria-label="Foto ampliada" @touchstart.passive="start" @touchend.passive="end">
    <button ref="closeBtn" class="close" aria-label="Cerrar" @click="emit('close')">&times;</button>
    <button v-if="hasPrev" class="nav l" aria-label="Foto anterior" @click="emit('prev')">&lsaquo;</button>
    <button v-if="hasNext" class="nav r" aria-label="Foto siguiente" @click="emit('next')">&rsaquo;</button>
    <img v-if="url" :src="url" :width="photo?.width" :height="photo?.height" alt="Foto del evento" />
    <p v-else-if="loading || (photo && !failed)">Cargando…</p>
    <p v-else>Foto no disponible</p>
  </div>
</template>

<style scoped>
.lb { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.92); color: #fff; display: flex; align-items: center; justify-content: center; z-index: 10; touch-action: pan-y; }
img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
button { position: absolute; background: rgba(255, 255, 255, 0.15); color: #fff; border: 0; font-size: 2rem; line-height: 1; width: 3rem; height: 3rem; border-radius: 50%; cursor: pointer; z-index: 1; }
.close { top: 0.5rem; right: 0.5rem; }
.nav { top: 50%; transform: translateY(-50%); }
.l { left: 0.25rem; } .r { right: 0.25rem; }
</style>
