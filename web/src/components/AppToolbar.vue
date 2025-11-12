<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  loading: boolean;
  hasPending: boolean;
  userName?: string;
}>();

const emit = defineEmits<{
  logout: [];
  openSettings: [];
}>();

const { t } = useI18n();

const initials = computed(() => {
  if (!props.userName) return 'U';
  return props.userName
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
});
</script>

<template>
  <v-app-bar
    flat
    color="transparent"
    density="comfortable"
    class="app-toolbar px-4 position-absolute top-0"
  >
    <div class="toolbar-brand">
      <v-avatar size="36" class="toolbar-brand__icon" variant="tonal">
        <v-icon size="22">mdi-calendar-heart</v-icon>
      </v-avatar>
      <div>
        <div class="toolbar-brand__title">
          {{ t('app.title') }}
        </div>
        <div class="toolbar-brand__subtitle">
          {{ t('schedule.emptySubtitle') }}
        </div>
      </div>
    </div>

    <v-spacer />

    <div class="toolbar-actions">
      <v-btn
        icon
        variant="tonal"
        color="primary"
        class="rounded-lg"
        @click="emit('openSettings')"
        :title="t('nav.settings')"
      >
        <v-icon>mdi-cog-outline</v-icon>
      </v-btn>

      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            class="pill-btn"
            variant="text"
            color="primary"
          >
            <v-avatar size="32" class="mr-2" color="primary" variant="tonal">
              {{ initials }}
            </v-avatar>
            <span class="font-weight-semibold">{{ userName ?? '—' }}</span>
            <v-icon class="ml-1">mdi-menu-down</v-icon>
          </v-btn>
        </template>
        <v-list rounded="lg" class="pa-2">
          <v-list-item rounded="lg" @click="emit('logout')">
            <v-list-item-title>{{ t('nav.logout') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>
</template>

