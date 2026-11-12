/* oxlint-disable one-var */
import { RecurrenceFrequencyEnum, ScheduleTypeEnum, type Recurrence, type Schedule } from '@/api'

export type SortMode = 'time' | 'priority'
export type StatusFilter = 'all' | 'pending' | 'done'

export interface ScheduleDisplayItem {
  key: string
  schedule: Schedule
  sortTimeMs: number
  occurrenceIso?: string | undefined
  occurrenceIndex?: number | undefined
  effectiveDone: boolean
}

export interface ExpandOptions {
  schedules: Schedule[]
  sortMode: SortMode
  statusFilter: StatusFilter
  visibleLimit: number
  completedOccurrences: ReadonlySet<string>
  nowMs?: number | undefined
}

export interface ExpandResult {
  items: ScheduleDisplayItem[]
  hasMore: boolean
}

export function makeOccurrenceKey(scheduleId: number, occurrenceIso: string): string {
  return `${scheduleId}@${occurrenceIso}`
}

function getDaysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate()
}

function parseTimeMs(iso: string | null | undefined): number {
  if (!iso) {
    return Number.MAX_SAFE_INTEGER
  }
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) {
    return Number.MAX_SAFE_INTEGER
  }
  return ms
}

function computeWeeklyDate(startDate: Date, step: number, rec: Recurrence): Date {
  const interval = Math.max(1, rec.interval ?? 1)
  const result = new Date(startDate)
  if (step === 0) {
    return result
  }
  result.setDate(result.getDate() + step * interval * 7)
  if (rec.day_of_week !== undefined && rec.day_of_week >= 0 && rec.day_of_week <= 6) {
    const diff = rec.day_of_week - result.getDay()
    result.setDate(result.getDate() + diff)
  }
  return result
}

function computeMonthlyDate(startDate: Date, step: number, rec: Recurrence): Date {
  if (step === 0) {
    return new Date(startDate)
  }
  const interval = Math.max(1, rec.interval ?? 1)
  const totalMonths = startDate.getMonth() + step * interval
  const targetYear = startDate.getFullYear() + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12
  let desiredDay = startDate.getDate()
  if (rec.day_of_month && rec.day_of_month > 0) {
    desiredDay = rec.day_of_month
  }
  const clampedDay = Math.min(desiredDay, getDaysInMonth(targetYear, targetMonth))
  return new Date(
    targetYear,
    targetMonth,
    clampedDay,
    startDate.getHours(),
    startDate.getMinutes(),
    startDate.getSeconds(),
    startDate.getMilliseconds(),
  )
}

function computeYearlyDate(startDate: Date, step: number, rec: Recurrence): Date {
  if (step === 0) {
    return new Date(startDate)
  }
  const interval = Math.max(1, rec.interval ?? 1)
  const targetYear = startDate.getFullYear() + step * interval
  let targetMonth = startDate.getMonth()
  if (rec.month && rec.month >= 1 && rec.month <= 12) {
    targetMonth = rec.month - 1
  }
  const clampedDay = Math.min(startDate.getDate(), getDaysInMonth(targetYear, targetMonth))
  return new Date(
    targetYear,
    targetMonth,
    clampedDay,
    startDate.getHours(),
    startDate.getMinutes(),
    startDate.getSeconds(),
    startDate.getMilliseconds(),
  )
}

function computeDateByFrequency(startDate: Date, step: number, rec: Recurrence): Date {
  const interval = Math.max(1, rec.interval ?? 1)
  if (rec.frequency === RecurrenceFrequencyEnum.Daily) {
    const daily = new Date(startDate)
    daily.setDate(daily.getDate() + step * interval)
    return daily
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Weekly) {
    return computeWeeklyDate(startDate, step, rec)
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Monthly) {
    return computeMonthlyDate(startDate, step, rec)
  }
  return computeYearlyDate(startDate, step, rec)
}

export function getOccurrenceDateAtStep(rec: Recurrence, step: number): Date | undefined {
  if (rec.count && rec.count > 0 && step >= rec.count) {
    return undefined
  }
  const startDate = new Date(rec.start_at)
  if (Number.isNaN(startDate.getTime())) {
    return undefined
  }
  const candidate = computeDateByFrequency(startDate, step, rec)
  if (rec.until) {
    const untilMs = new Date(rec.until).getTime()
    if (!Number.isNaN(untilMs) && candidate.getTime() > untilMs) {
      return undefined
    }
  }
  return candidate
}

function matchesStatus(effectiveDone: boolean, statusFilter: StatusFilter): boolean {
  if (statusFilter === 'pending') {
    return !effectiveDone
  }
  if (statusFilter === 'done') {
    return effectiveDone
  }
  return true
}

function toNonRecurringDisplayItem(item: Schedule): ScheduleDisplayItem {
  let timeIso = item.happen_time
  if (item.type === ScheduleTypeEnum.TimeRange) {
    timeIso = item.end_at ?? item.start_at
  }
  return {
    effectiveDone: item.done,
    key: `schedule-${item.id}`,
    schedule: item,
    sortTimeMs: parseTimeMs(timeIso),
  }
}

function findNextRecurringItem(
  item: Schedule,
  nowMs: number,
  completedOccurrences: ReadonlySet<string>,
): ScheduleDisplayItem {
  const rec = item.recurrence
  if (!rec) {
    return {
      effectiveDone: false,
      key: `schedule-${item.id}-next`,
      schedule: item,
      sortTimeMs: Number.MAX_SAFE_INTEGER,
    }
  }
  const nowMinuteMs = Math.floor(nowMs / 60_000) * 60_000
  let step = 0
  let lastValidDate: Date | undefined = undefined
  const maxSearchSteps = 5000
  while (step < maxSearchSteps) {
    const occDate = getOccurrenceDateAtStep(rec, step)
    if (!occDate) {
      break
    }
    lastValidDate = occDate
    if (occDate.getTime() >= nowMinuteMs) {
      const occIso = occDate.toISOString()
      return {
        effectiveDone: completedOccurrences.has(makeOccurrenceKey(item.id, occIso)),
        key: `schedule-${item.id}-next-${step + 1}`,
        occurrenceIndex: step + 1,
        occurrenceIso: occIso,
        schedule: item,
        sortTimeMs: occDate.getTime(),
      }
    }
    step += 1
  }
  let fallbackMs = parseTimeMs(rec.start_at)
  if (lastValidDate) {
    fallbackMs = lastValidDate.getTime()
  }
  const fallbackIso = lastValidDate?.toISOString() ?? rec.start_at
  return {
    effectiveDone: completedOccurrences.has(makeOccurrenceKey(item.id, fallbackIso)),
    key: `schedule-${item.id}-last`,
    occurrenceIndex: Math.max(1, step),
    occurrenceIso: fallbackIso,
    schedule: item,
    sortTimeMs: fallbackMs,
  }
}

export function compareByTime(left: ScheduleDisplayItem, right: ScheduleDisplayItem): number {
  if (left.sortTimeMs !== right.sortTimeMs) {
    return left.sortTimeMs - right.sortTimeMs
  }
  if (left.schedule.priority !== right.schedule.priority) {
    return right.schedule.priority - left.schedule.priority
  }
  return left.schedule.id - right.schedule.id
}

export function compareByPriority(left: ScheduleDisplayItem, right: ScheduleDisplayItem): number {
  if (left.schedule.priority !== right.schedule.priority) {
    return right.schedule.priority - left.schedule.priority
  }
  if (left.sortTimeMs !== right.sortTimeMs) {
    return left.sortTimeMs - right.sortTimeMs
  }
  return left.schedule.id - right.schedule.id
}

interface RecurringStepper {
  schedule: Schedule
  nextStep: number
  nextItem: ScheduleDisplayItem | undefined
}

function advanceStepper(
  stepper: RecurringStepper,
  statusFilter: StatusFilter,
  completedOccurrences: ReadonlySet<string>,
): void {
  const rec = stepper.schedule.recurrence
  if (!rec) {
    stepper.nextItem = undefined
    return
  }
  const maxSkip = 2000
  let skipped = 0
  while (skipped < maxSkip) {
    const step = stepper.nextStep
    stepper.nextStep += 1
    const occDate = getOccurrenceDateAtStep(rec, step)
    if (!occDate) {
      stepper.nextItem = undefined
      return
    }
    const occIso = occDate.toISOString()
    const effectiveDone = completedOccurrences.has(makeOccurrenceKey(stepper.schedule.id, occIso))
    if (matchesStatus(effectiveDone, statusFilter)) {
      stepper.nextItem = {
        effectiveDone,
        key: `schedule-${stepper.schedule.id}-occ-${step + 1}`,
        occurrenceIndex: step + 1,
        occurrenceIso: occIso,
        schedule: stepper.schedule,
        sortTimeMs: occDate.getTime(),
      }
      return
    }
    skipped += 1
  }
  stepper.nextItem = undefined
}

function pickEarliestStepper(steppers: RecurringStepper[]): RecurringStepper | undefined {
  let chosen: RecurringStepper | undefined = undefined
  for (const stepper of steppers) {
    if (stepper.nextItem) {
      if (!chosen || !chosen.nextItem || compareByTime(stepper.nextItem, chosen.nextItem) < 0) {
        chosen = stepper
      }
    }
  }
  return chosen
}

function toPriorityModeItem(
  item: Schedule,
  nowMs: number,
  completedOccurrences: ReadonlySet<string>,
): ScheduleDisplayItem {
  if (item.type === ScheduleTypeEnum.Recurring) {
    return findNextRecurringItem(item, nowMs, completedOccurrences)
  }
  return toNonRecurringDisplayItem(item)
}

function expandForPriorityMode(options: ExpandOptions, nowMs: number): ExpandResult {
  const result: ScheduleDisplayItem[] = []
  for (const item of options.schedules) {
    const displayItem = toPriorityModeItem(item, nowMs, options.completedOccurrences)
    if (matchesStatus(displayItem.effectiveDone, options.statusFilter)) {
      result.push(displayItem)
    }
  }
  result.sort(compareByPriority)
  return {
    hasMore: false,
    items: result,
  }
}

export function expandSchedulesForDisplay(options: ExpandOptions): ExpandResult {
  const nowMs = options.nowMs ?? Date.now()
  if (options.sortMode === 'priority') {
    return expandForPriorityMode(options, nowMs)
  }

  const collected: ScheduleDisplayItem[] = []
  const steppers: RecurringStepper[] = []

  for (const item of options.schedules) {
    if (item.type === ScheduleTypeEnum.Recurring) {
      const stepper: RecurringStepper = { nextItem: undefined, nextStep: 0, schedule: item }
      advanceStepper(stepper, options.statusFilter, options.completedOccurrences)
      if (stepper.nextItem) {
        steppers.push(stepper)
      }
    } else {
      const displayItem = toNonRecurringDisplayItem(item)
      if (matchesStatus(displayItem.effectiveDone, options.statusFilter)) {
        collected.push(displayItem)
      }
    }
  }

  const targetCount = Math.max(1, options.visibleLimit) + 1
  let generatedRecurring = 0
  while (generatedRecurring < targetCount) {
    const earliest = pickEarliestStepper(steppers)
    if (!earliest || !earliest.nextItem) {
      break
    }
    collected.push(earliest.nextItem)
    generatedRecurring += 1
    advanceStepper(earliest, options.statusFilter, options.completedOccurrences)
  }

  collected.sort(compareByTime)
  const hasActiveStepper = steppers.some((st) => Boolean(st.nextItem))
  const hasMore = collected.length > options.visibleLimit || hasActiveStepper

  return {
    hasMore,
    items: collected.slice(0, options.visibleLimit),
  }
}
