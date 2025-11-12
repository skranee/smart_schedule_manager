import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createCatalogEntry, fetchCatalog } from '@/api/client';
import type { TaskCategory } from '@shared/types';

export interface CatalogEntry {
  id: string;
  taskTemplate: {
    title: string;
    defaultMinutes: number;
    defaultPriority: number;
    category: TaskCategory;
  };
  lastUsedAt: string;
  uses: number;
}

export const useCatalogStore = defineStore('catalog', () => {
  const entries = ref<CatalogEntry[]>([]);
  const loading = ref(false);

  async function loadCatalog() {
    loading.value = true;
    try {
      entries.value = await fetchCatalog();
    } finally {
      loading.value = false;
    }
  }

  async function upsertEntry(payload: CatalogEntry['taskTemplate']) {
    const entry = await createCatalogEntry(payload);
    const index = entries.value.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      entries.value.splice(index, 1, entry);
    } else {
      entries.value.unshift(entry);
    }
  }

  return {
    entries,
    loading,
    loadCatalog,
    upsertEntry
  };
});

