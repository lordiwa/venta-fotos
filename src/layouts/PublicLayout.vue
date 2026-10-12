<script setup lang="ts">
import { useCartStore } from '../stores/cart'
import { TopBar, Wordmark } from '../ui'

const cart = useCartStore()
</script>

<template>
  <div class="layout">
    <TopBar :cart-count="cart.count" />
    <main class="content"><RouterView /></main>
    <footer class="foot">
      <Wordmark to="/" class="foot-mark" />
      <nav class="foot-links" aria-label="Pie">
        <RouterLink to="/descargas">Mis descargas</RouterLink>
        <RouterLink to="/admin">Acceso del fotógrafo</RouterLink>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-7) var(--space-10); border-top: 1px solid var(--line); font-size: 14px; color: var(--ink-muted); }
.foot-mark { font-size: 15px; }
.foot-links { display: flex; flex-wrap: wrap; gap: var(--space-6); }
.foot-links a { display: inline-flex; align-items: center; min-height: var(--control-md); color: var(--ink-muted); text-decoration: none; }
.foot-links a:hover { color: var(--amber-ink); }
@media (max-width: 720px) {
  .foot { padding: var(--space-6) var(--space-4); }
}
</style>
