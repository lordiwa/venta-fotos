<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../auth'
import { NO_ACCESS_ERROR, authErrorMessage, safeRedirect, validateEmail } from '../authLogic'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const emailError = ref<string | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

async function submit() {
  if (loading.value) return
  error.value = null
  emailError.value = validateEmail(email.value)
  if (emailError.value) return
  loading.value = true
  try {
    if (await login(email.value, password.value)) {
      await router.replace(safeRedirect(route.query.redirect))
    } else {
      error.value = NO_ACCESS_ERROR
    }
  } catch (e) {
    error.value = authErrorMessage((e as { code?: string }).code)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login">
    <form novalidate @submit.prevent="submit">
      <h1>Acceso del fotógrafo</h1>
      <label>
        Correo
        <input v-model="email" type="email" autocomplete="username" :aria-invalid="!!emailError" />
        <small v-if="emailError" class="field-error">{{ emailError }}</small>
      </label>
      <label>
        Contraseña
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Entrando…' : 'Entrar' }}</button>
    </form>
  </main>
</template>

<style scoped>
.login { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
form { width: 100%; max-width: 22rem; display: flex; flex-direction: column; gap: 1rem; }
h1 { font-size: 1.25rem; margin: 0; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
input { padding: 0.6rem; font-size: 1rem; border: 1px solid #c9ccd4; border-radius: 6px; }
input[aria-invalid='true'] { border-color: #b42318; }
button { padding: 0.7rem; font-size: 1rem; border: 0; border-radius: 6px; background: #1f2430; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: progress; }
.error, .field-error { color: #b42318; margin: 0; font-size: 0.9rem; }
</style>
