<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ScheduledTaskSegment, TaskRecord } from '@shared/types';
import { useI18n } from 'vue-i18n';
import { addDays, format } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';

const props = defineProps<{
  segments: ScheduledTaskSegment[];
  tasks: TaskRecord[];
  date: string;
  loading: boolean;
  reasoning: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'segment-change', payload: {
    taskId: string;
    from: { start: string; end: string };
    to: { start: string; end: string };
  }): void;
  (e: 'select-task', taskId: string): void;
  (e: 'change-day', isoDate: string): void;
}>();

const { t, locale } = useI18n();

const categoryColors: Record<string, string> = {
  'Deep work': '#6200EA',
  'Sport activity': '#00897B',
  Healthcare: '#D81B60',
  'Admin/Errands': '#5D4037',
  Learning: '#3949AB',
  Social: '#F57C00',
  Household: '#6D4C41',
  Creative: '#FFB300',
  Relaxing: '#00ACC1',
  Games: '#9C27B0',
  'Outdoor Play': '#4CAF50',
  Commute: '#546E7A',
  Other: '#78909C'
};

const events = computed(() =>
  props.segments.map((segment) => {
    const task = props.tasks.find((candidate) => candidate.id === segment.taskId);
    const color = task ? categoryColors[task.category] ?? categoryColors.Other : categoryColors.Other;
    // ВСЕГДА используем title из segment (приоритет), затем из task, fallback — пустая строка
    const title = segment.title || task?.title || '';
    return {
      id: segment.taskId,
      title,
      start: new Date(segment.start),
      end: new Date(segment.end),
      color,
      timed: true,
      data: {
        segment,
        task
      }
    };
  }),
);

const hasEvents = computed(() => events.value.length > 0);

const dragSnapshot = ref<{ taskId: string; start: string; end: string } | null>(null);
const currentDate = computed(() => new Date(props.date));
const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru
};
const currentLocale = computed(() => localeMap[locale.value] ?? enUS);
const dayLabel = computed(() => format(currentDate.value, 'EEEE, MMM d', { locale: currentLocale.value }));

const hasLoadedOnce = ref(!props.loading);
watch(
  () => props.loading,
  (isLoading) => {
    if (!isLoading) {
      hasLoadedOnce.value = true;
    }
  },
  { immediate: true },
);

const showSkeleton = computed(() => props.loading && !hasLoadedOnce.value);

function toIso(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function onDragStart({ event }: any) {
  dragSnapshot.value = {
    taskId: event.id,
    start: toIso(event.start),
    end: toIso(event.end)
  };
}

function onEventDrop({ event, start, end }: any) {
  const from = dragSnapshot.value ?? {
    taskId: event.id,
    start: toIso(event.start),
    end: toIso(event.end)
  };
  dragSnapshot.value = null;
  emit('segment-change', {
    taskId: event.id,
    from: { start: from.start, end: from.end },
    to: { start: toIso(start), end: toIso(end) }
  });
}

function onEventResize(payload: any) {
  const { event, start, end } = payload;
  emit('segment-change', {
    taskId: event.id,
    from: {
      start: toIso(event.start),
      end: toIso(event.end)
    },
    to: {
      start: toIso(start),
      end: toIso(end)
    }
  });
}

function onEventClick({ event }: any) {
  emit('select-task', event.id);
}

function changeDay(offset: number) {
  const next = addDays(currentDate.value, offset);
  emit('change-day', next.toISOString());
}

function goToday() {
  const today = new Date();
  emit('change-day', today.toISOString());
}
</script>

<template>
  <div class="calendar-wrapper">
    <v-skeleton-loader v-if="showSkeleton" type="image" class="rounded-lg" />
    <template v-else>
      <div class="calendar-header">
        <div class="calendar-header__date">{{ dayLabel }}</div>
        <div class="calendar-header__controls">
          <v-btn variant="text" size="small" color="primary" @click="goToday">
            {{ t('calendar.today') }}
          </v-btn>
          <v-btn icon variant="text" @click="changeDay(-1)">
            <v-icon>mdi-chevron-left</v-icon>
          </v-btn>
          <v-btn icon variant="text" @click="changeDay(1)">
            <v-icon>mdi-chevron-right</v-icon>
          </v-btn>
        </div>
      </div>
      <v-slide-x-transition mode="out-in">
        <v-sheet
          :key="date"
          elevation="1"
          rounded="xl"
          class="overflow-hidden calendar-shell"
        >
          <v-calendar
            ref="calendar"
            :model-value="date"
            :events="events"
            type="day"
            view-mode="stack"
            :interval-minutes="30"
            :interval-count="48"
            :first-interval="6"
            :interval-height="50"
            :event-overlap-mode="'column'"
            :event-draggable="true"
            :event-resizable="true"
            color="primary"
            class="google-like-calendar"
            hide-header
            @event-drop="onEventDrop"
            @event-resize="onEventResize"
            @event-dragstart="onDragStart"
            @event-click="onEventClick"
          >
            <template #event="{ event }">
              <div class="calendar-event">
                <span class="calendar-event__title">{{ event.title }}</span>
                <span class="calendar-event__time">
                  {{ new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  -
                  {{ new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
            </template>
          </v-calendar>
        </v-sheet>
      </v-slide-x-transition>
      <div v-if="!hasEvents" class="text-center py-8 calendar-empty">
        <v-icon size="48" color="primary" class="mb-2">mdi-calendar-blank</v-icon>
        <div class="text-subtitle-1">{{ t('calendar.noEvents') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calendar-wrapper {
  min-height: 600px;
}
.calendar-shell {
  height: 700px;
}
.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  margin-bottom: 12px;
}
.calendar-header__date {
  font-size: 1.05rem;
  font-weight: 600;
  text-transform: capitalize;
}
.calendar-header__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.calendar-empty {
  text-align: center;
}
.google-like-calendar {
  border: none;
}
.calendar-event {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.calendar-event__title {
  font-weight: 600;
  font-size: 0.95rem;
}
.calendar-event__time {
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>

