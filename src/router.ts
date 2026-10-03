import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/admin/login', name: 'admin-login', meta: { adminLogin: true }, component: () => import('./views/AdminLogin.vue') },
  {
    path: '/admin',
    meta: { requiresAdmin: true },
    component: () => import('./layouts/AdminLayout.vue'),
    children: [{ path: '', name: 'admin', component: () => import('./views/AdminHome.vue') },
      { path: ':pathMatch(.*)*', name: 'admin-not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
  {
    path: '/',
    component: () => import('./layouts/PublicLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('./views/HomeView.vue') },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
    ],
  },
]
