import { RecurrenceFrequencyEnum, ScheduleTypeEnum, type Recurrence, type Schedule } from '@/api'
import {
  FREQUENCY_LABELS,
  FULL_WEEKDAY_LABELS,
  TYPE_LABELS,
  WEEKDAY_LABELS,
} from '@/constants/schedule'
import type { ScheduleDisplayItem, TimeRangeRole } from '@/types/schedule'
import { formatClockTime, formatDateTime, parseValidDate } from './date-time'

export function formatScheduleTypeBadge(
  schedule: Schedule,
  rangeRole?: TimeRangeRole,
): { badgeClass: string; label: string } {
  if (schedule.type === ScheduleTypeEnum.TimeRange && rangeRole) {
    let label = '时段结束'
    if (rangeRole === 'start') {
      label = '时段开始'
    }
    return {
      badgeClass: `type-time_range_${rangeRole}`,
      label,
    }
  }
  return {
    badgeClass: `type-${schedule.type}`,
    label: TYPE_LABELS[schedule.type] ?? schedule.type,
  }
}

export function formatSchedulePrimaryTime(entry: ScheduleDisplayItem): string {
  const { schedule } = entry
  if (schedule.type === ScheduleTypeEnum.OneTime) {
    return formatDateTime(schedule.happen_time)
  }
  if (schedule.type === ScheduleTypeEnum.TimeRange) {
    return `${formatDateTime(schedule.start_at)} ~ ${formatDateTime(schedule.end_at)}`
  }
  const baseTime = formatDateTime(entry.occurrenceIso)
  if (entry.occurrenceIndex) {
    return `${baseTime} #${entry.occurrenceIndex}`
  }
  return baseTime
}

function formatPeriodPrefix(
  frequency: RecurrenceFrequencyEnum,
  interval: number,
  compactMonthly = false,
): string {
  const unit = FREQUENCY_LABELS[frequency] ?? frequency
  if (interval > 1) {
    return `每 ${interval} ${unit}`
  }
  if (compactMonthly && frequency === RecurrenceFrequencyEnum.Monthly) {
    return '每月'
  }
  return `每${unit}`
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

function formatFrequencyWithDetail(rec: Recurrence): string {
  const interval = Math.max(1, rec.interval ?? 1)
  const prefix = formatPeriodPrefix(rec.frequency, interval)
  const startDate = parseValidDate(rec.start_at)
  if (!startDate) {
    return prefix
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Weekly) {
    const weekday = WEEKDAY_LABELS[startDate.getDay()] ?? ''
    if (interval > 1) {
      return `${prefix}${weekday}`
    }
    return `每${weekday}`
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Monthly) {
    return `${prefix} ${startDate.getDate()} 日`
  }
  if (rec.frequency === RecurrenceFrequencyEnum.Yearly) {
    return `${prefix} ${startDate.getMonth() + 1} 月 ${startDate.getDate()} 日`
  }
  return prefix
}

export function formatRecurrenceSummary(rec: Recurrence | null | undefined): string {
  if (!rec) {
    return '未配置重复规则'
  }
  return [formatFrequencyWithDetail(rec), formatRecurrenceEnd(rec)].filter(Boolean).join(' · ')
}

export function formatInferredRecurrenceHint(
  frequency: RecurrenceFrequencyEnum,
  interval: number,
  startLocal: string,
): string {
  const date = parseValidDate(startLocal.trim())
  if (!date) {
    return '请先选择首次发生时间'
  }
  const timeStr = formatClockTime(date)
  const normalizedInterval = Math.max(1, Math.trunc(interval || 1))
  const periodPrefix = formatPeriodPrefix(frequency, normalizedInterval, true)

  if (frequency === RecurrenceFrequencyEnum.Weekly) {
    const weekday = FULL_WEEKDAY_LABELS[date.getDay()] ?? ''
    return `将于${periodPrefix}的 ${weekday} ${timeStr} 发生`
  }
  if (frequency === RecurrenceFrequencyEnum.Monthly) {
    return `将于${periodPrefix}的 ${date.getDate()} 日 ${timeStr} 发生`
  }
  if (frequency === RecurrenceFrequencyEnum.Yearly) {
    return `将于${periodPrefix}的 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${timeStr} 发生`
  }
  return `将于${periodPrefix}的 ${timeStr} 发生`
}
