<script setup lang="ts">
/** Slots: default (contenido), `aside` (a la derecha del título). */
withDefaults(defineProps<{ title?: string; sunken?: boolean; as?: string }>(), { as: 'section' })
</script>

<template>
  <component :is="as" class="es-card" :class="{ 'es-card-sunken': sunken }">
    <div v-if="title" class="es-card-head">
      <h2 class="es-card-title">{{ title }}</h2>
      <div v-if="$slots.aside" class="es-card-aside"><slot name="aside" /></div>
    </div>
    <slot />
  </component>
</template>
