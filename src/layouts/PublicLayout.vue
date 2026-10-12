<script setup lang="ts">
import { useCartStore } from '../stores/cart'
const cart = useCartStore()
</script>

<template>
  <div class="layout">
    <header class="bar">
      <RouterLink to="/" class="brand">Venta de Fotos</RouterLink>
      <RouterLink to="/carrito" class="cart" aria-label="Carrito">Carrito <span class="badge" data-testid="cart-badge">{{ cart.count }}</span></RouterLink>
    </header>
    <main class="content"><RouterView /></main>
    <footer class="bar small">Venta de Fotos · <RouterLink to="/descargas">Mis descargas</RouterLink></footer>
  </div>
</template>

<style scoped>
.cart { text-decoration: none; color: inherit; }
.badge { background: #1f2430; color: #fff; border-radius: 99px; padding: 0.1rem 0.5rem; font-size: 0.8rem; }
</style>
