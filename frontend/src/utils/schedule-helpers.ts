import {
  RecurrenceFrequencyEnum,
  ScheduleTypeEnum,
  type CreateScheduleRequest,
  type Recurrence,
  type Schedule,
  type UpdateScheduleRequest,
} from '@/api'

export type RecurrenceEndMode = 'never' | 'until' | 'count'

export interface ScheduleFormState {
  title: string
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
  dayOfWeek: number
  dayOfMonth: number
  month: number
  timezone: string
}

export const TYPE_LABELS: Record<ScheduleTypeEnum, string> = {
    one_time: '单次',
    recurring: '周期',
    time_range: '时段',
  },
  FREQUENCY_LABELS: Record<RecurrenceFrequencyEnum, string> = {
    daily: '天',
    monthly: '个月',
    weekly: '周',
    yearly: '年',
  },
  WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const,
  FULL_WEEKDAY_LABELS = [
    '星期日',
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
  ] as const

function padTwo(num: number): string {
  return String(num).padStart(2, '0')
}

export function dateToLocalInput(date: Date): string {
  const year = date.getFullYear(),
    month = padTwo(date.getMonth() + 1),
    day = padTwo(date.getDate()),
    hours = padTwo(date.getHours()),
    minutes = padTwo(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return dateToLocalInput(date)
}

export function localInputToIso(localValue: string): string | undefined {
  const trimmed = localValue.trim(),
    date = new Date(trimmed)
  if (!trimmed || Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString()
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '未设置'
  }
  const date = new Date(iso),
    year = date.getFullYear(),
    month = padTwo(date.getMonth() + 1),
    day = padTwo(date.getDate()),
    hours = padTwo(date.getHours()),
    minutes = padTwo(date.getMinutes())
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function getDateGroupKey(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs === Number.MAX_SAFE_INTEGER) {
    return 'unknown'
  }
  const date = new Date(timeMs)
  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function formatDateDivider(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs === Number.MAX_SAFE_INTEGER) {
    return '未设置日期'
  }
  const date = new Date(timeMs),
    month = date.getMonth() + 1,
    day = date.getDate(),
    weekday = FULL_WEEKDAY_LABELS[date.getDay()] ?? ''
  if (Number.isNaN(date.getTime())) {
    return '未设置日期'
  }
  return `${month}月${day}日 ${weekday}`
}

export function getPriorityMeta(priority: number): { label: string; level: string } {
  const label = `优先级 ${priority}`
  if (priority >= 2) {
    return { label, level: 'urgent' }
  }
  if (priority === 1) {
    return { label, level: 'high' }
  }
  if (priority === 0) {
    return { label, level: 'medium' }
  }
  return { label, level: 'normal' }
}

function formatRecurrenceDetail(rec: Recurrence): string {
  if (rec.frequency === RecurrenceFrequencyEnum.Weekly && rec.day_of_week !== undefined) {
    return WEEKDAY_LABELS[rec.day_of_week] ?? ''
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Monthly && rec.day_of_month) {
    return `每月 ${rec.day_of_month} 日`
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Yearly && rec.month) {
    return `每年 ${rec.month} 月`
  }
  return ''
}

function formatRecurrenceEnd(rec: Recurrence): string {
  if (rec.until) {
    return `截止至 ${formatDateTime(rec.until)}`
  }
  if (rec.count && rec.count > 0) {
    return `共 ${rec.count} 次`
  }
  return '长期有效'
}

function formatFrequencyText(rec: Recurrence): string {
  const unit = FREQUENCY_LABELS[rec.frequency] ?? rec.frequency
  if (rec.interval && rec.interval > 1) {
    return `每 ${rec.interval} ${unit}`
  }
  return `每${unit}`
}

export function formatRecurrenceSummary(rec: Recurrence | null | undefined): string {
  if (!rec) {
    return '未配置重复规则'
  }
  const parts = [formatFrequencyText(rec), formatRecurrenceDetail(rec), formatRecurrenceEnd(rec)]
  return parts.filter(Boolean).join(' · ')
}

export function createDefaultFormState(): ScheduleFormState {
  const now = new Date(),
    nextHour = new Date(now.getTime() + 60 * 60 * 1000),
    defaultTz = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

  return {
    count: 10,
    dayOfMonth: now.getDate(),
    dayOfWeek: now.getDay(),
    done: false,
    endAtLocal: dateToLocalInput(nextHour),
    endMode: 'never',
    frequency: RecurrenceFrequencyEnum.Weekly,
    happenTimeLocal: dateToLocalInput(now),
    interval: 1,
    month: now.getMonth() + 1,
    priority: 0,
    recurrenceStartLocal: dateToLocalInput(now),
    startAtLocal: dateToLocalInput(now),
    timezone: defaultTz,
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
  const defaults = createDefaultFormState(),
    rec = item.recurrence

  return {
    ...defaults,
    count: positiveOrDefault(rec?.count, 10),
    dayOfMonth: positiveOrDefault(rec?.day_of_month, defaults.dayOfMonth),
    dayOfWeek: rec?.day_of_week ?? defaults.dayOfWeek,
    done: item.done,
    endAtLocal: isoToLocalInput(item.end_at) || defaults.endAtLocal,
    endMode: detectEndMode(rec),
    frequency: rec?.frequency ?? defaults.frequency,
    happenTimeLocal: isoToLocalInput(item.happen_time) || defaults.happenTimeLocal,
    interval: positiveOrDefault(rec?.interval, 1),
    month: positiveOrDefault(rec?.month, defaults.month),
    priority: item.priority,
    recurrenceStartLocal: isoToLocalInput(rec?.start_at) || defaults.recurrenceStartLocal,
    startAtLocal: isoToLocalInput(item.start_at) || defaults.startAtLocal,
    timezone: rec?.timezone || defaults.timezone,
    title: item.title,
    type: item.type,
    untilLocal: isoToLocalInput(rec?.until),
  }
}

function validateTimeRangeForm(form: ScheduleFormState): string | undefined {
  const startIso = localInputToIso(form.startAtLocal),
    endIso = localInputToIso(form.endAtLocal)
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
  const startIso = localInputToIso(form.recurrenceStartLocal) ?? new Date().toISOString(),
    rec: Recurrence = {
      frequency: form.frequency,
      interval: Math.max(1, Math.trunc(form.interval || 1)),
      start_at: startIso,
      timezone: form.timezone.trim() || 'UTC',
    }
  if (form.endMode === 'until') {
    rec.until = localInputToIso(form.untilLocal)
  } else if (form.endMode === 'count') {
    rec.count = Math.max(1, Math.trunc(form.count || 1))
  }
  if (form.frequency === RecurrenceFrequencyEnum.Weekly) {
    rec.day_of_week = Math.min(6, Math.max(0, Math.trunc(form.dayOfWeek)))
  } else if (form.frequency === RecurrenceFrequencyEnum.Monthly) {
    rec.day_of_month = Math.min(31, Math.max(1, Math.trunc(form.dayOfMonth)))
  } else if (form.frequency === RecurrenceFrequencyEnum.Yearly) {
    rec.month = Math.min(12, Math.max(1, Math.trunc(form.month)))
  }
  return rec
}

export function buildCreatePayload(form: ScheduleFormState): CreateScheduleRequest {
  const base: CreateScheduleRequest = {
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
    done: form.type === ScheduleTypeEnum.TimeRange && form.done,
    end_at: created.end_at,
    happen_time: created.happen_time,
    priority: created.priority ?? 0,
    recurrence: created.recurrence,
    start_at: created.start_at,
    title: created.title,
    type: created.type,
  }
}

export function buildToggleDonePayload(item: Schedule, nextDone: boolean): UpdateScheduleRequest {
  return {
    done: nextDone,
    end_at: item.end_at,
    happen_time: item.happen_time,
    priority: item.priority,
    recurrence: item.recurrence,
    start_at: item.start_at,
    title: item.title,
    type: item.type,
  }
}
