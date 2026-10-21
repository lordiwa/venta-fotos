<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { publicUrl } from '../photosApi'
import PurchasePanel from './PurchasePanel.vue'
import { swipeAction } from '../galleryLogic'
import { Icon } from '../ui'
import type { Photo } from '../types'

/** Vista ampliada: SOLO previewPath (con marca de agua). Nunca originalPath. */
const props = defineProps<{ photo: Photo | null; loading: boolean; hasPrev: boolean; hasNext: boolean; caption?: string; tag?: string; eventName?: string }>()
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
    const f = Array.from(root.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, input:not(:disabled)'))
    if (!f.length) return
    const first = f[0], last = f[f.length - 1], at = document.activeElement
    if (!root.value.contains(at)) { e.preventDefault(); first.focus() }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    return
  }
  if (e.key === 'Escape') emit('close')
  else if ((e.target as HTMLElement | null)?.closest?.('input, select')) return // flechas dentro de los campos no cambian de foto
  else if (e.key === 'ArrowLeft' && props.hasPrev) emit('prev')
  else if (e.key === 'ArrowRight' && props.hasNext) emit('next')
}
let sx = 0, sy = 0
let multi = false
const start = (e: TouchEvent) => { multi = e.touches.length > 1; sx = e.touches[0].clientX; sy = e.touches[0].clientY }
function end(e: TouchEvent) {
  if (e.touches.length) return // aun quedan dedos apoyados: el gesto no termino
  const d = swipeAction(e.changedTouches[0].clientX - sx, e.changedTouches[0].clientY - sy, { multi, scale: window.visualViewport?.scale })
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
    <div class="top">
      <span class="mono-sm caption">{{ caption }}</span>
      <button ref="closeBtn" class="round" aria-label="Cerrar" @click="emit('close')"><Icon name="cerrar" :size="18" /></button>
    </div>
    <div class="stage">
      <div class="viewer">
        <button v-if="hasPrev" class="round nav l" aria-label="Foto anterior" @click="emit('prev')"><Icon name="anterior" :size="20" /></button>
        <figure class="photo">
          <img v-if="url" :src="url" :width="photo?.width" :height="photo?.height" alt="Foto del evento" />
          <p v-else-if="loading || (photo && !failed)" class="mono-sm msg">Cargando…</p>
          <p v-else class="mono-sm msg">Foto no disponible</p>
        </figure>
        <button v-if="hasNext" class="round nav r" aria-label="Foto siguiente" @click="emit('next')"><Icon name="siguiente" :size="20" /></button>
      </div>
      <PurchasePanel v-if="photo" :event-id="photo.eventId" :photo-id="photo.id" :label="tag" :event-name="eventName" :photo-name="photo.name" :print-only="photo.printOnly === true" />
    </div>
  </div>
</template>

<style scoped>
.lb { position: fixed; inset: 0; background: var(--overlay); color: var(--on-rail); display: flex; flex-direction: column; z-index: 10; overflow-y: auto; touch-action: manipulation; overscroll-behavior-x: contain; }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-6) 0; }
.caption { color: var(--on-rail-muted); padding-left: var(--space-4); min-width: 0; overflow-wrap: anywhere; }
.stage { flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-6); padding: var(--space-4) var(--space-6) var(--space-8); min-width: 0; }
.viewer { position: relative; flex: 999 1 560px; min-width: 0; display: flex; align-items: center; gap: var(--space-3); }
.photo { flex: 1; min-width: 0; min-height: 200px; margin: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 8px; background: var(--surface-sunken); box-shadow: var(--shadow-lightbox); color: var(--ink-muted); }
.photo img { display: block; max-width: 100%; max-height: min(680px, 70vh); width: auto; height: auto; object-fit: contain; }
.msg { margin: 0; padding: var(--space-8); }
.round { flex: 0 0 auto; width: 48px; height: 48px; border-radius: var(--radius-pill); border: 1px solid #f3efe633; background: #0000; color: var(--on-rail); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.round:hover { background: #f3efe622; }
.round:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
@media (max-width: 720px) {
  .lb { background: var(--rail); } /* opaco: en movil la pagina se veia detras de la foto */
  .top { padding: var(--space-3) var(--space-3) 0; }
  .stage { padding: var(--space-3) var(--space-3) var(--space-6); gap: var(--space-4); }
  .nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 1; background: #15140fb3; }
  .l { left: var(--space-2); }
  .r { right: var(--space-2); }
}
</style>
