import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ScheduledTaskSegment, FeedbackLabel } from '@shared/types';
import {
  calculateSchedule,
  submitScheduleFeedback,
  applyScheduleEdits,
  type ScheduleResponseDto
} from '@/api/client';

interface PendingPatch {
  taskId: string;
  from: { start: string; end: string };
  to: { start: string; end: string };
}

function normalizeDateInput(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback.toISOString();
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString();
}

export const useScheduleStore = defineStore('schedule', () => {
  const segments = ref<ScheduledTaskSegment[]>([]);
  const reasoning = ref<Record<string, string>>({});
  const planId = ref<string | null>(null);
  const loading = ref(false);
  const warnings = ref<string[]>([]);
  const selectedDate = ref<string>(normalizeDateInput(new Date().toISOString()));
  const pendingPatches = ref<PendingPatch[]>([]);

  const hasPendingPatches = computed(() => pendingPatches.value.length > 0);

  async function loadSchedule(date: string, taskIds?: string[]) {
    loading.value = true;
    warnings.value = [];
    try {
      const normalized = normalizeDateInput(date);
      selectedDate.value = normalized;
      const data = await calculateSchedule(normalized, taskIds);
      applyScheduleResponse(data);
    } finally {
      loading.value = false;
    }
  }

  function applyScheduleResponse(response: ScheduleResponseDto) {
    segments.value = response.slots;
    reasoning.value = response.reasoning;
    planId.value = response.plan ? response.plan.id : null;
    warnings.value = response.warnings ?? [];
    pendingPatches.value = [];
  }

  function stagePatch(taskId: string, from: { start: string; end: string }, to: { start: string; end: string }) {
    const existingIndex = pendingPatches.value.findIndex(
      (patch) => patch.taskId === taskId && patch.from.start === from.start && patch.from.end === from.end,
    );
    const patch = { taskId, from, to };
    if (existingIndex >= 0) {
      pendingPatches.value.splice(existingIndex, 1, patch);
    } else {
      pendingPatches.value.push(patch);
    }

    segments.value = segments.value.map((segment) =>
      segment.taskId === taskId
        ? {
            ...segment,
            start: to.start,
            end: to.end
          }
        : segment,
    );
  }

  async function commitPatches() {
    if (!planId.value || pendingPatches.value.length === 0) return;
    await applyScheduleEdits(planId.value, pendingPatches.value);
    pendingPatches.value = [];
  }

  async function sendFeedback(entries: Array<{ taskId: string; slot: { start: string; end: string }; label: FeedbackLabel }>, source: 'kept' | 'moved' | 'thumbs' = 'thumbs') {
    if (!planId.value) {
      throw new Error('Невозможно отправить обратную связь: план ещё не рассчитан. Пожалуйста, нажмите «Рассчитать» сначала.');
    }
    await submitScheduleFeedback(
      planId.value,
      entries.map((entry) => ({
        ...entry,
        source
      })),
    );
  }

  return {
    segments,
    reasoning,
    planId,
    loading,
    warnings,
    selectedDate,
    pendingPatches,
    hasPendingPatches,
    loadSchedule,
    stagePatch,
    commitPatches,
    sendFeedback
  };
});

