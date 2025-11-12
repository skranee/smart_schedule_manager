<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  profile: {
    sleepStart: string;
    sleepEnd: string;
    workStart: string;
    workEnd: string;
    preferredDailyMinutes: number;
    locale: 'en' | 'ru';
  } | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', payload: {
    sleepStart: string;
    sleepEnd: string;
    workStart: string;
    workEnd: string;
    preferredDailyMinutes: number;
    locale: 'en' | 'ru';
  }): void;
}>();

const { t } = useI18n();

const formState = reactive({
  sleepStart: '23:00',
  sleepEnd: '07:00',
  workStart: '09:00',
  workEnd: '17:00',
  preferredDailyMinutes: 480,
  locale: 'en' as 'en' | 'ru'
});

watch(
  () => props.profile,
  (next) => {
    if (next) {
      formState.sleepStart = next.sleepStart;
      formState.sleepEnd = next.sleepEnd;
      formState.workStart = next.workStart;
      formState.workEnd = next.workEnd;
      formState.preferredDailyMinutes = next.preferredDailyMinutes;
      formState.locale = next.locale;
    }
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

function submit() {
  emit('save', { ...formState });
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="520"
  >
    <v-card>
      <v-card-title class="font-weight-medium">
        Preferences
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="formState.sleepStart"
              label="Sleep start"
              type="time"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="formState.sleepEnd"
              label="Sleep end"
              type="time"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
        </v-row>

        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="formState.workStart"
              label="Work window start"
              type="time"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="formState.workEnd"
              label="Work window end"
              type="time"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
        </v-row>

        <v-text-field
          v-model.number="formState.preferredDailyMinutes"
          label="Preferred daily workload (minutes)"
          type="number"
          min="60"
          max="960"
          variant="outlined"
          density="comfortable"
          class="mb-4"
        />

        <v-select
          v-model="formState.locale"
          :items="[
            { value: 'en', title: 'English' },
            { value: 'ru', title: 'Русский' }
          ]"
          label="Language"
          variant="outlined"
          density="comfortable"
        />
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="close">
          {{ t('task.cancel') }}
        </v-btn>
        <v-btn color="primary" :loading="saving" @click="submit">
          {{ t('task.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

