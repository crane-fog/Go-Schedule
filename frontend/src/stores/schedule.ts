/* oxlint-disable one-var */
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
import {
  buildToggleDonePayload,
  buildToggleRecurringOccurrencePayload,
} from '@/utils/schedule-helpers'
import {
  expandSchedulesForDisplay,
  type ScheduleDisplayItem,
  type SortMode,
  type StatusFilter,
} from '@/utils/schedule-occurrences'

export type TypeFilter = 'all' | ScheduleTypeEnum

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

  const stats = computed(() => {
    const list = schedules.value
    const doneCount = list.filter((item) => item.done).length
    return {
      done: doneCount,
      oneTime: list.filter((item) => item.type === ScheduleTypeEnum.OneTime).length,
      pending: list.length - doneCount,
      recurring: list.filter((item) => item.type === ScheduleTypeEnum.Recurring).length,
      timeRange: list.filter((item) => item.type === ScheduleTypeEnum.TimeRange).length,
      total: list.length,
    }
  })

  function loadMoreOccurrences(): void {
    if (hasMoreInfinite.value) {
      visibleLimit.value += PAGE_STEP
    }
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

  async function addSchedule(payload: CreateScheduleRequest): Promise<void> {
    submitting.value = true
    try {
      await createScheduleItem(payload)
      await loadSchedules()
    } finally {
      submitting.value = false
    }
  }

  async function editSchedule(id: number, payload: UpdateScheduleRequest): Promise<void> {
    submitting.value = true
    try {
      await updateScheduleItem(id, payload)
      await loadSchedules()
    } finally {
      submitting.value = false
    }
  }

  async function toggleDone(entry: ScheduleDisplayItem): Promise<void> {
    const { schedule, occurrenceIndex } = entry
    if (schedule.type === ScheduleTypeEnum.Recurring) {
      if (occurrenceIndex !== undefined) {
        const payload = buildToggleRecurringOccurrencePayload(schedule, occurrenceIndex)
        await editSchedule(schedule.id, payload)
      }
      return
    }
    const payload = buildToggleDonePayload(schedule, !schedule.done)
    await editSchedule(schedule.id, payload)
  }

  async function removeSchedule(id: number): Promise<void> {
    submitting.value = true
    try {
      await deleteScheduleItem(id)
      await loadSchedules()
    } finally {
      submitting.value = false
    }
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
    schedules,
    searchQuery,
    sortMode,
    stats,
    statusFilter,
    submitting,
    toggleDone,
    typeFilter,
  }
})
