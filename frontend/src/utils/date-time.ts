import { FULL_WEEKDAY_LABELS } from '@/constants/schedule'

function padTwo(num: number): string {
  return String(num).padStart(2, '0')
}

export function parseValidDate(value: string | number | Date | null | undefined): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || value === Number.MAX_SAFE_INTEGER)) {
    return undefined
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined
    }
    return value
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date
}

export function parseTimeMs(
  iso: string | null | undefined,
  fallback = Number.MAX_SAFE_INTEGER,
): number {
  return parseValidDate(iso)?.getTime() ?? fallback
}

export function formatClockTime(date: Date): string {
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`
}

function formatDatePart(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`
}

export function dateToLocalInput(date: Date): string {
  return `${formatDatePart(date)}T${formatClockTime(date)}`
}

export function isoToLocalInput(iso: string | null | undefined): string {
  const date = parseValidDate(iso)
  if (!date) {
    return ''
  }
  return dateToLocalInput(date)
}

export function localInputToIso(localValue: string): string | undefined {
  const date = parseValidDate(localValue.trim())
  return date?.toISOString()
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '未设置'
  }
  const date = parseValidDate(iso)
  if (!date) {
    return iso
  }
  return `${formatDatePart(date)} ${formatClockTime(date)}`
}

export function getDateGroupKey(timeMs: number): string {
  const date = parseValidDate(timeMs)
  if (!date) {
    return 'unknown'
  }
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function formatDateDivider(timeMs: number): string {
  const date = parseValidDate(timeMs)
  if (!date) {
    return '未设置日期'
  }
  const weekday = FULL_WEEKDAY_LABELS[date.getDay()] ?? ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`
}

export function getCurrentDeviceTimezone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
