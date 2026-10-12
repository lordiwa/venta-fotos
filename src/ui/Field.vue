<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Campo de formulario. Sin slot dibuja su propio control con v-model; con slot por
 * defecto el slot recibe { id, describedby, invalid, inputClass } para poner un control propio.
 */
const props = withDefaults(defineProps<{
  label: string
  modelValue?: string | number
  as?: 'input' | 'textarea' | 'select'
  type?: string
  hint?: string
  error?: string
  optional?: string
  mono?: boolean
  prefix?: string
  placeholder?: string
  rows?: number
  inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'search' | 'url' | 'none'
  autocomplete?: string
  options?: string[]
  id?: string
}>(), { as: 'input' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const fieldId = computed(() => props.id ?? `f-${uid}`)
const describedby = computed(() => (props.error ? `${fieldId.value}-err` : props.hint ? `${fieldId.value}-hint` : undefined))
const inputClass = computed(() => ['es-input', { 'es-input-mono': props.mono, 'es-input-invalid': !!props.error }])
const invalid = computed(() => (props.error ? 'true' : undefined))
const onInput = (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value)
</script>

<template>
  <div class="es-field">
    <label :for="fieldId" class="es-field-label">{{ label }}<span v-if="optional" class="es-field-optional"> {{ optional }}</span></label>
    <span :class="prefix ? 'es-input-group' : 'es-input-wrap'">
      <span v-if="prefix" class="es-input-prefix">{{ prefix }}</span>
      <slot :id="fieldId" :describedby="describedby" :invalid="!!error" :input-class="inputClass">
        <select v-if="as === 'select'" :id="fieldId" :class="inputClass" :value="modelValue" :aria-invalid="invalid" :aria-describedby="describedby" @change="onInput">
          <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
        </select>
        <textarea v-else-if="as === 'textarea'" :id="fieldId" :class="inputClass" :value="modelValue" :rows="rows" :placeholder="placeholder" :aria-invalid="invalid" :aria-describedby="describedby" @input="onInput" />
        <input v-else :id="fieldId" :class="inputClass" :type="type" :value="modelValue" :placeholder="placeholder" :inputmode="inputmode" :autocomplete="autocomplete" :aria-invalid="invalid" :aria-describedby="describedby" @input="onInput">
      </slot>
    </span>
    <span v-if="error" :id="`${fieldId}-err`" role="alert" class="es-field-error">{{ error }}</span>
    <span v-else-if="hint" :id="`${fieldId}-hint`" class="es-field-hint">{{ hint }}</span>
  </div>
</template>
