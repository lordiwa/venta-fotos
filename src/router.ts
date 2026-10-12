import type { RouteRecordRaw } from 'vue-router'

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
      { path: 'carrito', name: 'cart', component: () => import('./views/CartView.vue') },
      { path: 'checkout', name: 'checkout', component: () => import('./views/CheckoutView.vue') },
      { path: 'pedido/:number', name: 'order', component: () => import('./views/OrderView.vue') },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
]
