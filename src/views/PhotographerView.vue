<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PhotographerHero from '../components/photographer/PhotographerHero.vue'
import PhotographerCv from '../components/photographer/PhotographerCv.vue'
import PortfolioGallery from '../components/photographer/PortfolioGallery.vue'
import QuoteCta from '../components/photographer/QuoteCta.vue'
import { getSettings } from '../settingsApi'
import { PAGE_DESCRIPTION, PAGE_TITLE, contactLinks } from '../photographerLogic'
import { currentLinkEnv, resolveWhatsappDigits, whatsappLinkAttrs } from '../whatsappLogic'

// CU4/CU5: el mismo numero que el carrito (settings/store.whatsappPhone; si falta o falla la lectura, el por defecto).
const digits = ref(resolveWhatsappDigits(null))
const links = computed(() => contactLinks(digits.value))
const waAttrs = whatsappLinkAttrs(currentLinkEnv())

// CU6: titulo y descripcion propios; al salir de la pagina se restauran los de la app.
let prevTitle = ''
let prevDesc: string | null = null
let meta: HTMLMetaElement | null = null
onMounted(() => {
  getSettings().then((s) => { digits.value = resolveWhatsappDigits(s?.whatsappPhone) }).catch(() => {})
  prevTitle = document.title
  document.title = PAGE_TITLE
  meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  prevDesc = meta?.getAttribute('content') ?? null
  if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
  meta.content = PAGE_DESCRIPTION
})
onBeforeUnmount(() => {
  document.title = prevTitle
  if (prevDesc === null) meta?.remove()
  else meta?.setAttribute('content', prevDesc)
})
</script>

<template>
  <div class="page">
    <PhotographerHero :links="links" :wa-attrs="waAttrs" />
    <PhotographerCv />
    <PortfolioGallery />
    <QuoteCta :quote-href="links.quote" :wa-attrs="waAttrs" />
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-18); padding-bottom: var(--space-10); }
@media (max-width: 720px) { .page { gap: var(--space-14); } }
</style>
