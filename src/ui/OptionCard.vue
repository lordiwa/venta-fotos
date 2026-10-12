<script setup lang="ts">
/** Opción de un grupo de radios: `v-model` es el valor elegido del grupo y `value` el de esta tarjeta. */
defineProps<{ modelValue?: string; value: string; name: string; label: string; meta?: string; price?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="es-option" :class="{ on: modelValue === value }">
    <input type="radio" class="es-radio" :name="name" :value="value" :checked="modelValue === value" @change="$emit('update:modelValue', value)">
    <span class="es-option-body"><span class="es-option-label">{{ label }}</span><span v-if="meta" class="es-option-meta">{{ meta }}</span></span>
    <span v-if="price != null" class="es-option-price">{{ price }}</span>
  </label>
</template>
