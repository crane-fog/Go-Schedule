<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  RecurrenceFrequencyEnum,
  ScheduleTypeEnum,
  type CreateScheduleRequest,
  type Schedule,
  type UpdateScheduleRequest,
} from '@/api'
import {
  WEEKDAY_LABELS,
  buildCreatePayload,
  buildUpdatePayload,
  createDefaultFormState,
  scheduleToFormState,
  validateScheduleForm,
  type ScheduleFormState,
} from '@/utils/schedule-helpers'

/* oxlint-disable one-var */
const {
  visible,
  editingItem = undefined,
  submitting = false,
} = defineProps<{
  visible: boolean
  editingItem?: Schedule | undefined
  submitting?: boolean
}>()

const emit = defineEmits<{
  close: []
  create: [payload: CreateScheduleRequest]
  update: [id: number, payload: UpdateScheduleRequest]
}>()

const form = reactive<ScheduleFormState>(createDefaultFormState())
const formError = ref<string | undefined>(undefined)
const isEditing = computed(() => Boolean(editingItem))
const typeOptions = [
  { desc: '指定单个发生时间点', label: '单次日程', value: ScheduleTypeEnum.OneTime },
  { desc: '包含开始与结束时间', label: '时间段', value: ScheduleTypeEnum.TimeRange },
  { desc: '按天/周/月/年定期重复', label: '周期重复', value: ScheduleTypeEnum.Recurring },
] as const
const priorityPresets = [-3, -2, -1, 0, 1, 2, 3] as const

function syncFormFromProps(): void {
  formError.value = undefined
  if (editingItem) {
    Object.assign(form, scheduleToFormState(editingItem))
  } else {
    Object.assign(form, createDefaultFormState())
  }
}

watch(
  () => [visible, editingItem],
  () => {
    if (visible) {
      syncFormFromProps()
    }
  },
  { immediate: true },
)

function handleSubmit(): void {
  const err = validateScheduleForm(form)
  if (err) {
    formError.value = err
    return
  }
  formError.value = undefined
  if (editingItem) {
    emit('update', editingItem.id, buildUpdatePayload(form))
  } else {
    emit('create', buildCreatePayload(form))
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-panel" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2>{{ isEditing ? '编辑日程' : '新建日程' }}</h2>
          <button type="button" class="close-btn" @click="emit('close')">✕</button>
        </header>

        <form class="modal-body" @submit.prevent="handleSubmit">
          <div v-if="formError" class="alert-error">{{ formError }}</div>

          <div class="form-group">
            <label class="form-label" for="schedule-title">标题 *</label>
            <input
              id="schedule-title"
              v-model="form.title"
              type="text"
              class="form-input"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">类型 *</label>
            <div class="type-selector">
              <button
                v-for="opt in typeOptions"
                :key="opt.value"
                type="button"
                class="type-option"
                :class="{ active: form.type === opt.value }"
                @click="form.type = opt.value"
              >
                <span class="type-option-title">{{ opt.label }}</span>
                <span class="type-option-desc">{{ opt.desc }}</span>
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="schedule-priority">优先级</label>
              <div class="priority-controls">
                <div class="priority-presets">
                  <button
                    v-for="preset in priorityPresets"
                    :key="preset"
                    type="button"
                    class="preset-chip"
                    :class="{ active: form.priority === preset }"
                    @click="form.priority = preset"
                  >
                    {{ preset }}
                  </button>
                </div>
                <input
                  id="schedule-priority"
                  v-model.number="form.priority"
                  type="number"
                  class="form-input priority-num-input"
                />
              </div>
            </div>

            <div v-if="isEditing && form.type === ScheduleTypeEnum.TimeRange" class="form-group">
              <label class="form-label">当前状态</label>
              <label class="checkbox-row">
                <input v-model="form.done" type="checkbox" />
                <span>标记为已完成</span>
              </label>
            </div>
          </div>

          <!-- 单次日程配置 -->
          <div v-if="form.type === ScheduleTypeEnum.OneTime" class="type-section">
            <div class="form-group">
              <label class="form-label" for="happen-time">发生时间 *</label>
              <input
                id="happen-time"
                v-model="form.happenTimeLocal"
                type="datetime-local"
                class="form-input"
                required
              />
            </div>
          </div>

          <!-- 时间段日程配置 -->
          <div v-else-if="form.type === ScheduleTypeEnum.TimeRange" class="type-section">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="start-at">开始时间 *</label>
                <input
                  id="start-at"
                  v-model="form.startAtLocal"
                  type="datetime-local"
                  class="form-input"
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="end-at">结束时间 *</label>
                <input
                  id="end-at"
                  v-model="form.endAtLocal"
                  type="datetime-local"
                  class="form-input"
                  required
                />
              </div>
            </div>
          </div>

          <!-- 周期重复日程配置 -->
          <div v-else class="type-section">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rec-frequency">重复频率 *</label>
                <select id="rec-frequency" v-model="form.frequency" class="form-input">
                  <option :value="RecurrenceFrequencyEnum.Daily">按天 (daily)</option>
                  <option :value="RecurrenceFrequencyEnum.Weekly">按周 (weekly)</option>
                  <option :value="RecurrenceFrequencyEnum.Monthly">按月 (monthly)</option>
                  <option :value="RecurrenceFrequencyEnum.Yearly">按年 (yearly)</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="rec-interval">重复间隔 (每 N 周期) *</label>
                <input
                  id="rec-interval"
                  v-model.number="form.interval"
                  type="number"
                  min="1"
                  class="form-input"
                  required
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rec-start">首次发生时间 *</label>
                <input
                  id="rec-start"
                  v-model="form.recurrenceStartLocal"
                  type="datetime-local"
                  class="form-input"
                  required
                />
              </div>

              <div v-if="form.frequency === RecurrenceFrequencyEnum.Weekly" class="form-group">
                <label class="form-label" for="rec-dow">星期几</label>
                <select id="rec-dow" v-model.number="form.dayOfWeek" class="form-input">
                  <option v-for="(label, idx) in WEEKDAY_LABELS" :key="idx" :value="idx">
                    {{ label }} ({{ idx }})
                  </option>
                </select>
              </div>

              <div
                v-else-if="form.frequency === RecurrenceFrequencyEnum.Monthly"
                class="form-group"
              >
                <label class="form-label" for="rec-dom">每月几号 (1-31)</label>
                <input
                  id="rec-dom"
                  v-model.number="form.dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  class="form-input"
                />
              </div>

              <div v-else-if="form.frequency === RecurrenceFrequencyEnum.Yearly" class="form-group">
                <label class="form-label" for="rec-month">每年几月 (1-12)</label>
                <input
                  id="rec-month"
                  v-model.number="form.month"
                  type="number"
                  min="1"
                  max="12"
                  class="form-input"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rec-end-mode">结束条件</label>
                <select id="rec-end-mode" v-model="form.endMode" class="form-input">
                  <option value="never">长期重复（无截止）</option>
                  <option value="until">指定截止时间 (until)</option>
                  <option value="count">指定重复次数 (count)</option>
                </select>
              </div>

              <div v-if="form.endMode === 'until'" class="form-group">
                <label class="form-label" for="rec-until">截止时间 *</label>
                <input
                  id="rec-until"
                  v-model="form.untilLocal"
                  type="datetime-local"
                  class="form-input"
                  required
                />
              </div>

              <div v-else-if="form.endMode === 'count'" class="form-group">
                <label class="form-label" for="rec-count">最多发生次数 *</label>
                <input
                  id="rec-count"
                  v-model.number="form.count"
                  type="number"
                  min="1"
                  class="form-input"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="rec-tz">时区</label>
                <input
                  id="rec-tz"
                  v-model="form.timezone"
                  type="text"
                  class="form-input"
                  placeholder="Asia/Shanghai 或 UTC"
                />
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="submitting"
              @click="emit('close')"
            >
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? '保存中...' : isEditing ? '保存修改' : '立即创建' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-panel {
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.15rem 1.4rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.close-btn:hover {
  background: var(--surface-muted);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.35rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.alert-error {
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #dc2626;
  font-size: 0.88rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.form-label {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-regular);
}

.form-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.92rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--primary-color);
}

.form-help {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.type-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.65rem;
}

.type-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.type-option.active {
  border-color: var(--primary-color);
  background: rgba(59, 130, 246, 0.1);
}

.type-option-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.type-option-desc {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.priority-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.priority-presets {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.preset-chip {
  padding: 0.38rem 0.65rem;
  border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  color: var(--text-regular);
  font-size: 0.8rem;
  cursor: pointer;
}

.preset-chip.active {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.priority-num-input {
  width: 82px;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 38px;
  font-size: 0.9rem;
  color: var(--text-regular);
  cursor: pointer;
}

.type-section {
  padding: 1rem;
  border-radius: 10px;
  background: var(--surface-subtle);
  border: 1px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 560px) {
  .type-selector {
    grid-template-columns: 1fr;
  }
}
</style>
