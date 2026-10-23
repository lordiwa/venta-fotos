<script setup lang="ts">
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ modelValue?: number; min?: number; max?: number; label?: string; lessLabel?: string; moreLabel?: string }>(), { modelValue: 1, min: 1, max: 99, label: 'Cantidad', lessLabel: 'Una menos', moreLabel: 'Una más' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const set = (n: number) => emit('update:modelValue', Math.min(props.max, Math.max(props.min, n)))
</script>

<template>
  <div class="es-stepper">
    <button type="button" class="es-stepper-btn" :aria-label="lessLabel" :disabled="modelValue <= min" @click="set(modelValue - 1)"><Icon name="menos" :size="16" /></button>
    <input class="es-stepper-val" :aria-label="label" :value="modelValue" readonly inputmode="numeric">
    <button type="button" class="es-stepper-btn" :aria-label="moreLabel" :disabled="modelValue >= max" @click="set(modelValue + 1)"><Icon name="mas" :size="16" /></button>
  </div>
</template>
