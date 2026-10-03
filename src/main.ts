import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import './firebase'
import App from './App.vue'
import { routes } from './router'
import { authReady, authState } from './auth'
import { installAdminGuard } from './guard'

const router = createRouter({ history: createWebHistory(), routes, sensitive: true })
installAdminGuard(router, authReady, () => authState.isAdmin)

createApp(App).use(createPinia()).use(router).mount('#app')
