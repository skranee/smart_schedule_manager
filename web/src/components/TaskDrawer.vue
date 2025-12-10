<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TASK_CATEGORIES } from '@shared/constants';
import type { TaskRecord, TaskCategory, TaskBase } from '@shared/types';
import { useCatalogStore } from '@/stores/catalog';
import { getCategoryI18nKey } from '@/utils/categoryLabels';

type CategoryOverride = 'auto' | TaskCategory;

interface CatalogTemplate {
  title: string;
  defaultMinutes: number;
  defaultPriority: number;
  category: TaskCategory;
}

const props = defineProps<{
  modelValue: boolean;
  task: TaskRecord | null;
  initialDate?: string; // Initial date for new tasks (ISO format)
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', value: Partial<TaskBase>): void;
  (e: 'delete', id: string): void;
  (e: 'reuse', template: CatalogTemplate): void;
}>();

const catalogStore = useCatalogStore();
const { t, locale } = useI18n();

const activeTab = ref<'create' | 'catalog'>('create');
const advancedOpen = ref(false);

const formState = reactive({
  title: '',
  description: '',
  estimatedMinutes: 60,
  priority: 0.5,
  deadline: '',
  fixedStart: '',
  scheduledDate: '', // Date when this task should be scheduled
  categoryOverride: 'auto' as CategoryOverride
});

const isEditMode = computed(() => !!props.task);
const isValid = computed(
  () =>
    formState.title.trim().length > 0 &&
    Number.isFinite(formState.estimatedMinutes) &&
    formState.estimatedMinutes >= 5,
);

watch(
  () => props.modelValue,
  (next) => {
    if (next) {
      applyTask(props.task);
      advancedOpen.value = hasAdvancedValues.value;
      void catalogStore.loadCatalog();
      activeTab.value = 'create';
    } else {
      resetForm();
    }
  },
);

watch(
  () => props.task,
  (task) => {
    if (props.modelValue) {
      applyTask(task);
      advancedOpen.value = hasAdvancedValues.value;
    }
  },
  { deep: true },
);

const hasAdvancedValues = computed(() => {
  return (
    !!formState.fixedStart ||
    formState.categoryOverride !== 'auto'
  );
});

const categoryItems = computed(() => [
  { value: 'auto' as CategoryOverride, label: t('taskDrawer.autoCategory') },
  ...TASK_CATEGORIES.map((category) => ({
    value: category as CategoryOverride,
    label: t(getCategoryI18nKey(category as TaskCategory))
  }))
]);

function categoryLabel(category: TaskCategory | undefined | null) {
  if (!category) return '';
  return t(getCategoryI18nKey(category));
}

const minutesSuffix = computed(() => (locale.value === 'ru' ? 'мин' : 'min'));

function formatShortMinutes(minutes: number) {
  return `${minutes} ${minutesSuffix.value}`;
}

function applyTask(task: TaskRecord | null) {
  console.log('🎯 applyTask called - task:', task);
  console.log('🎯 applyTask - props.initialDate:', props.initialDate);
  
  formState.title = task?.title ?? '';
  formState.description = task?.description ?? '';
  formState.estimatedMinutes = task?.estimatedMinutes ?? 60;
  formState.priority = task?.priority ?? 0.5;
  formState.deadline = task?.deadline
    ? new Date(task.deadline).toISOString().slice(0, 16)
    : '';
  // Для fixedTime: преобразуем UTC время в локальное для отображения в datetime-local input
  // datetime-local input ожидает локальное время в формате "YYYY-MM-DDTHH:mm"
  // ВАЖНО: время сохранено как UTC, но на самом деле это локальное время пользователя
  // Поэтому мы интерпретируем UTC компоненты напрямую, без учета часового пояса
  if (task?.fixedTime?.start) {
    // Парсим ISO строку и извлекаем UTC компоненты напрямую
    // Например: "2025-12-03T15:00:00.000Z" -> "2025-12-03T15:00"
    const isoMatch = task.fixedTime.start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):/);
    if (isoMatch) {
      const [, year, month, day, hours, minutes] = isoMatch;
      formState.fixedStart = `${year}-${month}-${day}T${hours}:${minutes}`;
    } else {
      // Fallback: используем стандартное преобразование
      const fixedTimeDate = new Date(task.fixedTime.start);
      const year = fixedTimeDate.getUTCFullYear();
      const month = String(fixedTimeDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(fixedTimeDate.getUTCDate()).padStart(2, '0');
      const hours = String(fixedTimeDate.getUTCHours()).padStart(2, '0');
      const minutes = String(fixedTimeDate.getUTCMinutes()).padStart(2, '0');
      formState.fixedStart = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } else {
    formState.fixedStart = '';
  }
  
  // Set scheduledDate: use task's date, or initialDate for new tasks
  if (task?.scheduledDate) {
    formState.scheduledDate = new Date(task.scheduledDate).toISOString().slice(0, 10);
    console.log('🎯 Set scheduledDate from task:', formState.scheduledDate);
  } else if (props.initialDate) {
    formState.scheduledDate = new Date(props.initialDate).toISOString().slice(0, 10);
    console.log('🎯 Set scheduledDate from initialDate:', formState.scheduledDate);
  } else {
    formState.scheduledDate = '';
    console.log('🎯 No scheduledDate set');
  }
  
  formState.categoryOverride = task ? task.category : 'auto';
}

function resetForm() {
  formState.title = '';
  formState.description = '';
  formState.estimatedMinutes = 60;
  formState.priority = 0.5;
  formState.deadline = '';
  formState.fixedStart = '';
  formState.scheduledDate = '';
  formState.categoryOverride = 'auto';
  advancedOpen.value = false;
}

function closeDrawer() {
  resetForm();
  emit('update:modelValue', false);
}

function toIso(value: string | undefined) {
  return value && value.length > 0 ? new Date(value).toISOString() : undefined;
}

/**
 * Преобразует локальное время из datetime-local input в ISO строку UTC.
 * datetime-local input возвращает строку в формате "YYYY-MM-DDTHH:mm" без информации о часовом поясе.
 * Мы интерпретируем это как локальное время и сохраняем его как UTC (без сдвига часового пояса).
 * 
 * Например, если пользователь вводит "2025-12-03T15:00" в часовом поясе UTC+3,
 * мы сохраняем это как "2025-12-03T15:00:00.000Z" (не "2025-12-03T12:00:00.000Z").
 */
function toIsoFixedTime(value: string | undefined): string | undefined {
  if (!value || value.length === 0) return undefined;
  
  // Парсим строку в формате "YYYY-MM-DDTHH:mm"
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    // Если формат не совпадает, используем стандартное преобразование
    return new Date(value).toISOString();
  }
  
  const [, year, month, day, hours, minutes] = match;
  // Создаем UTC дату напрямую, интерпретируя введенное время как UTC
  const isoString = `${year}-${month}-${day}T${hours}:${minutes}:00.000Z`;
  return isoString;
}

function onSubmit() {
  if (!isValid.value) return;

  console.log('🔧 TaskDrawer onSubmit - formState.scheduledDate:', formState.scheduledDate);

  const payload: Partial<TaskBase> = {
    title: formState.title.trim(),
    description: formState.description.trim() || undefined,
    estimatedMinutes: formState.estimatedMinutes,
    priority: formState.priority,
    deadline: toIso(formState.deadline)
  };

  // Используем специальную функцию для fixedTime, чтобы правильно обработать часовой пояс
  const fixedStart = toIsoFixedTime(formState.fixedStart);
  if (fixedStart) {
    payload.fixedTime = { start: fixedStart };
    console.log('🔧 TaskDrawer - Converted fixedStart to:', fixedStart);
  }

  // Include scheduledDate if provided
  // Исправляем проблему с часовыми поясами: создаем дату как полночь UTC
  if (formState.scheduledDate) {
    // formState.scheduledDate в формате YYYY-MM-DD
    // Создаем ISO строку напрямую, чтобы избежать сдвига часовых поясов
    const dateStr = typeof formState.scheduledDate === 'string' 
      ? formState.scheduledDate 
      : formState.scheduledDate.toISOString().split('T')[0];
    payload.scheduledDate = `${dateStr}T00:00:00.000Z`;
    console.log('🔧 TaskDrawer - Converted scheduledDate to:', payload.scheduledDate);
  } else if (fixedStart) {
    // Если scheduledDate не указан, но есть fixedTime, устанавливаем scheduledDate на день fixedTime.start
    const fixedDate = new Date(fixedStart);
    const dateStr = fixedDate.toISOString().split('T')[0];
    payload.scheduledDate = `${dateStr}T00:00:00.000Z`;
    console.log('🔧 TaskDrawer - Set scheduledDate from fixedTime.start:', payload.scheduledDate);
  } else if (props.initialDate) {
    // Если scheduledDate не указан, используем initialDate (выбранный день)
    const dateStr = new Date(props.initialDate).toISOString().split('T')[0];
    payload.scheduledDate = `${dateStr}T00:00:00.000Z`;
    console.log('🔧 TaskDrawer - Set scheduledDate from initialDate:', payload.scheduledDate);
  } else {
    console.log('🔧 TaskDrawer - No scheduledDate in formState and no initialDate');
  }

  if (formState.categoryOverride !== 'auto') {
    payload.category = formState.categoryOverride;
  }

  console.log('🔧 TaskDrawer - Final payload:', payload);
  emit('save', payload);
}

function onDelete() {
  if (props.task) {
    emit('delete', props.task.id);
  }
}
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    width="420"
    class="task-drawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-toolbar flat>
      <v-toolbar-title class="text-subtitle-1 font-weight-medium">
        {{ isEditMode ? t('taskDrawer.editTask') : t('taskDrawer.newTask') }}
      </v-toolbar-title>
      <v-spacer />
      <v-btn icon @click="closeDrawer">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-toolbar>

    <v-tabs v-model="activeTab" bg-color="transparent" align-tabs="start">
      <v-tab value="create">{{ t('taskDrawer.tabCreate') }}</v-tab>
      <v-tab value="catalog">{{ t('taskDrawer.tabCatalog') }}</v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <v-window-item value="create">
        <v-form @submit.prevent="onSubmit" class="pa-4 d-flex flex-column ga-4">
          <v-text-field
            v-model="formState.title"
            :label="t('task.title')"
            variant="outlined"
            density="comfortable"
            autofocus
            required
          />

          <v-textarea
            v-model="formState.description"
            :label="t('task.description')"
            rows="2"
            auto-grow
            variant="outlined"
            density="comfortable"
          />

          <v-text-field
            v-model.number="formState.estimatedMinutes"
            :label="t('task.estimatedMinutes')"
            type="number"
            min="5"
            step="5"
            :suffix="minutesSuffix"
            variant="outlined"
            density="comfortable"
          />

          <div>
            <label class="text-caption text-medium-emphasis">
              {{ t('task.priority') }}
            </label>
            <v-slider
              v-model="formState.priority"
              class="mt-2"
              min="0"
              max="1"
              step="0.1"
              thumb-label
            />
          </div>

          <v-text-field
            v-model="formState.scheduledDate"
            :label="t('task.scheduledDate')"
            type="date"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-calendar"
          />

          <v-text-field
            v-model="formState.deadline"
            :label="t('task.deadline')"
            type="datetime-local"
            variant="outlined"
            density="comfortable"
          />

          <v-btn
            variant="tonal"
            color="primary"
            prepend-icon="mdi-tune"
            @click="advancedOpen = !advancedOpen"
          >
            {{ advancedOpen ? t('taskDrawer.hideAdvanced') : t('taskDrawer.showAdvanced') }}
          </v-btn>

          <v-expand-transition>
            <div v-if="advancedOpen" class="d-flex flex-column ga-3">
              <v-text-field
                v-model="formState.fixedStart"
                :label="t('task.fixedTime')"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />

              <v-select
                v-model="formState.categoryOverride"
                :items="categoryItems"
                item-title="label"
                item-value="value"
                :label="t('task.category')"
                variant="outlined"
                density="comfortable"
              />
            </div>
          </v-expand-transition>

          <div class="d-flex justify-end ga-3">
            <v-btn variant="text" @click="closeDrawer">
              {{ t('task.cancel') }}
            </v-btn>
            <v-btn color="primary" type="submit" :disabled="!isValid">
              {{ t('task.save') }}
            </v-btn>
            <v-btn
              v-if="isEditMode"
              color="error"
              variant="text"
              prepend-icon="mdi-delete"
              @click="onDelete"
            >
              {{ t('task.delete') }}
            </v-btn>
          </div>
        </v-form>
      </v-window-item>

      <v-window-item value="catalog">
        <v-list density="comfortable" class="pt-0">
          <v-list-subheader>{{ t('nav.previousTasks') }}</v-list-subheader>
          <v-skeleton-loader
            v-if="catalogStore.loading"
            type="list-item-two-line"
            class="mx-4"
          />
          <template v-else>
            <v-list-item
              v-for="entry in catalogStore.entries"
              :key="entry.id"
              @click="emit('reuse', entry.taskTemplate)"
            >
              <v-list-item-title>{{ entry.taskTemplate.title }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ formatShortMinutes(entry.taskTemplate.defaultMinutes) }} · {{ categoryLabel(entry.taskTemplate.category) }}
              </v-list-item-subtitle>
            </v-list-item>
            <div v-if="catalogStore.entries.length === 0" class="px-4 pb-4 text-caption text-medium-emphasis">
              {{ t('dashboard.noTemplates') }}
            </div>
          </template>
        </v-list>
      </v-window-item>
    </v-window>
  </v-navigation-drawer>
</template>

