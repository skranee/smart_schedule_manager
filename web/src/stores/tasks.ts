import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TaskRecord, TaskBase } from '@shared/types';
import { createTask, deleteTask, fetchTasks, updateTask } from '@/api/client';

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<TaskRecord[]>([]);
  const loading = ref(false);
  const selectedTaskId = ref<string | null>(null);
  const error = ref<string | null>(null);

  const selectedTask = computed<TaskRecord | null>(() => {
    const task = tasks.value.find((taskItem) => taskItem.id === selectedTaskId.value);
    return task ?? null;
  });

  function getTasksForDate(dateIso: string): TaskRecord[] {
    const targetDate = new Date(dateIso);
    targetDate.setHours(0, 0, 0, 0);
    const targetIso = targetDate.toISOString();
    
    return tasks.value.filter((task) => {
      if (!task.scheduledDate) return true; // Tasks without a scheduled date show on all days
      const taskDate = new Date(task.scheduledDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.toISOString() === targetIso;
    });
  }

  async function loadTasks() {
    loading.value = true;
    error.value = null;
    try {
      tasks.value = await fetchTasks();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function setSelectedTask(id: string | null) {
    selectedTaskId.value = id;
  }

  async function addTask(payload: Partial<TaskBase>) {
    const task = await createTask(payload);
    tasks.value = [task, ...tasks.value];
    return task;
  }

  async function saveTask(id: string, payload: Partial<TaskBase>) {
    const updated = await updateTask(id, payload);
    tasks.value = tasks.value.map((task) => (task.id === id ? updated : task));
    return updated;
  }

  async function removeTask(id: string) {
    await deleteTask(id);
    tasks.value = tasks.value.filter((task) => task.id !== id);
    if (selectedTaskId.value === id) {
      selectedTaskId.value = null;
    }
  }

  return {
    tasks,
    loading,
    selectedTaskId,
    selectedTask,
    error,
    loadTasks,
    setSelectedTask,
    addTask,
    saveTask,
    removeTask,
    getTasksForDate
  };
});

