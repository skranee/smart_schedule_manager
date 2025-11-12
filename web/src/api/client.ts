import axios from 'axios';
import type {
  TaskRecord,
  ScheduledTaskSegment,
  PlanRecord,
  TaskBase,
  TaskCategory,
  FeedbackLabel
} from '@shared/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 8000
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        const search = new URLSearchParams(window.location.search);
        if (!search.has('reason')) {
          search.set('reason', 'unauthorized');
        }
        if (!search.has('redirect')) {
          search.set('redirect', window.location.pathname);
        }
        window.location.href = `/login?${search.toString()}`;
      }
    }
    return Promise.reject(error);
  }
);
export interface ScheduleResponseDto {
  plan: PlanRecord | null;
  slots: ScheduledTaskSegment[];
  reasoning: Record<string, string>;
  warnings: string[];
}

export async function fetchCurrentUser() {
  const response = await api.get('/me');
  return response.data;
}

export async function fetchTasks(includeArchived = false): Promise<TaskRecord[]> {
  const response = await api.get('/tasks', {
    params: { archived: includeArchived }
  });
  return response.data;
}

export async function createTask(payload: Partial<TaskBase>) {
  const response = await api.post('/tasks', payload);
  return response.data as TaskRecord;
}

export async function updateTask(id: string, payload: Partial<TaskBase>) {
  const response = await api.put(`/tasks/${id}`, payload);
  return response.data as TaskRecord;
}

export async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
}

function normalizeForApi(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback.toISOString();
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString();
}

export async function calculateSchedule(date: string, taskIds?: string[]) {
  const response = await api.post<ScheduleResponseDto>('/schedule/calculate', {
    date: normalizeForApi(date),
    taskIds
  });
  return response.data;
}

export async function submitScheduleFeedback(planId: string, entries: Array<{
  taskId: string;
  slot: { start: string; end: string };
  label: FeedbackLabel;
  note?: string;
  source: 'kept' | 'moved' | 'thumbs';
}>) {
  const response = await api.post('/schedule/feedback', {
    planId,
    entries
  });
  return response.data;
}

export async function applyScheduleEdits(planId: string, patches: Array<{
  taskId: string;
  from: { start: string; end: string };
  to: { start: string; end: string };
}>) {
  const response = await api.post('/schedule/apply-edits', {
    planId,
    patches
  });
  return response.data;
}

export async function fetchCatalog() {
  const response = await api.get('/catalog');
  return response.data;
}

export async function createCatalogEntry(payload: {
  title: string;
  defaultMinutes: number;
  defaultPriority: number;
  category: TaskCategory;
}) {
  const response = await api.post('/catalog', payload);
  return response.data;
}

export async function updateSettings(payload: {
  sleepStart: string;
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  preferredDailyMinutes: number;
  locale: 'ru';
  profile?: 'adult' | 'child-school-age';
  mealOffsets?: {
    breakfast?: number;
    lunch?: number;
    dinner?: number;
  };
  activityTargetMinutes?: number;
}) {
  const response = await api.put('/settings', payload);
  return response.data;
}

export async function logout() {
  await api.post('/auth/logout');
}

