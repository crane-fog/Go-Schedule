<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ScheduleTypeEnum,
  type CreateScheduleRequest,
  type Schedule,
  type UpdateScheduleRequest,
} from '@/api'
import { extractErrorMessage } from '@/api/client'
import ScheduleCard from '@/components/ScheduleCard.vue'
import ScheduleFormModal from '@/components/ScheduleFormModal.vue'
import TimeRangeConnectors from '@/components/TimeRangeConnectors.vue'
import { useScheduleStore } from '@/stores/schedule'
import { formatDateDivider, getDateGroupKey } from '@/utils/schedule-helpers'
import type { ScheduleDisplayItem } from '@/utils/schedule-occurrences'

const store = useScheduleStore()
const modalVisible = ref(false)
const editingSchedule = ref<Schedule | undefined>(undefined)
const sentinelRef = ref<HTMLElement | undefined>(undefined)
const scheduleListRef = ref<HTMLElement | undefined>(undefined)
const connectorGutterPx = ref(0)

let observer: IntersectionObserver | undefined = undefined

function openCreateModal(): void {
  editingSchedule.value = undefined
  modalVisible.value = true
}

function openEditModal(item: Schedule): void {
  editingSchedule.value = item
  modalVisible.value = true
}

function closeModal(): void {
  modalVisible.value = false
  editingSchedule.value = undefined
}

async function handleCreate(payload: CreateScheduleRequest): Promise<void> {
  try {
    await store.addSchedule(payload)
    closeModal()
  } catch (err) {
    store.error = extractErrorMessage(err, '创建失败')
  }
}

async function handleUpdate(id: number, payload: UpdateScheduleRequest): Promise<void> {
  try {
    await store.editSchedule(id, payload)
    closeModal()
  } catch (err) {
    store.error = extractErrorMessage(err, '更新失败')
  }
}

async function handleToggleDone(entry: ScheduleDisplayItem): Promise<void> {
  try {
    await store.toggleDone(entry)
  } catch (err) {
    store.error = extractErrorMessage(err, '状态更新失败')
  }
}

async function handleDelete(item: Schedule): Promise<void> {
  if (!globalThis.confirm(`确定要删除日程「${item.title}」吗？`)) {
    return
  }
  try {
    await store.removeSchedule(item.id)
  } catch (err) {
    store.error = extractErrorMessage(err, '删除失败')
  }
}

function resetFilters(): void {
  store.statusFilter = 'all'
  store.typeFilter = 'all'
  store.searchQuery = ''
}

function shouldShowDateDivider(idx: number): boolean {
  if (store.sortMode !== 'time') {
    return false
  }
  const current = store.displayedSchedules[idx]
  if (!current) {
    return false
  }
  if (idx === 0) {
    return true
  }
  const prev = store.displayedSchedules[idx - 1]
  if (!prev) {
    return true
  }
  return getDateGroupKey(current.sortTimeMs) !== getDateGroupKey(prev.sortTimeMs)
}

function checkSentinelInView(): void {
  if (!sentinelRef.value || !store.hasMoreInfinite) {
    return
  }
  const rect = sentinelRef.value.getBoundingClientRect()
  if (rect.top <= globalThis.innerHeight + 240) {
    store.loadMoreOccurrences()
  }
}

function setupObserver(): void {
  observer?.disconnect()
  if (typeof IntersectionObserver === 'undefined' || !sentinelRef.value) {
    return
  }
  observer = new IntersectionObserver(
    ([first]) => {
      if (first?.isIntersecting && store.hasMoreInfinite) {
        store.loadMoreOccurrences()
      }
    },
    { rootMargin: '240px 0px' },
  )
  observer.observe(sentinelRef.value)
}

watch(sentinelRef, () => {
  setupObserver()
})

onMounted(() => {
  void store.loadSchedules()
  setupObserver()
  globalThis.addEventListener('scroll', checkSentinelInView, { passive: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  globalThis.removeEventListener('scroll', checkSentinelInView)
})
</script>

<template>
  <main class="schedule-page">
    <!-- 顶部标题栏 -->
    <header class="page-header">
      <div class="header-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="store.loading"
          @click="store.loadSchedules()"
        >
          {{ store.loading ? '刷新中...' : '刷新列表' }}
        </button>
        <button type="button" class="btn btn-primary" @click="openCreateModal">+ 新建日程</button>
      </div>
    </header>

    <!-- 筛选、排序与搜索栏 -->
    <section class="toolbar">
      <div class="toolbar-left">
        <div class="filter-tabs" role="group" aria-label="排序方式">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: store.sortMode === 'time' }"
            @click="store.sortMode = 'time'"
          >
            按时间排序
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: store.sortMode === 'priority' }"
            @click="store.sortMode = 'priority'"
          >
            按优先级排序
          </button>
        </div>

        <div class="filter-tabs" role="group" aria-label="状态筛选">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: store.statusFilter === 'all' }"
            @click="store.statusFilter = 'all'"
          >
            全部
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: store.statusFilter === 'pending' }"
            @click="store.statusFilter = 'pending'"
          >
            待办
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: store.statusFilter === 'done' }"
            @click="store.statusFilter = 'done'"
          >
            已完成
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <select v-model="store.typeFilter" class="filter-select" aria-label="按日程类型筛选">
          <option value="all">全部类型</option>
          <option :value="ScheduleTypeEnum.OneTime">单词</option>
          <option :value="ScheduleTypeEnum.TimeRange">时段</option>
          <option :value="ScheduleTypeEnum.Recurring">周期</option>
        </select>

        <input
          v-model="store.searchQuery"
          type="search"
          class="search-input"
          placeholder="搜索日程标题..."
        />
      </div>
    </section>

    <!-- 接口错误提示 -->
    <div v-if="store.error" class="notice-banner notice-error">
      <span>{{ store.error }}</span>
      <button type="button" class="btn btn-ghost" @click="store.loadSchedules()">重试</button>
    </div>

    <!-- 列表区域 -->
    <section class="schedule-list-section">
      <div v-if="store.loading && store.schedules.length === 0" class="state-box">
        <p>正在加载日程数据...</p>
      </div>

      <div v-else-if="store.schedules.length === 0" class="state-box">
        <p class="state-title">暂无任何日程</p>
        <p class="state-desc">点击右上角「新建日程」创建你的第一条日程安排吧。</p>
        <button type="button" class="btn btn-primary" @click="openCreateModal">
          + 新建第一条日程
        </button>
      </div>

      <div v-else-if="store.displayedSchedules.length === 0" class="state-box">
        <p class="state-title">没有符合当前筛选条件的日程</p>
        <button type="button" class="btn btn-secondary" @click="resetFilters">重置筛选条件</button>
      </div>

      <div
        v-else
        ref="scheduleListRef"
        class="schedule-list"
        :style="{ '--connector-gutter': `${connectorGutterPx}px` }"
      >
        <TimeRangeConnectors
          :entries="store.displayedSchedules"
          :list-el="scheduleListRef"
          :enabled="store.sortMode === 'time'"
          @gutter-change="connectorGutterPx = $event"
        />

        <template v-for="(entry, idx) in store.displayedSchedules" :key="entry.key">
          <div v-if="shouldShowDateDivider(idx)" class="date-divider">
            <span class="date-divider-text">{{ formatDateDivider(entry.sortTimeMs) }}</span>
          </div>
          <ScheduleCard
            :entry="entry"
            :busy="store.submitting"
            @toggle-done="handleToggleDone"
            @edit="openEditModal"
            @remove="handleDelete"
          />
        </template>

        <div v-if="store.hasMoreInfinite" ref="sentinelRef" class="infinite-sentinel">
          <span class="infinite-hint">下滑自动展开更多周期重复日程...</span>
          <button type="button" class="btn btn-ghost" @click="store.loadMoreOccurrences()">
            加载更多
          </button>
        </div>
      </div>
    </section>

    <!-- 新建/编辑弹窗 -->
    <ScheduleFormModal
      :visible="modalVisible"
      :editing-item="editingSchedule"
      :submitting="store.submitting"
      @close="closeModal"
      @create="handleCreate"
      @update="handleUpdate"
    />
  </main>
</template>

<style scoped>
.schedule-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-title {
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: 0.2rem;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-left: auto;
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.95rem 1.15rem;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-breakdown {
  font-size: 1.2rem;
}

.text-primary {
  color: var(--primary-color);
}

.text-success {
  color: var(--success-color);
}

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

.notice-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 0.88rem;
}

.notice-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #dc2626;
}

.schedule-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (max-width: 1120px) {
  .schedule-list {
    margin-left: var(--connector-gutter, 0px);
  }
}

.date-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 0.15rem 0.1rem;
}

.date-divider:first-child {
  margin-top: 0;
}

.date-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.date-divider-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}

.infinite-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.state-box {
  background: var(--card-bg);
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  padding: 3rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
}

.state-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}

.state-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
  margin-bottom: 0.35rem;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

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
