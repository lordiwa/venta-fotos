import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './styles/tokens.css'
import './styles/components.css'
import './style.css'
import './firebase'
import App from './App.vue'
import { routes, scrollBehavior } from './router'
import { authReady, authState } from './auth'
import { installAdminGuard } from './guard'
import { installPageMeta } from './i18n/pageMeta'

const router = createRouter({ history: createWebHistory(), routes, sensitive: true, scrollBehavior })
installAdminGuard(router, authReady, () => authState.isAdmin)
installPageMeta(router)

createApp(App).use(createPinia()).use(router).mount('#app')
