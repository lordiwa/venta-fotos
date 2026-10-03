<script setup lang="ts">
import { useRouter } from 'vue-router'
import { logout } from '../auth'

const router = useRouter()
async function salir() {
  await logout()
  await router.replace('/admin/login')
}
</script>

<template>
  <div class="layout">
    <header class="bar admin">
      <span class="brand">Administración</span>
      <span><RouterLink to="/">Ver tienda</RouterLink> · <button class="link" @click="salir">Cerrar sesión</button></span>
    </header>
    <main class="content"><RouterView /></main>
  </div>
</template>

<style scoped>
.link { background: none; border: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
</style>
