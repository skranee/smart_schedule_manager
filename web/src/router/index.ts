import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const userStore = useUserStore();
  if (!userStore.isReady) {
    await userStore.ensureSession();
  }
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath ?? '/' }
    };
  }
  if (to.meta.guestOnly && userStore.isAuthenticated) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;

