<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Note } from '@/api'
import MilkdownEditor from '@/components/MilkdownEditor.vue'
import { useNoteStore } from '@/stores/note'

const store = useNoteStore()

const editorRef = ref<InstanceType<typeof MilkdownEditor> | undefined>(undefined)
const renameInputRef = ref<HTMLInputElement[] | undefined>(undefined)
const renamingNoteId = ref<number | undefined>(undefined)
const renameBackupTitle = ref('')
const uploadError = ref<string | undefined>(undefined)

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
  const {value} = (event.target as HTMLInputElement)
  store.updateDraftTitle(noteId, value)
}

function handleUploadError(message: string): void {
  uploadError.value = message
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
      <p class="state-desc">点击下方按钮创建你的第一个 Markdown 记事页签，支持图文记录与自动保存。</p>
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
    <template v-else>
      <div class="note-tabbar">
        <div class="note-tabs-scroll" role="tablist" aria-label="记事页签列表">
          <div
            v-for="note in store.notes"
            :key="note.id"
            role="tab"
            :aria-selected="store.activeNoteId === note.id"
            tabindex="0"
            class="note-tab"
            :class="{ active: store.activeNoteId === note.id }"
            @click="handleSelectTab(note.id)"
            @keydown.enter.self="handleSelectTab(note.id)"
          >
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

            <span
              v-if="store.isNoteDirty(note.id)"
              class="tab-dirty-dot"
              title="有未保存更改"
              aria-label="未保存"
            />

            <button
              type="button"
              class="tab-close-btn"
              title="删除页签"
              aria-label="删除页签"
              :disabled="store.deletingId === note.id"
              @click.stop="handleDeleteTab(note)"
            >
              ×
            </button>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-ghost tab-add-btn"
          :disabled="store.creating"
          title="新建记事页签"
          @click="handleCreateTab"
        >
          + 新建页签
        </button>
      </div>

      <div v-if="store.activeNote" class="note-workspace">
        <div class="note-meta-bar">
          <input
            :value="store.activeNote.title"
            type="text"
            class="note-title-input"
            placeholder="请输入页签标题..."
            aria-label="当前页签标题"
            @input="handleTitleInput(store.activeNote.id, $event)"
            @blur="store.commitTitleEdit(store.activeNote.id)"
            @keydown.enter.prevent="store.commitTitleEdit(store.activeNote.id)"
          />
          <span class="note-meta-hint">
            <template v-if="store.activeNote.updated_at">
              更新于 {{ formatUpdatedAt(store.activeNote.updated_at) }} ·
            </template>
            支持 Ctrl+V 粘贴截图 / 拖拽图片 · Ctrl+S 立即保存
          </span>
        </div>

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
    </template>
  </section>
</template>

<style scoped>
.note-board {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notice-banner {
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

.note-tabbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.45rem 0.65rem;
}

.note-tabs-scroll {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding-bottom: 1px;
}

.note-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.42rem 0.68rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  max-width: 220px;
  transition: all 0.15s ease;
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

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.tab-rename-input {
  width: 120px;
  padding: 0.08rem 0.3rem;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
}

.tab-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--primary-color);
  flex-shrink: 0;
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

.tab-add-btn {
  flex-shrink: 0;
  font-size: 0.84rem;
  white-space: nowrap;
}

.note-workspace {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.note-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.note-title-input {
  flex: 1;
  min-width: 180px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0.28rem 0.5rem;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.05rem;
  font-weight: 600;
  outline: none;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.note-title-input:hover {
  background: var(--surface-subtle);
}

.note-title-input:focus {
  border-color: var(--primary-color);
  background: var(--input-bg);
}

.note-meta-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
}
</style>
