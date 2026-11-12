import type { RecurrenceFrequencyEnum, Schedule, ScheduleTypeEnum } from '@/api'

export type SortMode = 'time' | 'priority'
export type StatusFilter = 'all' | 'pending' | 'done'
export type TypeFilter = 'all' | ScheduleTypeEnum

export type TimeRangeRole = 'start' | 'end'
export type RecurrenceEndMode = 'never' | 'until' | 'count'

export interface ScheduleDisplayItem {
  key: string
  schedule: Schedule
  sortTimeMs: number
  occurrenceIso?: string | undefined
  occurrenceIndex?: number | undefined
  rangeRole?: TimeRangeRole | undefined
  effectiveDone: boolean
}

export interface ScheduleFormState {
  title: string
  description: string
  type: ScheduleTypeEnum
  priority: number
  done: boolean
  happenTimeLocal: string
  startAtLocal: string
  endAtLocal: string
  frequency: RecurrenceFrequencyEnum
  interval: number
  recurrenceStartLocal: string
  endMode: RecurrenceEndMode
  untilLocal: string
  count: number
  completedIndices: number[]
}
