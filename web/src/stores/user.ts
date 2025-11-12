import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isAxiosError } from 'axios';
import { fetchCurrentUser, updateSettings, logout } from '@/api/client';
import { i18n } from '@/plugins/i18n';
import router from '@/router';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  locale: 'ru';
  sleepStart: string;
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  preferredDailyMinutes: number;
  modelUpdatedAt?: string | null;
}

export const useUserStore = defineStore('user', () => {
  const profile = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const isReady = ref(false);
  const isAuthenticated = ref(false);

  const locale = computed(() => profile.value?.locale ?? 'ru');

  function applyLocale(code: 'ru') {
    i18n.global.locale.value = code;
  }

  async function loadProfile() {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await fetchCurrentUser();
      profile.value = data;
      isAuthenticated.value = true;
      applyLocale(data.locale);
    } catch (err) {
      profile.value = null;
      if (isAxiosError(err) && err.response?.status === 401) {
        error.value = null;
      } else {
        error.value = (err as Error).message;
      }
      isAuthenticated.value = false;
    } finally {
      loading.value = false;
      isReady.value = true;
    }
  }

  function setLocale(code: 'ru') {
    applyLocale(code);
    if (profile.value) {
      profile.value.locale = code;
    }
  }

  async function saveSettings(payload: Parameters<typeof updateSettings>[0]) {
    const data = await updateSettings(payload);
    if (profile.value) {
      profile.value = {
        ...profile.value,
        ...data
      };
    } else {
      profile.value = data;
    }
    setLocale(data.locale);
  }

  async function signOut() {
    await logout();
    profile.value = null;
    isAuthenticated.value = false;
    isReady.value = true;
    await router.push({ name: 'login' });
  }

  async function ensureSession() {
    if (!isReady.value) {
      await loadProfile();
    }
  }

  return {
    profile,
    loading,
    error,
    locale,
    loadProfile,
    setLocale,
    saveSettings,
    signOut,
    ensureSession,
    isReady,
    isAuthenticated
  };
});

