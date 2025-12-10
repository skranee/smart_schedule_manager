<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskBase } from '@shared/types';
import AppToolbar from '@/components/AppToolbar.vue';
import CalendarView from '@/components/CalendarView.vue';
import TaskDrawer from '@/components/TaskDrawer.vue';
import ReasoningPanel from '@/components/ReasoningPanel.vue';
import TaskList from '@/components/TaskList.vue';
import PlanSummary from '@/components/PlanSummary.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import { useUserStore } from '@/stores/user';
import { useTaskStore } from '@/stores/tasks';
import { useScheduleStore } from '@/stores/schedule';
import { useCatalogStore, type CatalogEntry } from '@/stores/catalog';

const userStore = useUserStore();
const taskStore = useTaskStore();
const scheduleStore = useScheduleStore();
const catalogStore = useCatalogStore();
const { t } = useI18n();

const drawerOpen = ref(false);
const settingsOpen = ref(false);
const savingSettings = ref(false);
const selectedTaskId = ref<string | null>(null);
const initializing = ref(true);
const dateMenu = ref(false);

const snackbar = ref(false);
const snackbarMessage = ref('');
const snackbarColor = ref<'success' | 'error'>('success');

const selectedSegment = computed(() =>
  filteredSegments.value.find((segment) => segment.taskId === selectedTaskId.value) ?? null,
);
const selectedTask = computed(() => taskStore.selectedTask);

const isBusy = computed(() => initializing.value || scheduleStore.loading);

const filteredTasks = computed(() => {
  console.log('🎨 filteredTasks computed, selectedDate:', scheduleStore.selectedDate);
  const result = taskStore.getTasksForDate(scheduleStore.selectedDate);
  console.log('🎨 filteredTasks result:', result);
  return result;
});

// Фильтруем сегменты по выбранной дате
const filteredSegments = computed(() => {
  const selectedDate = new Date(scheduleStore.selectedDate);
  selectedDate.setUTCHours(0, 0, 0, 0);
  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  
  return scheduleStore.segments.filter((segment) => {
    const segmentStart = new Date(segment.start);
    segmentStart.setUTCHours(0, 0, 0, 0);
    const segmentDateStr = segmentStart.toISOString().split('T')[0];
    return segmentDateStr === selectedDateStr;
  });
});

const selectedDateLabel = computed(() => {
  const date = new Date(scheduleStore.selectedDate);
  return date.toLocaleDateString(userStore.locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
});

const datePickerValue = computed(() => {
  const date = new Date(scheduleStore.selectedDate);
  return date.toISOString().slice(0, 10);
});

function showToast(message: string, color: 'success' | 'error' = 'success') {
  snackbarMessage.value = message;
  snackbarColor.value = color;
  snackbar.value = true;
}

function startOfDayIso(input: Date | string) {
  const date = input instanceof Date ? input : new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

async function refreshPlan(date: string) {
  await scheduleStore.loadSchedule(date);
  // Используем отфильтрованные сегменты для выбранной даты
  // Ждем следующего тика, чтобы computed обновился
  await new Promise(resolve => setTimeout(resolve, 0));
  selectedTaskId.value = filteredSegments.value[0]?.taskId ?? null;
}

async function initialize() {
  try {
    await Promise.all([taskStore.loadTasks(), catalogStore.loadCatalog()]);
    await refreshPlan(startOfDayIso(new Date()));
  } catch (error) {
    showToast((error as Error).message, 'error');
  } finally {
    initializing.value = false;
  }
}

function openCreateTask() {
  taskStore.setSelectedTask(null);
  drawerOpen.value = true;
}

function handleSelectTask(taskId: string, open = true) {
  selectedTaskId.value = taskId;
  taskStore.setSelectedTask(taskId);
  if (open) {
    drawerOpen.value = true;
  }
}

async function handleCalculate() {
  try {
    // Принудительно пересчитываем расписание
    await scheduleStore.loadSchedule(scheduleStore.selectedDate, undefined, true);
    showToast(t('toast.saved'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function handleSaveTask(payload: Partial<TaskBase>) {
  try {
    console.log('📅 handleSaveTask - payload.scheduledDate:', payload.scheduledDate);
    console.log('📅 handleSaveTask - scheduleStore.selectedDate:', scheduleStore.selectedDate);
    
    // Set scheduledDate to the currently selected date if not already set
    if (!payload.scheduledDate) {
      payload.scheduledDate = scheduleStore.selectedDate;
      console.log('📅 Set scheduledDate to selectedDate:', payload.scheduledDate);
    }
    
    console.log('📅 Final payload.scheduledDate:', payload.scheduledDate);
    
    if (taskStore.selectedTaskId) {
      await taskStore.saveTask(taskStore.selectedTaskId, payload);
    } else {
      const task = await taskStore.addTask(payload);
      console.log('📅 Created task with scheduledDate:', task.scheduledDate);
      catalogStore.upsertEntry({
        title: task.title,
        defaultMinutes: task.estimatedMinutes,
        defaultPriority: task.priority,
        category: task.category
      });
    }
    drawerOpen.value = false;
    
    // Reload tasks first, then calculate schedule to show the task in calendar
    await taskStore.loadTasks();
    await catalogStore.loadCatalog();
    
    // Automatically calculate schedule to show task in calendar
    console.log('📅 Auto-calculating schedule...');
    await handleCalculate();
    
    showToast(t('toast.saved'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function handleDeleteTask(id: string) {
  try {
    await taskStore.removeTask(id);
    drawerOpen.value = false;
    await taskStore.loadTasks();
    await catalogStore.loadCatalog();
    
    // Automatically recalculate schedule after deletion
    await handleCalculate();
    showToast(t('toast.deleted'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function handleSegmentChange(payload: {
  taskId: string;
  from: { start: string; end: string };
  to: { start: string; end: string };
}) {
  scheduleStore.stagePatch(payload.taskId, payload.from, payload.to);
  selectedTaskId.value = payload.taskId;
}

async function handleFeedback(payload: { taskId: string; label: 0 | 1 }) {
  if (!selectedSegment.value) return;
  try {
    await scheduleStore.sendFeedback(
      [
        {
          taskId: payload.taskId,
          slot: {
            start: selectedSegment.value.start,
            end: selectedSegment.value.end
          },
          label: payload.label
        }
      ],
      payload.label === 1 ? 'kept' : 'thumbs',
    );
    showToast(t('toast.saved'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function handleReuse(template: CatalogEntry['taskTemplate']) {
  try {
    await taskStore.addTask({
      title: template.title,
      estimatedMinutes: template.defaultMinutes,
      priority: template.defaultPriority,
      category: template.category,
      scheduledDate: scheduleStore.selectedDate
    });
    await taskStore.loadTasks();
    await catalogStore.loadCatalog();
    
    // Automatically calculate schedule after reusing task
    await handleCalculate();
    showToast(t('toast.saved'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function handleSettingsSave(payload: {
  sleepStart: string;
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  preferredDailyMinutes: number;
  locale: 'ru';
}) {
  savingSettings.value = true;
  try {
    await userStore.saveSettings(payload);
    settingsOpen.value = false;
    showToast(t('toast.saved'));
  } catch (error) {
    showToast((error as Error).message, 'error');
  } finally {
    savingSettings.value = false;
  }
}

onMounted(() => {
  void initialize();
});

async function handleDatePick(value: string | Date) {
  const selected = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(selected.valueOf())) return;
  selected.setUTCHours(0, 0, 0, 0);
  dateMenu.value = false;
  await refreshPlan(selected.toISOString());
}

async function handleChangeDay(isoDate: string) {
  await refreshPlan(startOfDayIso(isoDate));
}
</script>

<template>
  <v-container fluid class="pa-0">
    <AppToolbar
      :loading="isBusy"
      :hasPending="scheduleStore.hasPendingPatches"
      :user-name="userStore.profile?.name"
      @logout="userStore.signOut"
      @open-settings="settingsOpen = true"
    />

    <v-container fluid class="pa-6 pt-8">
      <v-row>
        <v-col cols="12">
          <v-card class="hero-card pa-6" elevation="4">
            <div class="d-flex flex-wrap justify-space-between align-center ga-4">
              <div class="hero-text">
                <h2 class="text-h4 font-weight-semibold mb-2">
                  {{ t('schedule.emptyTitle') }}
                </h2>
                <p class="text-body-2 text-medium-emphasis mb-4">
                  {{ t('schedule.emptySubtitle') }}
                </p>
                <div class="d-flex ga-2 flex-wrap">
                  <v-btn color="tertiary" prepend-icon="mdi-plus" @click="openCreateTask">
                    {{ t('nav.addTask') }}
                  </v-btn>
                  <v-btn
                    variant="elevated"
                    color="primary"
                    prepend-icon="mdi-robot-happy-outline"
                    @click="handleCalculate"
                  >
                    {{ t('nav.calculate') }}
                  </v-btn>
                </div>
              </div>
              <div class="d-flex flex-column align-end ga-2 hero-actions">
                <v-chip color="white" class="text-primary font-weight-medium" variant="elevated">
                  {{ selectedDateLabel }}
                </v-chip>
                <v-menu v-model="dateMenu" :close-on-content-click="false" offset-y>
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      v-bind="menuProps"
                      variant="outlined"
                      color="white"
                      prepend-icon="mdi-calendar"
                    >
                      {{ t('nav.pickDate') }}
                    </v-btn>
                  </template>
                  <v-date-picker
                    :model-value="datePickerValue"
                    color="primary"
                    @update:model-value="handleDatePick"
                  />
                </v-menu>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <v-row align="stretch" :gutter="32" class="mt-4">
        <v-col cols="12" md="3" class="d-flex flex-column ga-4">
          <TaskList
            :tasks="filteredTasks"
            :loading="taskStore.loading"
            :selected-task-id="selectedTaskId"
            :catalog-entries="catalogStore.entries"
            :catalog-loading="catalogStore.loading"
            @select="(taskId) => handleSelectTask(taskId)"
            @refresh="() => taskStore.loadTasks()"
            @reuse="handleReuse"
          />
          <PlanSummary
            :segments="filteredSegments"
            :tasks="filteredTasks"
            :warnings="scheduleStore.warnings"
          />
        </v-col>

        <v-col cols="12" md="6">
          <CalendarView
            :segments="filteredSegments"
            :tasks="filteredTasks"
            :date="scheduleStore.selectedDate"
            :loading="isBusy"
            :reasoning="scheduleStore.reasoning"
            @segment-change="handleSegmentChange"
            @select-task="(taskId) => handleSelectTask(taskId, false)"
            @change-day="handleChangeDay"
          />
        </v-col>

        <v-col cols="12" md="3">
          <ReasoningPanel
            :segment="selectedSegment"
            :task="selectedTask"
            :reasoning="selectedSegment ? scheduleStore.reasoning[selectedSegment.taskId] : undefined"
            @feedback="handleFeedback"
            @edit="selectedSegment && handleSelectTask(selectedSegment.taskId)"
          />
        </v-col>
      </v-row>
    </v-container>

    <TaskDrawer
      :model-value="drawerOpen"
      :task="selectedTask"
      :initial-date="scheduleStore.selectedDate"
      @update:model-value="drawerOpen = $event"
      @save="handleSaveTask"
      @delete="handleDeleteTask"
      @reuse="handleReuse"
    />

    <SettingsDialog
      :model-value="settingsOpen"
      :profile="userStore.profile"
      :saving="savingSettings"
      @update:model-value="settingsOpen = $event"
      @save="handleSettingsSave"
    />

    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      timeout="3000"
    >
      {{ snackbarMessage }}
    </v-snackbar>

    <v-overlay :model-value="isBusy" class="align-center justify-center">
      <v-progress-circular indeterminate size="48" color="primary" />
    </v-overlay>
  </v-container>
</template>

<style scoped>
.hero-card {
  background: linear-gradient(135deg, rgba(103, 80, 164, 0.96) 0%, rgba(73, 110, 204, 0.9) 50%, rgba(87, 148, 255, 0.85) 100%);
  color: #ffffff;
  border-radius: 24px;
  overflow: hidden;
}

.hero-text h2 {
  color: #ffffff;
}

.hero-text p {
  max-width: 420px;
}

.hero-actions {
  min-width: 220px;
}
</style>
