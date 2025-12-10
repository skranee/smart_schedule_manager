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
    // Нормализуем целевую дату: используем только дату без времени для сравнения
    const targetDate = new Date(dateIso);
    const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const targetDateStr = targetDateOnly.toISOString().split('T')[0];
    
    // Получаем сегодняшнюю дату для сравнения
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayDateStr = todayDateOnly.toISOString().split('T')[0];
    
    const filtered = tasks.value.filter((task) => {
      if (!task.scheduledDate) {
        // Задачи без scheduledDate показываются только на сегодня
        return targetDateStr === todayDateStr;
      }
      
      // Нормализуем дату задачи: используем только дату без времени
      const taskDate = new Date(task.scheduledDate);
      const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
      const taskDateStr = taskDateOnly.toISOString().split('T')[0];
      
      // Сравниваем только даты (без времени)
      return taskDateStr === targetDateStr;
    });
    
    return filtered;
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

