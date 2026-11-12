<script setup lang="ts">
import { SORT_MODE_OPTIONS, STATUS_FILTER_OPTIONS, TYPE_FILTER_OPTIONS } from '@/constants/schedule'
import type { SortMode, StatusFilter, TypeFilter } from '@/types/schedule'

const sortMode = defineModel<SortMode>('sortMode', { required: true })
const statusFilter = defineModel<StatusFilter>('statusFilter', { required: true })
const typeFilter = defineModel<TypeFilter>('typeFilter', { required: true })
const searchQuery = defineModel<string>('searchQuery', { required: true })
</script>

<template>
  <section class="toolbar">
    <div class="toolbar-left">
      <div class="filter-tabs" role="group" aria-label="排序方式">
        <button
          v-for="opt in SORT_MODE_OPTIONS"
          :key="opt.value"
          type="button"
          class="tab-btn"
          :class="{ active: sortMode === opt.value }"
          @click="sortMode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="filter-tabs" role="group" aria-label="状态筛选">
        <button
          v-for="opt in STATUS_FILTER_OPTIONS"
          :key="opt.value"
          type="button"
          class="tab-btn"
          :class="{ active: statusFilter === opt.value }"
          @click="statusFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="toolbar-right">
      <select v-model="typeFilter" class="filter-select" aria-label="按日程类型筛选">
        <option v-for="opt in TYPE_FILTER_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>

      <input
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="搜索日程标题..."
      />
    </div>
  </section>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.85rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.75rem 1rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.filter-tabs {
  display: flex;
  gap: 0.35rem;
  background: var(--surface-muted);
  padding: 0.25rem;
  border-radius: 8px;
}

.tab-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 0.38rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn.active {
  background: var(--card-bg);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.filter-select,
.search-input {
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.86rem;
  outline: none;
}

.search-input {
  min-width: 210px;
}

.filter-select:focus,
.search-input:focus {
  border-color: var(--primary-color);
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-right {
    width: 100%;
  }

  .search-input {
    flex: 1;
  }
}
</style>
