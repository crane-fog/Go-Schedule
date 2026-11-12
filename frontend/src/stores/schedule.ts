import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  ScheduleTypeEnum,
  type CreateScheduleRequest,
  type Schedule,
  type UpdateScheduleRequest,
} from '@/api'
import {
  createScheduleItem,
  deleteScheduleItem,
  extractErrorMessage,
  fetchSchedules,
  updateScheduleItem,
} from '@/api/client'
import type { ScheduleDisplayItem, SortMode, StatusFilter, TypeFilter } from '@/types/schedule'
import {
  buildToggleDonePayload,
  buildToggleRecurringOccurrencePayload,
} from '@/utils/schedule-form'
import { expandSchedulesForDisplay } from '@/utils/schedule-occurrences'

const INITIAL_LIMIT = 25
const PAGE_STEP = 20

function matchesTypeAndKeyword(item: Schedule, type: TypeFilter, keyword: string): boolean {
  if (type !== 'all' && item.type !== type) {
    return false
  }
  if (keyword && !item.title.toLowerCase().includes(keyword)) {
    return false
  }
  return true
}

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<Schedule[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | undefined>(undefined)

  const sortMode = ref<SortMode>('time')
  const statusFilter = ref<StatusFilter>('all')
  const typeFilter = ref<TypeFilter>('all')
  const searchQuery = ref('')
  const visibleLimit = ref(INITIAL_LIMIT)

  watch([sortMode, statusFilter, typeFilter, searchQuery], () => {
    visibleLimit.value = INITIAL_LIMIT
  })

  const baseMatchedSchedules = computed(() => {
    const keyword = searchQuery.value.trim().toLowerCase()
    return schedules.value.filter((item) => matchesTypeAndKeyword(item, typeFilter.value, keyword))
  })

  const expandResult = computed(() =>
    expandSchedulesForDisplay({
      schedules: baseMatchedSchedules.value,
      sortMode: sortMode.value,
      statusFilter: statusFilter.value,
      visibleLimit: visibleLimit.value,
    }),
  )

  const displayedSchedules = computed(() => expandResult.value.items)
  const hasMoreInfinite = computed(() => expandResult.value.hasMore)

  function loadMoreOccurrences(): void {
    if (hasMoreInfinite.value) {
      visibleLimit.value += PAGE_STEP
    }
  }

  function resetFilters(): void {
    statusFilter.value = 'all'
    typeFilter.value = 'all'
    searchQuery.value = ''
  }

  async function loadSchedules(): Promise<void> {
    loading.value = true
    error.value = undefined
    try {
      schedules.value = await fetchSchedules()
    } catch (err) {
      error.value = extractErrorMessage(err, '加载日程失败')
    } finally {
      loading.value = false
    }
  }

  async function runMutation(
    action: () => Promise<unknown>,
    fallbackMessage: string,
  ): Promise<boolean> {
    submitting.value = true
    error.value = undefined
    try {
      await action()
      await loadSchedules()
      return true
    } catch (err) {
      error.value = extractErrorMessage(err, fallbackMessage)
      return false
    } finally {
      submitting.value = false
    }
  }

  async function addSchedule(payload: CreateScheduleRequest): Promise<boolean> {
    return runMutation(() => createScheduleItem(payload), '创建失败')
  }

  async function editSchedule(id: number, payload: UpdateScheduleRequest): Promise<boolean> {
    return runMutation(() => updateScheduleItem(id, payload), '更新失败')
  }

  async function toggleDone(entry: ScheduleDisplayItem): Promise<boolean> {
    if (entry.rangeRole === 'start') {
      return false
    }
    const { schedule, occurrenceIndex } = entry
    if (schedule.type === ScheduleTypeEnum.Recurring) {
      if (occurrenceIndex === undefined) {
        return false
      }
      const payload = buildToggleRecurringOccurrencePayload(schedule, occurrenceIndex)
      return runMutation(() => updateScheduleItem(schedule.id, payload), '状态更新失败')
    }
    const payload = buildToggleDonePayload(schedule, !schedule.done)
    return runMutation(() => updateScheduleItem(schedule.id, payload), '状态更新失败')
  }

  async function removeSchedule(id: number): Promise<boolean> {
    return runMutation(() => deleteScheduleItem(id), '删除失败')
  }

  return {
    addSchedule,
    displayedSchedules,
    editSchedule,
    error,
    hasMoreInfinite,
    loadMoreOccurrences,
    loadSchedules,
    loading,
    removeSchedule,
    resetFilters,
    schedules,
    searchQuery,
    sortMode,
    statusFilter,
    submitting,
    toggleDone,
    typeFilter,
  }
})
