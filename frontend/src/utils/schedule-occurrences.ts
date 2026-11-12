import { RecurrenceFrequencyEnum, ScheduleTypeEnum, type Recurrence, type Schedule } from '@/api'
import type { ScheduleDisplayItem, SortMode, StatusFilter, TimeRangeRole } from '@/types/schedule'
import { parseTimeMs, parseValidDate } from './date-time'

export interface ExpandOptions {
  schedules: Schedule[]
  sortMode: SortMode
  statusFilter: StatusFilter
  visibleLimit: number
  nowMs?: number | undefined
}

export interface ExpandResult {
  items: ScheduleDisplayItem[]
  hasMore: boolean
}

interface ZonedWallTime {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

const WEEKDAY_SHORT_MAP: Record<string, number> = {
  Fri: 5,
  Mon: 1,
  Sat: 6,
  Sun: 0,
  Thu: 4,
  Tue: 2,
  Wed: 3,
}

const ZONED_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  weekday: 'short',
  year: 'numeric',
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function createZonedFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { ...ZONED_FORMAT_OPTIONS, timeZone })
  } catch {
    return new Intl.DateTimeFormat('en-US', ZONED_FORMAT_OPTIONS)
  }
}

function getZonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) {
    return cached
  }
  const formatter = createZonedFormatter(timeZone)
  formatterCache.set(timeZone, formatter)
  return formatter
}

function extractZonedWallTime(date: Date, timeZone: string): ZonedWallTime {
  const parts = getZonedFormatter(timeZone).formatToParts(date)
  let year = 1970
  let month = 1
  let day = 1
  let weekday = 0
  let hour = 0
  let minute = 0
  let second = 0
  for (const part of parts) {
    if (part.type === 'year') {
      year = Number(part.value)
    } else if (part.type === 'month') {
      month = Number(part.value)
    } else if (part.type === 'day') {
      day = Number(part.value)
    } else if (part.type === 'weekday') {
      weekday = WEEKDAY_SHORT_MAP[part.value] ?? 0
    } else if (part.type === 'hour') {
      hour = Number(part.value) % 24
    } else if (part.type === 'minute') {
      minute = Number(part.value)
    } else if (part.type === 'second') {
      second = Number(part.value)
    }
  }
  return {
    day,
    hour,
    millisecond: date.getUTCMilliseconds(),
    minute,
    month,
    second,
    weekday,
    year,
  }
}

function wallToUtcMs(wall: ZonedWallTime): number {
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  )
}

function getOffsetMsAtInstant(instantMs: number, timeZone: string): number {
  const wall = extractZonedWallTime(new Date(instantMs), timeZone)
  return wallToUtcMs(wall) - instantMs
}

function zonedWallTimeToDate(wall: ZonedWallTime, timeZone: string): Date {
  const utcGuess = wallToUtcMs(wall)
  const firstPassMs = utcGuess - getOffsetMsAtInstant(utcGuess, timeZone)
  const secondOffset = getOffsetMsAtInstant(firstPassMs, timeZone)
  return new Date(utcGuess - secondOffset)
}

function getDaysInMonth(year: number, monthOneBased: number): number {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate()
}

function shiftWallByDays(startWall: ZonedWallTime, dayDelta: number): ZonedWallTime {
  const utcDate = new Date(Date.UTC(startWall.year, startWall.month - 1, startWall.day + dayDelta))
  return {
    ...startWall,
    day: utcDate.getUTCDate(),
    month: utcDate.getUTCMonth() + 1,
    weekday: utcDate.getUTCDay(),
    year: utcDate.getUTCFullYear(),
  }
}

function shiftWallByMonths(startWall: ZonedWallTime, monthDelta: number): ZonedWallTime {
  const totalMonths = startWall.month - 1 + monthDelta
  const targetYear = startWall.year + Math.floor(totalMonths / 12)
  const targetMonth = (((totalMonths % 12) + 12) % 12) + 1
  const clampedDay = Math.min(startWall.day, getDaysInMonth(targetYear, targetMonth))
  return {
    ...startWall,
    day: clampedDay,
    month: targetMonth,
    year: targetYear,
  }
}

function computeWallByFrequency(
  startWall: ZonedWallTime,
  step: number,
  rec: Recurrence,
): ZonedWallTime {
  const units = step * Math.max(1, rec.interval ?? 1)
  if (rec.frequency === RecurrenceFrequencyEnum.Daily) {
    return shiftWallByDays(startWall, units)
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Weekly) {
    return shiftWallByDays(startWall, units * 7)
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Monthly) {
    return shiftWallByMonths(startWall, units)
  }
  return shiftWallByMonths(startWall, units * 12)
}

function getOccurrenceDateAtStep(rec: Recurrence, step: number): Date | undefined {
  if (rec.count && rec.count > 0 && step >= rec.count) {
    return undefined
  }
  const startDate = parseValidDate(rec.start_at)
  if (!startDate) {
    return undefined
  }
  let candidate = startDate
  if (step > 0) {
    const timeZone = rec.timezone || 'UTC'
    const startWall = extractZonedWallTime(startDate, timeZone)
    const targetWall = computeWallByFrequency(startWall, step, rec)
    candidate = zonedWallTimeToDate(targetWall, timeZone)
  }
  if (rec.until) {
    const untilDate = parseValidDate(rec.until)
    if (untilDate && candidate.getTime() > untilDate.getTime()) {
      return undefined
    }
  }
  return candidate
}

function getCompletedIndexSet(rec: Recurrence | null | undefined): ReadonlySet<number> {
  return new Set<number>(rec?.completed_indices)
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
  let rangeRole: TimeRangeRole | undefined = undefined
  if (item.type === ScheduleTypeEnum.TimeRange) {
    timeIso = item.end_at ?? item.start_at
    rangeRole = 'end'
  }
  return {
    effectiveDone: item.done,
    key: `schedule-${item.id}`,
    rangeRole,
    schedule: item,
    sortTimeMs: parseTimeMs(timeIso),
  }
}

function toTimeRangeStartDisplayItem(item: Schedule): ScheduleDisplayItem {
  return {
    effectiveDone: item.done,
    key: `schedule-${item.id}-start`,
    rangeRole: 'start',
    schedule: item,
    sortTimeMs: parseTimeMs(item.start_at),
  }
}

function findNextRecurringItem(item: Schedule, nowMs: number): ScheduleDisplayItem {
  const rec = item.recurrence
  if (!rec) {
    return {
      effectiveDone: false,
      key: `schedule-${item.id}-next`,
      schedule: item,
      sortTimeMs: Number.MAX_SAFE_INTEGER,
    }
  }
  const completedSet = getCompletedIndexSet(rec)
  const nowMinuteMs = Math.floor(nowMs / 60_000) * 60_000
  const maxSearchSteps = 5000
  let step = 0
  let lastValidDate: Date | undefined = undefined

  while (step < maxSearchSteps) {
    const occDate = getOccurrenceDateAtStep(rec, step)
    if (!occDate) {
      break
    }
    lastValidDate = occDate
    if (occDate.getTime() >= nowMinuteMs) {
      const occIndex = step + 1
      return {
        effectiveDone: completedSet.has(occIndex),
        key: `schedule-${item.id}-next-${occIndex}`,
        occurrenceIndex: occIndex,
        occurrenceIso: occDate.toISOString(),
        schedule: item,
        sortTimeMs: occDate.getTime(),
      }
    }
    step += 1
  }

  const fallbackIndex = Math.max(1, step)
  return {
    effectiveDone: completedSet.has(fallbackIndex),
    key: `schedule-${item.id}-last`,
    occurrenceIndex: fallbackIndex,
    occurrenceIso: lastValidDate?.toISOString() ?? rec.start_at,
    schedule: item,
    sortTimeMs: lastValidDate?.getTime() ?? parseTimeMs(rec.start_at),
  }
}

function compareByTime(left: ScheduleDisplayItem, right: ScheduleDisplayItem): number {
  if (left.sortTimeMs !== right.sortTimeMs) {
    return left.sortTimeMs - right.sortTimeMs
  }
  if (left.schedule.priority !== right.schedule.priority) {
    return right.schedule.priority - left.schedule.priority
  }
  return left.schedule.id - right.schedule.id
}

function compareByPriority(left: ScheduleDisplayItem, right: ScheduleDisplayItem): number {
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
  completedSet: ReadonlySet<number>
  nextStep: number
  nextItem: ScheduleDisplayItem | undefined
}

function advanceStepper(stepper: RecurringStepper, statusFilter: StatusFilter): void {
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
    const occIndex = step + 1
    const effectiveDone = stepper.completedSet.has(occIndex)
    if (matchesStatus(effectiveDone, statusFilter)) {
      stepper.nextItem = {
        effectiveDone,
        key: `schedule-${stepper.schedule.id}-occ-${occIndex}`,
        occurrenceIndex: occIndex,
        occurrenceIso: occDate.toISOString(),
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
    if (
      stepper.nextItem &&
      (!chosen?.nextItem || compareByTime(stepper.nextItem, chosen.nextItem) < 0)
    ) {
      chosen = stepper
    }
  }
  return chosen
}

function toPriorityModeItem(item: Schedule, nowMs: number): ScheduleDisplayItem {
  if (item.type === ScheduleTypeEnum.Recurring) {
    return findNextRecurringItem(item, nowMs)
  }
  return toNonRecurringDisplayItem(item)
}

function expandForPriorityMode(options: ExpandOptions, nowMs: number): ExpandResult {
  const items: ScheduleDisplayItem[] = []
  for (const item of options.schedules) {
    const displayItem = toPriorityModeItem(item, nowMs)
    if (matchesStatus(displayItem.effectiveDone, options.statusFilter)) {
      items.push(displayItem)
    }
  }
  items.sort(compareByPriority)
  return {
    hasMore: false,
    items,
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
      const stepper: RecurringStepper = {
        completedSet: getCompletedIndexSet(item.recurrence),
        nextItem: undefined,
        nextStep: 0,
        schedule: item,
      }
      advanceStepper(stepper, options.statusFilter)
      if (stepper.nextItem) {
        steppers.push(stepper)
      }
    } else {
      if (
        item.type === ScheduleTypeEnum.TimeRange &&
        item.start_at &&
        matchesStatus(item.done, options.statusFilter)
      ) {
        collected.push(toTimeRangeStartDisplayItem(item))
      }
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
    if (!earliest?.nextItem) {
      break
    }
    collected.push(earliest.nextItem)
    generatedRecurring += 1
    advanceStepper(earliest, options.statusFilter)
  }

  collected.sort(compareByTime)
  const hasActiveStepper = steppers.some((st) => Boolean(st.nextItem))
  const hasMore = collected.length > options.visibleLimit || hasActiveStepper

  return {
    hasMore,
    items: collected.slice(0, options.visibleLimit),
  }
}
