<script setup lang="ts">
import { computed, ref } from 'vue'
import { isExpired, type DownloadFile } from '../downloadsLogic'
import { Button } from '../ui'
import { useI18n } from '../i18n'
import { formatShortDate } from '../i18n/format'

const { t, locale } = useI18n()
const props = defineProps<{ files: DownloadFile[]; busy?: boolean }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()
const now = ref(Date.now())
const expired = computed(() => props.files.some((f) => isExpired(f.expiresAt, now.value)))

/** CU3: si el enlace ya vencio no se abre; se ofrece generar uno nuevo. */
function onClick(ev: Event, f: DownloadFile) {
  now.value = Date.now()
  if (isExpired(f.expiresAt, now.value)) ev.preventDefault()
}
const expiryText = (f: DownloadFile) => formatShortDate(f.expiresAt, locale.value)
</script>

<template>
  <ul class="files">
    <li v-for="f in files" :key="`${f.eventId}/${f.photoId}`">
      <span class="mono-md name">{{ f.name }}</span>
      <span class="act">
        <template v-if="!isExpired(f.expiresAt, now)">
          <span class="caption muted">{{ t.downloads.availableUntil(expiryText(f)) }}</span>
          <Button variant="accent" icon="descargar" :href="f.url" download target="_blank" rel="noopener" @click="onClick($event, f)">{{ t.downloads.download }}</Button>
        </template>
        <span v-else class="body-sm warn">{{ t.downloads.expired }}</span>
      </span>
    </li>
  </ul>
  <div v-if="expired"><Button :disabled="busy" @click="emit('refresh')">{{ t.downloads.newLink }}</Button></div>
</template>

<style scoped>
.files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.files li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
.name { flex: 1 1 120px; min-width: 0; overflow-wrap: anywhere; }
.act { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.muted { color: var(--ink-muted); }
.warn { color: var(--danger); }
</style>
