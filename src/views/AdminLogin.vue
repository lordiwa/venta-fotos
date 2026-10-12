<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../auth'
import { Alert, Button, Field, Wordmark } from '../ui'
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
  <div class="login">
    <section class="hero" aria-hidden="true">
      <Wordmark on-rail />
      <div class="hero-copy">
        <span class="es-eyebrow hero-eyebrow">Panel del fotógrafo</span>
        <span class="display-lg hero-title">Tus eventos, tus fotos, tus pedidos.</span>
      </div>
    </section>
    <main class="pane">
      <form novalidate @submit.prevent="submit">
        <div class="intro">
          <h1 class="display-md">Acceso del fotógrafo</h1>
          <p class="body-sm">Entra con el correo y la contraseña de tu cuenta.</p>
        </div>
        <Field v-model="email" label="Correo" type="email" autocomplete="username" :error="emailError ?? undefined" />
        <Field v-model="password" label="Contraseña" type="password" autocomplete="current-password" />
        <Alert v-if="error" tone="danger">{{ error }}</Alert>
        <Button type="submit" variant="primary" size="lg" :disabled="loading">{{ loading ? 'Entrando…' : 'Entrar' }}</Button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.login { min-height: 100vh; display: flex; flex-wrap: wrap; background: var(--surface); color: var(--ink); }
.hero { flex: 1 1 420px; min-width: 0; box-sizing: border-box; min-height: 280px; display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-8); padding: var(--space-10); background: linear-gradient(160deg, #2a2418 0%, var(--rail) 70%); color: var(--on-rail); }
.hero-copy { display: flex; flex-direction: column; gap: var(--space-3); }
.hero-eyebrow { color: var(--amber); }
.hero-title { font-size: 44px; max-width: 14ch; text-wrap: balance; color: var(--on-rail); }
.pane { flex: 1 1 420px; min-width: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: var(--space-12) var(--space-10); }
form { display: flex; flex-direction: column; gap: var(--space-4); width: 100%; max-width: 380px; }
.intro { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-2); }
h1 { margin: 0; font-size: 34px; }
.intro p { margin: 0; color: var(--ink-muted); }
@media (max-width: 720px) {
  .hero { min-height: 0; padding: var(--space-6) var(--space-4); }
  .hero-title { font-size: 28px; }
  .pane { padding: var(--space-8) var(--space-4); }
  h1 { font-size: 28px; }
}
</style>
