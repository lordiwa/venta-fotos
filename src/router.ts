import type { RouteLocationNormalized, RouteRecordRaw, RouterScrollBehavior } from 'vue-router'
import { currentPaymentMode } from './paymentMode'

export const routes: RouteRecordRaw[] = [
  { path: '/admin/login', name: 'admin-login', meta: { adminLogin: true }, component: () => import('./views/AdminLogin.vue') },
  {
    path: '/admin',
    meta: { requiresAdmin: true },
    component: () => import('./layouts/AdminLayout.vue'),
    children: [{ path: '', name: 'admin', component: () => import('./views/AdminHome.vue') },
      { path: 'eventos', name: 'admin-events', component: () => import('./views/AdminEvents.vue') },
      { path: 'productos', name: 'admin-products', component: () => import('./views/AdminProducts.vue') },
      { path: 'pedidos', name: 'admin-orders', component: () => import('./views/AdminOrders.vue') },
      { path: 'impresion', name: 'admin-print', component: () => import('./views/AdminPrintList.vue') },
      { path: 'configuracion', name: 'admin-settings', component: () => import('./views/AdminSettings.vue') },
      { path: 'eventos/nuevo', name: 'admin-event-new', component: () => import('./views/AdminEventForm.vue') },
      { path: 'eventos/:id', name: 'admin-event', component: () => import('./views/AdminEventDetail.vue') },
      { path: 'eventos/:id/editar', name: 'admin-event-edit', component: () => import('./views/AdminEventForm.vue') },
      { path: ':pathMatch(.*)*', name: 'admin-not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
  {
    path: '/',
    component: () => import('./layouts/PublicLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('./views/HomeView.vue') },
      {
        // La foto es una ruta hija sin contenido propio: el lightbox se superpone a la cuadricula, que sigue montada.
        path: 'eventos/:eventId',
        name: 'event',
        component: () => import('./views/EventGallery.vue'),
        children: [{ path: 'fotos/:photoId', name: 'event-photo', component: { render: () => null } }],
      },
      { path: 'eventos', redirect: { path: '/', hash: '#eventos' } },
      { path: 'carrito', name: 'cart', component: () => import('./views/CartView.vue') },
      { path: 'checkout', name: 'checkout', beforeEnter: () => (currentPaymentMode() === 'whatsapp' ? { name: 'cart' } : true), component: () => import('./views/CheckoutView.vue') },
      { path: 'descargas', name: 'downloads', component: () => import('./views/DescargasView.vue') },
      { path: 'pedido/:number', name: 'order', component: () => import('./views/OrderView.vue') },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
]

const inEvent = (r: RouteLocationNormalized) => r.matched.some((m) => m.name === 'event')
const smooth = () => (typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto')

// Abrir/cerrar/pasar fotos del mismo evento no mueve la galeria; atras restaura; ancla hace scroll; lo demas va arriba.
// Un click al ancla en la que ya se esta tambien pasa por aqui: vue-router re-dispara el scroll en la navegacion duplicada.
export const scrollBehavior: RouterScrollBehavior = (to, from, saved) => {
  if (inEvent(to) && inEvent(from) && to.params.eventId === from.params.eventId) return false
  if (saved) return saved
  if (to.hash) return { el: to.hash, behavior: smooth() }
  return { top: 0 }
}
