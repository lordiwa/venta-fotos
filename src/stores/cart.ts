import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { addToCart, cartCount, CART_KEY, parseStoredCart, removeLine, setLineQuantity, type CartLine } from '../cartLogic'
import type { Product } from '../types'

function load(): CartLine[] {
  try { return parseStoredCart(localStorage.getItem(CART_KEY)) } catch { return [] }
}

/** CU6: el carrito vive en localStorage (sobrevive a recargar y reabrir la pestaña). */
export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>(load())
  const count = computed(() => cartCount(lines.value))

  watch(lines, (v) => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(v)) } catch { /* sin almacenamiento: el carrito sigue en memoria */ }
  }, { deep: true })

  function add(photo: { eventId: string; photoId: string }, product: Product, quantity: number) {
    lines.value = addToCart(lines.value, { ...photo, productId: product.id, priceAtAdd: product.price }, quantity, product.kind)
  }
  const setQuantity = (key: string, input: unknown) => { lines.value = setLineQuantity(lines.value, key, input) }
  const remove = (key: string) => { lines.value = removeLine(lines.value, key) }

  return { lines, count, add, setQuantity, remove }
})
