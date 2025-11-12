<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskCategory, TaskRecord } from '@shared/types';
import type { CatalogEntry } from '@/stores/catalog';
import { getCategoryI18nKey } from '@/utils/categoryLabels';

const props = defineProps<{
  tasks: TaskRecord[];
  loading: boolean;
  selectedTaskId: string | null;
  catalogEntries: CatalogEntry[];
  catalogLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'refresh'): void;
  (e: 'reuse', template: CatalogEntry['taskTemplate']): void;
}>();

const { t, locale } = useI18n();

const sortedTasks = computed(() =>
  [...props.tasks].sort((a, b) => {
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) return priorityDelta;
    const deadlineA = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const deadlineB = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return deadlineA - deadlineB;
  }),
);

const totalMinutes = computed(() =>
  props.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
);

const urgentCount = computed(() => props.tasks.filter((task) => !!task.deadline).length);

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return locale.value === 'ru' ? `${minutes} мин` : `${minutes} min`;
  }
  const hourLabel = locale.value === 'ru' ? 'ч' : 'h';
  const minuteLabel = locale.value === 'ru' ? 'мин' : 'm';
  return `${hours}${hourLabel} ${remainder}${minuteLabel}`;
}

function priorityColor(priority: number) {
  if (priority >= 0.75) return 'error';
  if (priority >= 0.5) return 'warning';
  return 'info';
}

function categoryLabel(category: TaskCategory | undefined | null) {
  if (!category) return '';
  return t(getCategoryI18nKey(category));
}
</script>

<template>
  <v-card elevation="4" rounded="xl" class="mb-4">
    <v-card-title class="d-flex align-center justify-space-between">
      <div>
        <div class="text-subtitle-1 font-weight-medium">
          {{ t('dashboard.tasksTitle') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ sortedTasks.length }} · {{ formatMinutes(totalMinutes) }}
        </div>
      </div>
      <v-btn icon variant="text" @click="emit('refresh')" :loading="loading">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-card-title>

    <v-divider />

    <v-card-text class="pa-0">
      <v-skeleton-loader v-if="loading" type="list-item-two-line" class="pa-4" />
      <v-list v-else density="comfortable">
        <template v-if="sortedTasks.length > 0">
          <v-list-item
            v-for="task in sortedTasks"
            :key="task.id"
            :value="task.id"
            @click="emit('select', task.id)"
            :active="task.id === selectedTaskId"
            rounded="lg"
          >
            <template #prepend>
              <v-avatar size="28" :color="priorityColor(task.priority)" variant="tonal">
                {{ Math.round(task.priority * 100) }}
              </v-avatar>
            </template>

            <template #title>
              <div class="d-flex align-center justify-space-between">
                <span class="text-body-1 font-weight-medium">{{ task.title }}</span>
                <v-chip
                  size="small"
                  label
                  color="primary"
                  variant="tonal"
                >
                  {{ categoryLabel(task.category) }}
                </v-chip>
              </div>
            </template>

            <template #subtitle>
              <div class="d-flex flex-wrap align-center ga-2 text-caption text-medium-emphasis">
                <span>{{ formatMinutes(task.estimatedMinutes) }}</span>
                <span v-if="task.deadline">
                  <v-icon size="16" class="mr-1">mdi-clock-outline</v-icon>
                  {{ new Date(task.deadline).toLocaleString() }}
                </span>
                <span v-if="task.ai">
                  <v-icon size="16" class="mr-1">mdi-robot-happy-outline</v-icon>
                  {{ categoryLabel(task.ai.label) }} · {{ Math.round(task.ai.confidence * 100) }}%
                </span>
              </div>
            </template>
          </v-list-item>
        </template>
        <template v-else>
          <div class="pa-6 text-center text-medium-emphasis">
            {{ t('calendar.noEvents') }}
          </div>
        </template>
      </v-list>
    </v-card-text>

    <v-divider />

    <div class="pa-4">
      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-subtitle-2 text-medium-emphasis">
          {{ t('nav.previousTasks') }}
        </span>
        <v-progress-circular
          v-if="catalogLoading"
          indeterminate
          size="18"
          color="primary"
        />
      </div>
      <v-chip-group
        v-if="catalogEntries.length > 0"
        column
        class="d-flex flex-wrap ga-2"
      >
        <v-chip
          v-for="entry in catalogEntries"
          :key="entry.id"
          color="secondary"
          variant="tonal"
          prepend-icon="mdi-flash"
          @click="emit('reuse', entry.taskTemplate)"
        >
          {{ entry.taskTemplate.title }}
        </v-chip>
      </v-chip-group>
      <div v-else-if="!catalogLoading" class="text-caption text-medium-emphasis">
        {{ t('dashboard.noTemplates') }}
      </div>
    </div>

    <v-divider />

    <v-card-actions class="d-flex flex-column align-start">
      <div class="w-100 text-caption text-medium-emphasis mb-2">
        {{ t('dashboard.deadlineInfo', urgentCount) }}
      </div>
      <v-progress-linear
        :model-value="sortedTasks.length === 0 ? 0 : (urgentCount / sortedTasks.length) * 100"
        color="error"
        rounded
      />
    </v-card-actions>
  </v-card>
</template>

