<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Note } from '@/api'
import MilkdownEditor from '@/components/MilkdownEditor.vue'
import { useNoteStore, type TabDropPlacement } from '@/stores/note'

const DRAG_MIME_TYPE = 'application/x-go-schedule-note-id'

const store = useNoteStore()

const editorRef = ref<InstanceType<typeof MilkdownEditor> | undefined>(undefined)
const renameInputRef = ref<HTMLInputElement[] | undefined>(undefined)
const renamingNoteId = ref<number | undefined>(undefined)
const renameBackupTitle = ref('')
const uploadError = ref<string | undefined>(undefined)
const draggingNoteId = ref<number | undefined>(undefined)
const dragOverNoteId = ref<number | undefined>(undefined)
const dragOverPlacement = ref<TabDropPlacement>('before')

function syncEditorDraft(): void {
  const active = store.activeNote
  if (!active || !editorRef.value) {
    return
  }
  const latestMarkdown = editorRef.value.syncNow()
  store.updateDraftContent(active.id, latestMarkdown)
}

async function syncAndFlushActive(): Promise<boolean> {
  syncEditorDraft()
  return store.flushActiveNote()
}

async function handleSelectTab(id: number): Promise<void> {
  if (store.activeNoteId === id) {
    return
  }
  syncEditorDraft()
  await store.selectNote(id)
}

async function handleCreateTab(): Promise<void> {
  syncEditorDraft()
  await store.createNote()
}

async function handleStartRename(note: Note): Promise<void> {
  renamingNoteId.value = note.id
  renameBackupTitle.value = note.title
  await nextTick()
  const input = renameInputRef.value?.[0]
  input?.focus()
  input?.select()
}

async function handleCommitRename(id: number): Promise<void> {
  if (renamingNoteId.value !== id) {
    return
  }
  renamingNoteId.value = undefined
  await store.commitTitleEdit(id)
}

function handleCancelRename(id: number): void {
  if (renamingNoteId.value !== id) {
    return
  }
  renamingNoteId.value = undefined
  store.updateDraftTitle(id, renameBackupTitle.value)
}

async function handleDeleteTab(note: Note): Promise<void> {
  if (!globalThis.confirm(`确定要删除记事页签「${note.title}」吗？`)) {
    return
  }
  if (renamingNoteId.value === note.id) {
    renamingNoteId.value = undefined
  }
  await store.deleteNote(note.id)
}

function handleContentUpdate(noteId: number, value: string): void {
  store.updateDraftContent(noteId, value)
}

function handleTitleInput(noteId: number, event: Event): void {
  const { value } = event.target as HTMLInputElement
  store.updateDraftTitle(noteId, value)
}

function handleUploadError(message: string): void {
  uploadError.value = message
}

function resetDragState(): void {
  draggingNoteId.value = undefined
  dragOverNoteId.value = undefined
}

function isHorizontalTabLayout(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(max-width: 768px)').matches
  )
}

function handleTabDragStart(noteId: number, event: DragEvent): void {
  if (renamingNoteId.value === noteId) {
    event.preventDefault()
    return
  }
  draggingNoteId.value = noteId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_MIME_TYPE, String(noteId))
  }
}

function handleTabDragOver(noteId: number, event: DragEvent): void {
  if (draggingNoteId.value === undefined) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  if (draggingNoteId.value === noteId) {
    dragOverNoteId.value = undefined
    return
  }
  const target = event.currentTarget as HTMLElement | null
  if (!target) {
    return
  }
  const rect = target.getBoundingClientRect()
  let placement: TabDropPlacement = 'after'
  if (isHorizontalTabLayout()) {
    if (event.clientX < rect.left + rect.width / 2) {
      placement = 'before'
    }
  } else if (event.clientY < rect.top + rect.height / 2) {
    placement = 'before'
  }
  dragOverNoteId.value = noteId
  dragOverPlacement.value = placement
}

function handleTabDragLeave(noteId: number, event: DragEvent): void {
  if (dragOverNoteId.value !== noteId) {
    return
  }
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  if (current && related && current.contains(related)) {
    return
  }
  dragOverNoteId.value = undefined
}

function handleTabDrop(noteId: number, event: DragEvent): void {
  if (draggingNoteId.value === undefined) {
    return
  }
  event.preventDefault()
  const draggedId = draggingNoteId.value
  const placement = dragOverPlacement.value
  resetDragState()
  if (draggedId !== noteId) {
    void store.reorderNote(draggedId, noteId, placement)
  }
}

function handleListDragOver(event: DragEvent): void {
  if (draggingNoteId.value === undefined) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleListDrop(event: DragEvent): void {
  if (draggingNoteId.value === undefined || dragOverNoteId.value === undefined) {
    resetDragState()
    return
  }
  event.preventDefault()
  const draggedId = draggingNoteId.value
  const targetId = dragOverNoteId.value
  const placement = dragOverPlacement.value
  resetDragState()
  if (draggedId !== targetId) {
    void store.reorderNote(draggedId, targetId, placement)
  }
}

function clearNotice(): void {
  uploadError.value = undefined
  store.clearError()
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

defineExpose({
  syncAndFlushActive,
})
</script>

<template>
  <section class="note-board">
    <!-- 错误提示 -->
    <div v-if="store.error || uploadError" class="notice-banner notice-error">
      <span>{{ store.error || uploadError }}</span>
      <button type="button" class="btn btn-ghost" @click="clearNotice">关闭</button>
    </div>

    <!-- 加载中状态 -->
    <div v-if="store.loading && store.notes.length === 0" class="state-box">
      <p>正在加载记事数据...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="store.notes.length === 0" class="state-box">
      <p class="state-title">暂无任何记事页签</p>
      <p class="state-desc">
        点击下方按钮创建你的第一个 Markdown 记事页签，支持图文记录与自动保存。
      </p>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="store.creating"
        @click="handleCreateTab"
      >
        {{ store.creating ? '创建中...' : '+ 新建第一个记事页签' }}
      </button>
    </div>

    <!-- 多页签与编辑器区域 -->
    <div v-else class="note-layout">
      <aside
        class="note-tabbar"
        @dragenter="handleListDragOver"
        @dragover="handleListDragOver"
        @drop="handleListDrop"
      >
        <div
          class="note-tabs-scroll"
          :class="{ 'is-reordering': draggingNoteId !== undefined }"
          role="tablist"
          aria-label="记事页签列表"
          aria-orientation="vertical"
        >
          <div
            v-for="note in store.notes"
            :key="note.id"
            role="tab"
            :aria-selected="store.activeNoteId === note.id"
            tabindex="0"
            :draggable="renamingNoteId !== note.id && store.notes.length > 1"
            class="note-tab"
            :class="{
              active: store.activeNoteId === note.id,
              'is-dragging': draggingNoteId === note.id,
              'is-drop-before': dragOverNoteId === note.id && dragOverPlacement === 'before',
              'is-drop-after': dragOverNoteId === note.id && dragOverPlacement === 'after',
            }"
            @click="handleSelectTab(note.id)"
            @keydown.enter.self="handleSelectTab(note.id)"
            @dragstart="handleTabDragStart(note.id, $event)"
            @dragenter.stop="handleTabDragOver(note.id, $event)"
            @dragover.stop="handleTabDragOver(note.id, $event)"
            @dragleave="handleTabDragLeave(note.id, $event)"
            @drop.stop="handleTabDrop(note.id, $event)"
            @dragend="resetDragState"
          >
            <div class="tab-content">
              <input
                v-if="renamingNoteId === note.id"
                ref="renameInputRef"
                :value="note.title"
                type="text"
                class="tab-rename-input"
                aria-label="重命名记事页签"
                @click.stop
                @input="handleTitleInput(note.id, $event)"
                @blur="handleCommitRename(note.id)"
                @keydown.enter.prevent="handleCommitRename(note.id)"
                @keydown.esc.prevent="handleCancelRename(note.id)"
              />
              <span
                v-else
                class="tab-title"
                title="双击可重命名"
                @dblclick.stop="handleStartRename(note)"
              >
                {{ note.title }}
              </span>
              <span v-if="note.updated_at" class="tab-updated-at">
                {{ formatUpdatedAt(note.updated_at) }}
              </span>
            </div>

            <button
              type="button"
              class="tab-close-btn"
              :class="{ 'is-dirty': store.isNoteDirty(note.id) }"
              :title="store.isNoteDirty(note.id) ? '有未保存更改（点击删除页签）' : '删除页签'"
              aria-label="删除页签"
              :disabled="store.deletingId === note.id"
              @click.stop="handleDeleteTab(note)"
            >
              <span class="tab-close-icon" aria-hidden="true">×</span>
              <span v-if="store.isNoteDirty(note.id)" class="tab-dirty-dot" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div v-if="store.activeNote" class="note-workspace">
        <MilkdownEditor
          ref="editorRef"
          :note-id="store.activeNote.id"
          :model-value="store.activeNote.content"
          :upload-image="store.uploadImage"
          @update:model-value="handleContentUpdate(store.activeNote.id, $event)"
          @save="syncAndFlushActive"
          @upload-error="handleUploadError"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.note-board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notice-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 0.88rem;
}

.notice-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--danger-color);
}

.state-box {
  background: var(--card-bg);
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  padding: 3rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
}

.state-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}

.state-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
  margin-bottom: 0.35rem;
}

.note-layout {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.note-tabbar {
  position: absolute;
  top: 0;
  right: calc(100% + 1rem);
  width: 200px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.25rem 0.5rem;
}

.note-tabs-scroll {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 6px 0;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.note-tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.42rem;
  width: 100%;
  padding: 0.48rem 0.65rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.note-tab.is-dragging {
  opacity: 0.45;
}

.note-tabs-scroll.is-reordering .note-tab > * {
  pointer-events: none;
}

.note-tab.is-drop-before::before,
.note-tab.is-drop-after::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: var(--primary-color);
  pointer-events: none;
}

.note-tab.is-drop-before::before {
  top: -4px;
}

.note-tab.is-drop-after::after {
  bottom: -4px;
}

.note-tab:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.note-tab.active {
  background: var(--card-bg);
  color: var(--text-primary);
  border-color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.tab-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.14rem;
}

.tab-title {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
  line-height: 1.3;
}

.tab-updated-at {
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.2;
  color: var(--text-secondary);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.tab-rename-input {
  width: 100%;
  padding: 0.05rem 0.28rem;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.3;
  outline: none;
}

.tab-close-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.98rem;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.tab-close-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.14);
  color: var(--danger-color);
}

.tab-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--primary-color);
  flex-shrink: 0;
}

.tab-close-btn.is-dirty .tab-close-icon {
  display: none;
}

.tab-close-btn.is-dirty:hover .tab-dirty-dot,
.tab-close-btn.is-dirty:focus-visible .tab-dirty-dot {
  display: none;
}

.tab-close-btn.is-dirty:hover .tab-close-icon,
.tab-close-btn.is-dirty:focus-visible .tab-close-icon {
  display: inline;
}

.note-workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1400px) {
  .note-tabbar {
    right: calc(100% + 0.75rem);
    width: 156px;
  }
}

@media (max-width: 1240px) {
  .note-layout {
    flex-direction: row;
    gap: 1rem;
  }

  .note-tabbar {
    position: static;
    width: 180px;
    flex-shrink: 0;
    align-self: flex-start;
  }
}

@media (max-width: 768px) {
  .note-layout {
    flex-direction: column;
    gap: 0.75rem;
  }

  .note-tabbar {
    width: 100%;
    max-height: none;
    padding: 0.5rem 0.25rem;
  }

  .note-tabs-scroll {
    flex-direction: row;
    padding: 0 6px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .note-tab {
    width: auto;
    max-width: 200px;
  }

  .note-tab.is-drop-before::before,
  .note-tab.is-drop-after::after {
    top: 4px;
    bottom: 4px;
    width: 2px;
    height: auto;
    left: auto;
    right: auto;
  }

  .note-tab.is-drop-before::before {
    left: -4px;
  }

  .note-tab.is-drop-after::after {
    right: -4px;
  }
}
</style>
