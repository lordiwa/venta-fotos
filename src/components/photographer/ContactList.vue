<script setup lang="ts">
import { PHOTOGRAPHER, type ContactLinks } from '../../photographerLogic'
import type { whatsappLinkAttrs } from '../../whatsappLogic'
import { Icon } from '../../ui'
import { useI18n } from '../../i18n'

const { t } = useI18n()

defineProps<{ links: ContactLinks; waAttrs: ReturnType<typeof whatsappLinkAttrs>; onDark?: boolean }>()
</script>

<template>
  <ul class="contact" :class="{ dark: onDark }" :aria-label="t.photographer.contact.aria">
    <li><a :href="links.whatsapp" v-bind="waAttrs"><Icon name="telefono" /><span class="sr">WhatsApp: </span>{{ links.whatsappLabel }}</a></li>
    <li><a :href="links.email"><Icon name="correo" /><span class="sr">{{ t.photographer.contact.email }}: </span>{{ PHOTOGRAPHER.email }}</a></li>
    <li><a :href="links.instagram" target="_blank" rel="noopener"><Icon name="instagram" /><span class="sr">Instagram: </span>@{{ PHOTOGRAPHER.instagram }}</a></li>
    <li><span class="place"><Icon name="ubicacion" />Quito, Ecuador</span></li>
  </ul>
</template>

<style scoped>
.contact { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0 var(--space-6); font-size: 15px; }
.contact a, .place { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-md); color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
.contact a:hover { color: var(--amber-ink); }
.contact :deep(.es-icon) { flex: 0 0 auto; color: var(--amber-ink); }
.place { color: var(--ink-muted); }
.dark a { color: var(--on-rail); }
.dark a:hover { color: var(--amber); }
.dark :deep(.es-icon) { color: var(--amber); }
.dark .place { color: var(--on-rail-muted); }
.sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
