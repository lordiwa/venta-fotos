import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/admin/login', name: 'admin-login', meta: { adminLogin: true }, component: () => import('./views/AdminLogin.vue') },
  {
    path: '/admin',
    meta: { requiresAdmin: true },
    component: () => import('./layouts/AdminLayout.vue'),
    children: [{ path: '', name: 'admin', component: () => import('./views/AdminHome.vue') },
      { path: 'eventos', name: 'admin-events', component: () => import('./views/AdminEvents.vue') },
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
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
]
