<script setup lang="ts">
import { computed } from 'vue'
import { ScheduleTypeEnum, type Schedule } from '@/api'
import type { ScheduleDisplayItem } from '@/types/schedule'
import { formatDateTime } from '@/utils/date-time'
import {
  formatRecurrenceSummary,
  formatSchedulePrimaryTime,
  formatScheduleTypeBadge,
} from '@/utils/schedule-format'

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
const typeBadge = computed(() => formatScheduleTypeBadge(item.value, entry.rangeRole))
const primaryTimeText = computed(() => formatSchedulePrimaryTime(entry))
const secondaryRuleText = computed(() => {
  if (item.value.type !== ScheduleTypeEnum.Recurring) {
    return ''
  }
  return `重复规则：${formatRecurrenceSummary(item.value.recurrence)}`
})
</script>

<template>
  <article
    class="schedule-card"
    :class="{ 'is-done': entry.effectiveDone }"
    :data-entry-key="entry.key"
  >
    <div class="card-status-col">
      <button
        v-if="entry.rangeRole !== 'start'"
        type="button"
        class="check-btn"
        :class="{ checked: entry.effectiveDone }"
        :disabled="busy"
        :title="entry.effectiveDone ? '标记为未完成' : '标记为已完成'"
        @click="emit('toggleDone', entry)"
      >
        <span v-if="entry.effectiveDone" class="check-icon">✓</span>
      </button>
      <span v-else class="auto-check-dot" title="时段开始时间点不可标记为完成"></span>
      <span class="badge" :class="typeBadge.badgeClass">{{ typeBadge.label }}</span>
    </div>

    <div class="card-main">
      <div class="card-header">
        <h3 class="card-title">{{ item.title }}</h3>
      </div>

      <p v-if="item.description" class="card-desc">{{ item.description }}</p>
      <p class="card-time">{{ primaryTimeText }}</p>

      <div class="card-meta">
        <span>优先级 {{ item.priority }}</span>
        <span>ID #{{ item.id }}</span>
        <span>创建于 {{ formatDateTime(item.created_at) }}</span>
        <span v-if="item.type === ScheduleTypeEnum.Recurring && item.recurrence?.timezone">
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  width: 40px;
  flex-shrink: 0;
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

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 500;
  white-space: nowrap;
}

.type-one_time {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.type-time_range,
.type-time_range_end {
  background: rgba(139, 92, 246, 0.14);
  color: #7c3aed;
}

.type-time_range_start {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.type-recurring {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}

.card-desc,
.card-time {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--text-regular);
  margin-bottom: 0.25rem;
}

.card-desc {
  white-space: pre-wrap;
  word-break: break-word;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: var(--text-muted);
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
