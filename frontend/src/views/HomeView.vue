<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { CreateScheduleRequest, Schedule, UpdateScheduleRequest } from '@/api'
import NoteBoard from '@/components/NoteBoard.vue'
import ScheduleCard from '@/components/ScheduleCard.vue'
import ScheduleFormModal from '@/components/ScheduleFormModal.vue'
import ScheduleToolbar from '@/components/ScheduleToolbar.vue'
import TimeRangeConnectors from '@/components/TimeRangeConnectors.vue'
import { DEFAULT_EDITOR_ZOOM } from '@/composables/use-editor-zoom'
import { useInfiniteScroll } from '@/composables/use-infinite-scroll'
import { useNoteStore } from '@/stores/note'
import { useScheduleStore } from '@/stores/schedule'
import { formatDateDivider, getDateGroupKey } from '@/utils/date-time'

type MainViewMode = 'schedules' | 'notes'

const store = useScheduleStore()
const noteStore = useNoteStore()

const activeView = ref<MainViewMode>('schedules')
const noteBoardRef = ref<InstanceType<typeof NoteBoard> | undefined>(undefined)
const noteEditorZoom = ref(DEFAULT_EDITOR_ZOOM)

const modalVisible = ref(false)
const editingSchedule = ref<Schedule | undefined>(undefined)
const sentinelRef = ref<HTMLElement | undefined>(undefined)
const scheduleListRef = ref<HTMLElement | undefined>(undefined)
const connectorGutterPx = ref(0)

const NARROW_SCREEN_QUERY = '(max-width: 768px)'
const isNarrowScreen = ref(false)
let narrowMediaQuery: MediaQueryList | undefined = undefined

function handleNarrowChange(event: MediaQueryListEvent): void {
  isNarrowScreen.value = event.matches
}

useInfiniteScroll({
  canLoadMore: () => activeView.value === 'schedules' && store.hasMoreInfinite,
  onLoadMore: () => store.loadMoreOccurrences(),
  sentinelRef,
})

async function switchMainView(mode: MainViewMode): Promise<void> {
  if (activeView.value === mode) {
    return
  }
  if (activeView.value === 'notes') {
    await noteBoardRef.value?.syncAndFlushActive()
  }
  activeView.value = mode
  if (mode === 'notes' && !noteStore.loaded) {
    await noteStore.loadNotes()
  }
}

function handleResetNoteZoom(): void {
  noteEditorZoom.value = DEFAULT_EDITOR_ZOOM
}

async function handleSaveActiveNote(): Promise<void> {
  await noteBoardRef.value?.syncAndFlushActive()
}

async function handleRefreshNotes(): Promise<void> {
  await noteBoardRef.value?.syncAndFlushActive()
  await noteStore.loadNotes()
}

async function handleCreateNote(): Promise<void> {
  await noteBoardRef.value?.syncAndFlushActive()
  await noteStore.createNote()
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (noteStore.hasUnsavedOrSaving) {
    event.preventDefault()
    event.returnValue = ''
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (activeView.value !== 'notes') {
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void handleSaveActiveNote()
  }
}

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
  if (await store.addSchedule(payload)) {
    closeModal()
  }
}

async function handleUpdate(id: number, payload: UpdateScheduleRequest): Promise<void> {
  if (await store.editSchedule(id, payload)) {
    closeModal()
  }
}

async function handleDelete(item: Schedule): Promise<void> {
  if (globalThis.confirm(`确定要删除日程「${item.title}」吗？`)) {
    await store.removeSchedule(item.id)
  }
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

onMounted(() => {
  if (typeof globalThis.matchMedia === 'function') {
    narrowMediaQuery = globalThis.matchMedia(NARROW_SCREEN_QUERY)
    isNarrowScreen.value = narrowMediaQuery.matches
    narrowMediaQuery.addEventListener('change', handleNarrowChange)
  }
  void store.loadSchedules()
  globalThis.addEventListener('beforeunload', handleBeforeUnload)
  globalThis.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  narrowMediaQuery?.removeEventListener('change', handleNarrowChange)
  globalThis.removeEventListener('beforeunload', handleBeforeUnload)
  globalThis.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <main class="schedule-page" :class="{ 'is-notes-view': activeView === 'notes' }">
    <!-- 顶部视图切换与操作栏 -->
    <header class="page-header">
      <div class="filter-tabs" role="tablist" aria-label="功能视图切换">
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'schedules'"
          class="tab-btn"
          :class="{ active: activeView === 'schedules' }"
          @click="switchMainView('schedules')"
        >
          日程列表
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'notes'"
          class="tab-btn"
          :class="{ active: activeView === 'notes' }"
          @click="switchMainView('notes')"
        >
          记事板
        </button>
      </div>

      <div v-if="activeView === 'schedules'" class="header-actions">
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

      <div v-else class="header-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :title="`重置编辑框缩放（当前 ${Math.round(noteEditorZoom * 100)}%）`"
          @click="handleResetNoteZoom"
        >
          重置缩放
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="noteStore.loading"
          @click="handleRefreshNotes"
        >
          {{ noteStore.loading ? '刷新中...' : '刷新记事' }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="noteStore.creating"
          @click="handleCreateNote"
        >
          {{ noteStore.creating ? '新建中...' : '+ 新建页签' }}
        </button>
      </div>
    </header>

    <template v-if="activeView === 'schedules'">
      <!-- 筛选、排序与搜索栏 -->
      <ScheduleToolbar
        v-model:sort-mode="store.sortMode"
        v-model:status-filter="store.statusFilter"
        v-model:type-filter="store.typeFilter"
        v-model:search-query="store.searchQuery"
      />

      <!-- 接口错误提示 -->
      <div v-if="store.error" class="notice-banner notice-error">
        <span>{{ store.error }}</span>
        <button type="button" class="btn btn-ghost" @click="store.loadSchedules()">重试</button>
      </div>

      <!-- 列表区域 -->
      <section>
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
          <button type="button" class="btn btn-secondary" @click="store.resetFilters()">
            重置筛选条件
          </button>
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
            :enabled="store.sortMode === 'time' && !isNarrowScreen"
            @gutter-change="connectorGutterPx = $event"
          />

          <template v-for="(entry, idx) in store.displayedSchedules" :key="entry.key">
            <div v-if="shouldShowDateDivider(idx)" class="date-divider">
              <span class="date-divider-text">{{ formatDateDivider(entry.sortTimeMs) }}</span>
            </div>
            <ScheduleCard
              :entry="entry"
              :busy="store.submitting"
              @toggle-done="store.toggleDone"
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
    </template>

    <NoteBoard v-else ref="noteBoardRef" v-model:zoom="noteEditorZoom" />
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

.schedule-page.is-notes-view {
  height: 100vh;
  height: 100dvh;
  min-height: 420px;
  padding-bottom: 1.5rem;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.65rem;
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
</style>
