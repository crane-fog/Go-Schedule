import {
  RecurrenceFrequencyEnum,
  ScheduleTypeEnum,
  type CreateScheduleRequest,
  type Recurrence,
  type Schedule,
  type UpdateScheduleRequest,
} from '@/api'
import type { RecurrenceEndMode, ScheduleFormState } from '@/types/schedule'
import {
  dateToLocalInput,
  getCurrentDeviceTimezone,
  isoToLocalInput,
  localInputToIso,
} from './date-time'

const DEFAULT_RECURRENCE_COUNT = 10
const ONE_HOUR_MS = 60 * 60 * 1000

export function createDefaultFormState(): ScheduleFormState {
  const now = new Date()
  const nowLocal = dateToLocalInput(now)
  const nextHourLocal = dateToLocalInput(new Date(now.getTime() + ONE_HOUR_MS))

  return {
    completedIndices: [],
    count: DEFAULT_RECURRENCE_COUNT,
    description: '',
    done: false,
    endAtLocal: nextHourLocal,
    endMode: 'never',
    frequency: RecurrenceFrequencyEnum.Weekly,
    happenTimeLocal: nowLocal,
    interval: 1,
    priority: 0,
    recurrenceStartLocal: nowLocal,
    startAtLocal: nowLocal,
    title: '',
    type: ScheduleTypeEnum.OneTime,
    untilLocal: '',
  }
}

function detectEndMode(rec: Recurrence | null | undefined): RecurrenceEndMode {
  if (rec?.until) {
    return 'until'
  }
  if (rec?.count && rec.count > 0) {
    return 'count'
  }
  return 'never'
}

function positiveOrDefault(val: number | null | undefined, fallback: number): number {
  if (val && val > 0) {
    return val
  }
  return fallback
}

export function scheduleToFormState(item: Schedule): ScheduleFormState {
  const defaults = createDefaultFormState()
  const rec = item.recurrence

  return {
    ...defaults,
    completedIndices: [...(rec?.completed_indices ?? [])],
    count: positiveOrDefault(rec?.count, DEFAULT_RECURRENCE_COUNT),
    description: item.description ?? '',
    done: item.done,
    endAtLocal: isoToLocalInput(item.end_at) || defaults.endAtLocal,
    endMode: detectEndMode(rec),
    frequency: rec?.frequency ?? defaults.frequency,
    happenTimeLocal: isoToLocalInput(item.happen_time) || defaults.happenTimeLocal,
    interval: positiveOrDefault(rec?.interval, 1),
    priority: item.priority,
    recurrenceStartLocal: isoToLocalInput(rec?.start_at) || defaults.recurrenceStartLocal,
    startAtLocal: isoToLocalInput(item.start_at) || defaults.startAtLocal,
    title: item.title,
    type: item.type,
    untilLocal: isoToLocalInput(rec?.until),
  }
}

function validateTimeRangeForm(form: ScheduleFormState): string | undefined {
  const startIso = localInputToIso(form.startAtLocal)
  const endIso = localInputToIso(form.endAtLocal)
  if (!startIso || !endIso) {
    return '时间段日程必须填写开始时间和结束时间'
  }
  if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
    return '结束时间不能早于开始时间'
  }
  return undefined
}

function validateRecurringForm(form: ScheduleFormState): string | undefined {
  const startIso = localInputToIso(form.recurrenceStartLocal)
  if (!startIso) {
    return '周期日程必须填写首次开始时间'
  }
  if (!Number.isInteger(form.interval) || form.interval < 1) {
    return '重复间隔必须是大于等于 1 的整数'
  }
  if (form.endMode === 'until') {
    const untilIso = localInputToIso(form.untilLocal)
    if (!untilIso) {
      return '请选择重复截止时间'
    }
    if (new Date(untilIso).getTime() <= new Date(startIso).getTime()) {
      return '重复截止时间必须晚于首次开始时间'
    }
  }
  if (form.endMode === 'count' && (!Number.isInteger(form.count) || form.count < 1)) {
    return '重复次数必须是大于等于 1 的整数'
  }
  return undefined
}

export function validateScheduleForm(form: ScheduleFormState): string | undefined {
  if (!form.title.trim()) {
    return '请输入日程标题'
  }
  if (form.type === ScheduleTypeEnum.OneTime) {
    if (!localInputToIso(form.happenTimeLocal)) {
      return '单次日程必须选择发生时间'
    }
    return undefined
  }
  if (form.type === ScheduleTypeEnum.TimeRange) {
    return validateTimeRangeForm(form)
  }
  return validateRecurringForm(form)
}

function buildRecurrenceObject(form: ScheduleFormState): Recurrence {
  const rec: Recurrence = {
    frequency: form.frequency,
    interval: Math.max(1, Math.trunc(form.interval || 1)),
    start_at: localInputToIso(form.recurrenceStartLocal) ?? new Date().toISOString(),
    timezone: getCurrentDeviceTimezone(),
  }
  if (form.endMode === 'until') {
    rec.until = localInputToIso(form.untilLocal)
  } else if (form.endMode === 'count') {
    rec.count = Math.max(1, Math.trunc(form.count || 1))
  }
  if (form.completedIndices.length > 0) {
    rec.completed_indices = [...form.completedIndices]
  }
  return rec
}

export function buildCreatePayload(form: ScheduleFormState): CreateScheduleRequest {
  const trimmedDesc = form.description.trim()
  const base: CreateScheduleRequest = {
    description: trimmedDesc || undefined,
    priority: Math.trunc(form.priority || 0),
    title: form.title.trim(),
    type: form.type,
  }
  if (form.type === ScheduleTypeEnum.OneTime) {
    base.happen_time = localInputToIso(form.happenTimeLocal)
  } else if (form.type === ScheduleTypeEnum.TimeRange) {
    base.start_at = localInputToIso(form.startAtLocal)
    base.end_at = localInputToIso(form.endAtLocal)
  } else {
    base.recurrence = buildRecurrenceObject(form)
  }
  return base
}

export function buildUpdatePayload(form: ScheduleFormState): UpdateScheduleRequest {
  const created = buildCreatePayload(form)
  return {
    description: form.description.trim(),
    done: form.type !== ScheduleTypeEnum.Recurring && form.done,
    end_at: created.end_at,
    happen_time: created.happen_time,
    priority: created.priority ?? 0,
    recurrence: created.recurrence,
    start_at: created.start_at,
    title: created.title,
    type: created.type,
  }
}

function scheduleToUpdatePayload(
  item: Schedule,
  overrides: Partial<UpdateScheduleRequest> = {},
): UpdateScheduleRequest {
  return {
    description: item.description,
    done: item.done,
    end_at: item.end_at,
    happen_time: item.happen_time,
    priority: item.priority,
    recurrence: item.recurrence,
    start_at: item.start_at,
    title: item.title,
    type: item.type,
    ...overrides,
  }
}

export function buildToggleDonePayload(item: Schedule, nextDone: boolean): UpdateScheduleRequest {
  return scheduleToUpdatePayload(item, { done: nextDone })
}

function toggleIndexList(indices: number[] | undefined, target: number): number[] {
  const nextSet = new Set<number>(indices)
  if (nextSet.has(target)) {
    nextSet.delete(target)
  } else {
    nextSet.add(target)
  }
  return [...nextSet].toSorted((left, right) => left - right)
}

export function buildToggleRecurringOccurrencePayload(
  item: Schedule,
  occurrenceIndex: number,
): UpdateScheduleRequest {
  const currentRec = item.recurrence
  let nextRec: Recurrence | undefined = undefined
  if (currentRec) {
    nextRec = {
      ...currentRec,
      completed_indices: toggleIndexList(currentRec.completed_indices, occurrenceIndex),
    }
  }
  return scheduleToUpdatePayload(item, { recurrence: nextRec })
}
