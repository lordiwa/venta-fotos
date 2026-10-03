<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { storage } from '../firebase'

/** Miniatura de una foto. Solo recibe rutas de thumbs/ (nunca del original: CU9 de TASK-013). */
const props = defineProps<{ path?: string }>()
const url = ref<string | null>(null)

watchEffect(async () => {
  url.value = null
  if (props.path) {
    try {
      url.value = await getDownloadURL(storageRef(storage, props.path))
    } catch {
      url.value = null
    }
  }
})
</script>

<template>
  <img v-if="url" :src="url" alt="" loading="lazy" />
  <div v-else class="ph" />
</template>

<style scoped>
img, .ph { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #eef0f4; }
</style>
