<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { format, parseISO } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import type { ScheduledTaskSegment, TaskRecord } from '@shared/types';
import { useUserStore } from '@/stores/user';

const props = defineProps<{
  segment: ScheduledTaskSegment | null;
  task: TaskRecord | null;
  reasoning?: string;
}>();

const emit = defineEmits<{
  (e: 'feedback', payload: { taskId: string; label: 0 | 1 }): void;
  (e: 'edit'): void;
}>();

const userStore = useUserStore();
const { t } = useI18n();

const dateLocale = computed(() => (userStore.locale === 'ru' ? ru : enUS));

const humanReasoning = computed(() => {
  if (props.reasoning) return props.reasoning;
  if (!props.segment || !props.task) {
    return '';
  }
  const start = parseISO(props.segment.start);
  const end = parseISO(props.segment.end);
  const datePart = format(start, 'PPP', { locale: dateLocale.value });
  const timeRange = `${format(start, 'p', { locale: dateLocale.value })} — ${format(end, 'p', {
    locale: dateLocale.value,
  })}`;

  return t('reasoning.generated', {
    title: props.task?.title ?? props.segment.title,
    date: datePart,
    time: timeRange
  });
});

function onFeedback(label: 0 | 1) {
  if (!props.segment) return;
  emit('feedback', { taskId: props.segment.taskId, label });
}
</script>

<template>
  <v-sheet elevation="1" class="pa-4 rounded-lg fill-height">
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <div class="text-subtitle-1 font-weight-medium">
          {{ t('reasoning.title') }}
        </div>
        <div class="text-body-2 text-medium-emphasis">
          {{ task?.title ?? segment?.title ?? '—' }}
        </div>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-pencil-outline" variant="tonal" @click="emit('edit')" />
        <v-btn icon="mdi-thumb-up-outline" color="success" variant="tonal" @click="onFeedback(1)" />
        <v-btn icon="mdi-thumb-down-outline" color="error" variant="tonal" @click="onFeedback(0)" />
      </div>
    </div>

    <div class="text-body-2 mb-4">
      {{ props.reasoning ?? humanReasoning }}
    </div>
  </v-sheet>
</template>

