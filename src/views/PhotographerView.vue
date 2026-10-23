<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PhotographerHero from '../components/photographer/PhotographerHero.vue'
import PhotographerCv from '../components/photographer/PhotographerCv.vue'
import PortfolioGallery from '../components/photographer/PortfolioGallery.vue'
import QuoteCta from '../components/photographer/QuoteCta.vue'
import { getSettings } from '../settingsApi'
import { contactLinks } from '../photographerLogic'
import { useI18n } from '../i18n'
import { currentLinkEnv, resolveWhatsappDigits, whatsappLinkAttrs } from '../whatsappLogic'

// CU4/CU5: el mismo numero que el carrito (settings/store.whatsappPhone; si falta o falla la lectura, el por defecto).
const digits = ref(resolveWhatsappDigits(null))
const { locale } = useI18n()
const links = computed(() => contactLinks(digits.value, locale.value))
const waAttrs = whatsappLinkAttrs(currentLinkEnv())

// CU6: titulo y meta description de esta pagina (en el idioma activo) los pone installPageMeta (i18n/pageMeta.ts).
onMounted(() => {
  getSettings().then((s) => { digits.value = resolveWhatsappDigits(s?.whatsappPhone) }).catch(() => {})
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
