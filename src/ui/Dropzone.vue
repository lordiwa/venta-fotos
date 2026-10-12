<script setup lang="ts">
import Icon from './Icon.vue'

withDefaults(defineProps<{ title?: string; hint?: string; accept?: string; disabled?: boolean }>(), {
  title: 'Arrastra fotos aquí o toca para elegirlas',
  hint: 'JPEG o PNG, hasta 50 MB cada una',
  accept: 'image/jpeg,image/png',
})
const emit = defineEmits<{ files: [files: File[]] }>()

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  if (picked.length) emit('files', picked)
}
</script>

<template>
  <label class="es-dropzone">
    <span class="es-dropzone-icon"><Icon name="subir" :size="20" /></span>
    <strong>{{ title }}</strong>
    <small>{{ hint }}</small>
    <input type="file" multiple :accept="accept" :disabled="disabled" @change="onChange">
  </label>
</template>
