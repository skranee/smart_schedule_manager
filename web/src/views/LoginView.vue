<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const userStore = useUserStore();
const reason = computed(() => route.query.reason as string | undefined);

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const AUTH_URL = computed(() => `${API_BASE}/auth/google`);

function handleLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined;
  const params = new URLSearchParams();
  if (redirect) {
    params.set('redirect', redirect);
  }
  const target = params.size > 0 ? `${AUTH_URL.value}?${params.toString()}` : AUTH_URL.value;
  window.location.href = target;
}

onMounted(async () => {
  if (!userStore.isReady) {
    await userStore.ensureSession();
  }
  if (userStore.isAuthenticated) {
    const redirect = (route.query.redirect as string) ?? '/';
    router.replace(redirect);
  }
});
</script>

<template>
  <v-container fluid class="fill-height d-flex align-center justify-center py-12">
    <v-row class="w-100" justify="center">
      <v-col cols="12" md="6" lg="5">
        <v-card elevation="6" class="pa-8">
          <div class="mb-6">
            <h1 class="text-h5 font-weight-medium mb-1">
              {{ t('app.title') }}
            </h1>
            <p class="text-body-2 text-medium-emphasis">
              {{ t('schedule.emptySubtitle') }}
            </p>
          </div>

          <v-alert
            v-if="reason === 'unauthorized'"
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            {{ t('login.hint') }}
          </v-alert>

          <v-list lines="three" class="mb-6">
            <v-list-item
              prepend-icon="mdi-calendar-month-outline"
              :title="t('login.feature1Title')"
              :subtitle="t('login.feature1Subtitle')"
            />
            <v-list-item
              prepend-icon="mdi-brain"
              :title="t('login.feature2Title')"
              :subtitle="t('login.feature2Subtitle')"
            />
            <v-list-item
              prepend-icon="mdi-robot-happy-outline"
              :title="t('login.feature3Title')"
              :subtitle="t('login.feature3Subtitle')"
            />
          </v-list>

          <v-btn
            color="primary"
            size="large"
            class="mb-4"
            block
            prepend-icon="mdi-google"
            @click="handleLogin"
          >
            {{ t('login.cta') }}
          </v-btn>

          <div class="text-caption text-medium-emphasis">
            {{ t('schedule.emptyTitle') }}
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

