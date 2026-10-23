<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '../ui'
import { messagesFor, useI18n } from '../i18n'
import { isAdminRoute } from '../i18n/pageMeta'

// Esta vista tambien es el 404 de /admin/*, que siempre va en espanol (TASK-042 CU8).
const route = useRoute()
const { t: pub } = useI18n()
const t = computed(() => (isAdminRoute(route.name) ? messagesFor('es') : pub.value))
</script>

<template>
  <div class="nf">
    <h1 class="display-lg">{{ t.notFound.title }}</h1>
    <Button variant="secondary" to="/">{{ t.notFound.home }}</Button>
  </div>
</template>

<style scoped>
.nf { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-5); padding: var(--space-8) 0; }
.nf h1 { margin: 0; }
</style>
