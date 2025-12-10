<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { differenceInMinutes } from 'date-fns';
import type { ScheduledTaskSegment, TaskRecord } from '@shared/types';

const { t } = useI18n();

const props = defineProps<{
  segments: ScheduledTaskSegment[];
  tasks: TaskRecord[];
  warnings: string[];
}>();

const scheduledMinutes = computed(() =>
  props.segments.reduce((sum, segment) => {
    const start = new Date(segment.start);
    const end = new Date(segment.end);
    return sum + Math.max(differenceInMinutes(end, start), 0);
  }, 0),
);

const scheduledTasks = computed(() => new Set(props.segments.map((segment) => segment.taskId)));
const unscheduled = computed(() => props.tasks.filter((task) => !scheduledTasks.value.has(task.id)));

const categoryBreakdown = computed(() => {
  const total = props.segments.length || 1;
  const counts = props.segments.reduce<Record<string, number>>((acc, segment) => {
    acc[segment.category] = (acc[segment.category] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([category, count]) => ({
      category,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);
});
</script>

<template>
  <v-card elevation="4" rounded="xl">
    <v-card-title class="text-subtitle-1 font-weight-medium">
      {{ t('planSummary.title') }}
    </v-card-title>
    <v-card-text class="d-flex flex-column ga-4">
      <div class="d-flex align-center justify-space-between">
        <div class="text-h5 font-weight-medium">
          {{ Math.round(scheduledMinutes / 60) }}{{ t('planSummary.hours') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ segments.length }} {{ t('planSummary.blocks') }}
        </div>
      </div>
      <v-progress-linear
        :model-value="Math.min((scheduledMinutes / (16 * 60)) * 100, 100)"
        color="primary"
        rounded
        height="8"
      />

      <div v-if="warnings.length" class="d-flex flex-column ga-2">
        <v-alert
          v-for="warning in warnings"
          :key="warning"
          type="warning"
          variant="tonal"
          density="compact"
        >
          {{ warning }}
        </v-alert>
      </div>

      <div class="d-flex flex-column ga-2">
        <div class="text-subtitle-2 text-medium-emphasis">{{ t('planSummary.topCategories') }}</div>
        <div class="d-flex flex-wrap ga-2">
          <v-chip
            v-for="category in categoryBreakdown"
            :key="category.category"
            size="small"
            label
            color="primary"
            variant="tonal"
          >
            {{ category.category }} · {{ category.percentage }}%
          </v-chip>
          <div
            v-if="categoryBreakdown.length === 0"
            class="text-caption text-medium-emphasis"
          >
            {{ $t('dashboard.noSlots') }}
          </div>
        </div>
      </div>

      <div class="d-flex flex-column ga-1">
        <div class="text-subtitle-2 text-medium-emphasis">
          {{ t('planSummary.unscheduledTasks', { count: unscheduled.length }) }}
        </div>
        <v-chip
          v-for="task in unscheduled.slice(0, 3)"
          :key="task.id"
          size="small"
          variant="outlined"
        >
          {{ task.title }}
        </v-chip>
        <div v-if="unscheduled.length > 3" class="text-caption text-medium-emphasis">
          +{{ unscheduled.length - 3 }} more
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

