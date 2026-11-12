<script setup lang="ts">
import { computed } from 'vue'
import { ScheduleTypeEnum, type Schedule } from '@/api'
import { TYPE_LABELS, formatDateTime, formatRecurrenceSummary } from '@/utils/schedule-helpers'
import type { ScheduleDisplayItem } from '@/utils/schedule-occurrences'

/* oxlint-disable one-var */
const { entry, busy = false } = defineProps<{
  entry: ScheduleDisplayItem
  busy?: boolean
}>()

const emit = defineEmits<{
  toggleDone: [entry: ScheduleDisplayItem]
  edit: [item: Schedule]
  remove: [item: Schedule]
}>()

const item = computed(() => entry.schedule)
const isOneTime = computed(() => item.value.type === ScheduleTypeEnum.OneTime)
const typeLabel = computed(() => TYPE_LABELS[item.value.type] ?? item.value.type)

function formatOccurrenceText(entryItem: ScheduleDisplayItem): string {
  if (entryItem.occurrenceIndex) {
    return `${formatDateTime(entryItem.occurrenceIso)} #${entryItem.occurrenceIndex}`
  }
  return formatDateTime(entryItem.occurrenceIso)
}

const primaryTimeText = computed(() => {
  const current = item.value
  if (current.type === ScheduleTypeEnum.OneTime) {
    return `${formatDateTime(current.happen_time)}`
  }
  if (current.type === ScheduleTypeEnum.TimeRange) {
    return `${formatDateTime(current.start_at)} ~ ${formatDateTime(current.end_at)}`
  }
  return formatOccurrenceText(entry)
})

const secondaryRuleText = computed(() => {
  if (item.value.type !== ScheduleTypeEnum.Recurring) {
    return ''
  }
  return `重复规则：${formatRecurrenceSummary(item.value.recurrence)}`
})
</script>

<template>
  <article class="schedule-card" :class="{ 'is-done': entry.effectiveDone }">
    <div class="card-status-col">
      <button
        v-if="!isOneTime"
        type="button"
        class="check-btn"
        :class="{ checked: entry.effectiveDone }"
        :disabled="busy"
        :title="entry.effectiveDone ? '标记为未完成' : '标记为已完成'"
        @click="emit('toggleDone', entry)"
      >
        <span v-if="entry.effectiveDone" class="check-icon">✓</span>
      </button>
      <span
        v-else
        class="auto-check-dot"
        :class="{ checked: entry.effectiveDone }"
        :title="entry.effectiveDone ? '单次日程已到时间，自动视为完成' : '单次日程尚未到时间'"
      >
        {{ entry.effectiveDone ? '✓' : '🕒' }}
      </span>
    </div>

    <div class="card-main">
      <div class="card-header">
        <span class="badge" :class="`type-${item.type}`">{{ typeLabel }}</span>
        <h3 class="card-title">{{ item.title }}</h3>
      </div>

      <p class="card-time">{{ primaryTimeText }}</p>

      <div class="card-meta">
        <span>优先级 {{ item.priority }}</span>
        <span>ID #{{ item.id }}</span>
        <span>创建于 {{ formatDateTime(item.created_at) }}</span>
        <span v-if="item.type === 'recurring' && item.recurrence?.timezone">
          时区 {{ item.recurrence.timezone }}
        </span>
        <span v-if="secondaryRuleText">{{ secondaryRuleText }}</span>
      </div>
    </div>

    <div class="card-actions">
      <button type="button" class="btn btn-ghost" :disabled="busy" @click="emit('edit', item)">
        编辑
      </button>
      <button
        type="button"
        class="btn btn-danger-ghost"
        :disabled="busy"
        @click="emit('remove', item)"
      >
        删除
      </button>
    </div>
  </article>
</template>

<style scoped>
.schedule-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
}

.schedule-card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.schedule-card.is-done {
  opacity: 0.72;
  background: var(--card-done-bg);
}

.card-status-col {
  padding-top: 0.15rem;
}

.check-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid var(--border-strong);
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.15s ease;
}

.check-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.check-btn.checked {
  background: var(--success-color);
  border-color: var(--success-color);
}

.auto-check-dot {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  user-select: none;
}

.auto-check-dot.checked {
  background: rgba(16, 185, 129, 0.16);
  color: var(--success-color);
  font-weight: 700;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.35rem;
}

.card-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-word;
}

.schedule-card.is-done .card-title {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.badge-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.type-one_time {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.type-time_range {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.type-recurring {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}

.priority-normal {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.priority-medium {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.priority-high {
  background: rgba(249, 115, 22, 0.15);
  color: #ea580c;
}

.priority-urgent {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.status-pending {
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

.status-done {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.card-time {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--text-regular);
  margin-bottom: 0.25rem;
}

.card-rule {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 0.35rem;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.auto-hint {
  color: var(--text-secondary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .schedule-card {
    flex-direction: column;
  }

  .card-actions {
    width: 100%;
    justify-content: flex-end;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--border-color);
  }
}
</style>
