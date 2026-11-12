import { RecurrenceFrequencyEnum, ScheduleTypeEnum } from '@/api'
import type { RecurrenceEndMode, SortMode, StatusFilter, TypeFilter } from '@/types/schedule'

export const TYPE_LABELS: Record<ScheduleTypeEnum, string> = {
  one_time: '单次',
  recurring: '周期',
  time_range: '时段',
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequencyEnum, string> = {
  daily: '天',
  monthly: '个月',
  weekly: '周',
  yearly: '年',
}

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export const FULL_WEEKDAY_LABELS = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const

export const SORT_MODE_OPTIONS: readonly { label: string; value: SortMode }[] = [
  { label: '按时间排序', value: 'time' },
  { label: '按优先级排序', value: 'priority' },
]

export const STATUS_FILTER_OPTIONS: readonly { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待办', value: 'pending' },
  { label: '已完成', value: 'done' },
]

export const TYPE_FILTER_OPTIONS: readonly { label: string; value: TypeFilter }[] = [
  { label: '全部类型', value: 'all' },
  { label: TYPE_LABELS[ScheduleTypeEnum.OneTime], value: ScheduleTypeEnum.OneTime },
  { label: TYPE_LABELS[ScheduleTypeEnum.TimeRange], value: ScheduleTypeEnum.TimeRange },
  { label: TYPE_LABELS[ScheduleTypeEnum.Recurring], value: ScheduleTypeEnum.Recurring },
]

export const SCHEDULE_TYPE_OPTIONS: readonly {
  desc: string
  label: string
  value: ScheduleTypeEnum
}[] = [
  { desc: '指定单个发生时间点', label: '单次日程', value: ScheduleTypeEnum.OneTime },
  { desc: '包含开始与结束时间', label: '时间段', value: ScheduleTypeEnum.TimeRange },
  { desc: '按天/周/月/年定期重复', label: '周期重复', value: ScheduleTypeEnum.Recurring },
]

export const RECURRENCE_FREQUENCY_OPTIONS: readonly {
  label: string
  value: RecurrenceFrequencyEnum
}[] = [
  { label: '按天 (daily)', value: RecurrenceFrequencyEnum.Daily },
  { label: '按周 (weekly)', value: RecurrenceFrequencyEnum.Weekly },
  { label: '按月 (monthly)', value: RecurrenceFrequencyEnum.Monthly },
  { label: '按年 (yearly)', value: RecurrenceFrequencyEnum.Yearly },
]

export const RECURRENCE_END_MODE_OPTIONS: readonly {
  label: string
  value: RecurrenceEndMode
}[] = [
  { label: '长期重复（无截止）', value: 'never' },
  { label: '指定截止时间 (until)', value: 'until' },
  { label: '指定重复次数 (count)', value: 'count' },
]

export const PRIORITY_PRESETS = [-3, -2, -1, 0, 1, 2, 3] as const
