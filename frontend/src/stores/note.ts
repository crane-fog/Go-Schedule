import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { Note, UpdateNoteRequest } from '@/api'
import {
  createNoteItem,
  deleteNoteItem,
  extractErrorMessage,
  fetchNotes,
  updateNoteItem,
  uploadNoteImage,
} from '@/api/client'

interface NoteSnapshot {
  title: string
  content: string
  sort_order: number
}

interface NoteSaveContext {
  notes: Ref<Note[]>
  savedSnapshots: Ref<Map<number, NoteSnapshot>>
  savingIds: Ref<Set<number>>
  error: Ref<string | undefined>
  autoSaveTimers: Map<number, ReturnType<typeof setTimeout>>
  inFlightSaves: Map<number, Promise<boolean>>
}

export type NoteSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'

const AUTO_SAVE_DELAY_MS = 1000

function toSnapshot(note: Note): NoteSnapshot {
  return {
    content: note.content,
    sort_order: note.sort_order,
    title: note.title,
  }
}

function buildNextNoteTitle(notes: Note[]): string {
  const existingTitles = new Set(notes.map((item) => item.title.trim()))
  let index = 1
  while (existingTitles.has(`新记事 ${index}`)) {
    index += 1
  }
  return `新记事 ${index}`
}

function hasNoteDiff(note: Note | undefined, snap: NoteSnapshot | undefined): boolean {
  if (!note || !snap) {
    return false
  }
  return (
    note.title !== snap.title ||
    note.content !== snap.content ||
    note.sort_order !== snap.sort_order
  )
}

function clearTimer(timers: Map<number, ReturnType<typeof setTimeout>>, id: number): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

function createSaveHelper(ctx: NoteSaveContext) {
  function findNote(id: number): Note | undefined {
    return ctx.notes.value.find((item) => item.id === id)
  }

  function isNoteDirty(id: number): boolean {
    return hasNoteDiff(findNote(id), ctx.savedSnapshots.value.get(id))
  }

  function scheduleAutoSave(id: number): void {
    clearTimer(ctx.autoSaveTimers, id)
    const timer = setTimeout(() => {
      ctx.autoSaveTimers.delete(id)
      void saveNote(id)
    }, AUTO_SAVE_DELAY_MS)
    ctx.autoSaveTimers.set(id, timer)
  }

  function applySavedNote(id: number, payload: UpdateNoteRequest, saved: Note): void {
    const current = findNote(id)
    if (!current) {
      return
    }
    ctx.savedSnapshots.value.set(id, toSnapshot(saved))
    current.created_at = saved.created_at
    current.updated_at = saved.updated_at

    // 如果请求在途期间用户又修改了标题或正文，保留未落盘草稿并续约防抖保存
    const editedDuringFlight =
      current.title !== payload.title ||
      current.content !== payload.content ||
      current.sort_order !== payload.sort_order
    if (editedDuringFlight && current.title.trim() !== '') {
      scheduleAutoSave(id)
    }
  }

  async function executeSave(id: number, note: Note): Promise<boolean> {
    const payload: UpdateNoteRequest = {
      content: note.content,
      sort_order: note.sort_order,
      title: note.title,
    }
    ctx.savingIds.value.add(id)
    ctx.error.value = undefined
    try {
      const saved = await updateNoteItem(id, payload)
      applySavedNote(id, payload, saved)
      return true
    } catch (err) {
      ctx.error.value = extractErrorMessage(err, '保存记事页签失败')
      return false
    } finally {
      ctx.savingIds.value.delete(id)
      ctx.inFlightSaves.delete(id)
    }
  }

  async function saveNote(id: number): Promise<boolean> {
    clearTimer(ctx.autoSaveTimers, id)
    const pending = ctx.inFlightSaves.get(id)
    if (pending) {
      await pending
      if (isNoteDirty(id)) {
        return saveNote(id)
      }
      return true
    }

    const note = findNote(id)
    if (!note) {
      return false
    }
    if (!isNoteDirty(id)) {
      return true
    }
    if (note.title.trim() === '') {
      ctx.error.value = '记事页签标题不能为空'
      return false
    }

    const savePromise = executeSave(id, note)
    ctx.inFlightSaves.set(id, savePromise)
    return savePromise
  }

  async function flushNote(id: number): Promise<boolean> {
    clearTimer(ctx.autoSaveTimers, id)
    const pending = ctx.inFlightSaves.get(id)
    if (pending) {
      await pending
    }
    if (isNoteDirty(id)) {
      return saveNote(id)
    }
    return true
  }

  return {
    findNote,
    flushNote,
    isNoteDirty,
    saveNote,
    scheduleAutoSave,
  }
}

export const useNoteStore = defineStore('note', () => {
  const notes = ref<Note[]>([])
  const activeNoteId = ref<number | undefined>(undefined)
  const loading = ref(false)
  const loaded = ref(false)
  const creating = ref(false)
  const deletingId = ref<number | undefined>(undefined)
  const error = ref<string | undefined>(undefined)

  const savedSnapshots = ref<Map<number, NoteSnapshot>>(new Map())
  const savingIds = ref<Set<number>>(new Set())
  const autoSaveTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const inFlightSaves = new Map<number, Promise<boolean>>()

  const helper = createSaveHelper({
    autoSaveTimers,
    error,
    inFlightSaves,
    notes,
    savedSnapshots,
    savingIds,
  })

  const activeNote = computed(() => {
    if (activeNoteId.value === undefined) {
      return undefined
    }
    return helper.findNote(activeNoteId.value)
  })

  const activeSaveStatus = computed<NoteSaveStatus>(() => {
    const current = activeNote.value
    if (!current) {
      return 'idle'
    }
    if (savingIds.value.has(current.id)) {
      return 'saving'
    }
    if (helper.isNoteDirty(current.id)) {
      return 'dirty'
    }
    return 'saved'
  })

  const hasUnsavedOrSaving = computed(
    () => savingIds.value.size > 0 || notes.value.some((item) => helper.isNoteDirty(item.id)),
  )

  async function loadNotes(): Promise<void> {
    loading.value = true
    error.value = undefined
    try {
      const list = await fetchNotes()
      notes.value = list
      savedSnapshots.value = new Map(list.map((item) => [item.id, toSnapshot(item)]))
      const stillExists =
        activeNoteId.value !== undefined && list.some((item) => item.id === activeNoteId.value)
      if (!stillExists) {
        activeNoteId.value = list[0]?.id
      }
      loaded.value = true
    } catch (err) {
      error.value = extractErrorMessage(err, '加载记事失败')
    } finally {
      loading.value = false
    }
  }

  async function flushActiveNote(): Promise<boolean> {
    if (activeNoteId.value === undefined) {
      return true
    }
    return helper.flushNote(activeNoteId.value)
  }

  function updateDraftContent(id: number, content: string): void {
    const note = helper.findNote(id)
    if (!note || note.content === content) {
      return
    }
    note.content = content
    if (helper.isNoteDirty(id)) {
      helper.scheduleAutoSave(id)
    } else {
      clearTimer(autoSaveTimers, id)
    }
  }

  function updateDraftTitle(id: number, title: string): void {
    const note = helper.findNote(id)
    if (!note || note.title === title) {
      return
    }
    note.title = title
    if (title.trim() !== '' && helper.isNoteDirty(id)) {
      helper.scheduleAutoSave(id)
    } else if (title.trim() === '') {
      clearTimer(autoSaveTimers, id)
    }
  }

  async function commitTitleEdit(id: number): Promise<boolean> {
    const note = helper.findNote(id)
    if (!note) {
      return false
    }
    if (note.title.trim() === '') {
      note.title = savedSnapshots.value.get(id)?.title ?? '未命名记事'
      clearTimer(autoSaveTimers, id)
      return true
    }
    return helper.flushNote(id)
  }

  async function selectNote(id: number): Promise<void> {
    if (activeNoteId.value === id) {
      return
    }
    await flushActiveNote()
    activeNoteId.value = id
  }

  async function createNote(title?: string): Promise<Note | undefined> {
    if (creating.value) {
      return undefined
    }
    await flushActiveNote()
    creating.value = true
    error.value = undefined
    try {
      const nextTitle = title?.trim() || buildNextNoteTitle(notes.value)
      const created = await createNoteItem({ content: '', sort_order: 0, title: nextTitle })
      notes.value.push(created)
      savedSnapshots.value.set(created.id, toSnapshot(created))
      activeNoteId.value = created.id
      return created
    } catch (err) {
      error.value = extractErrorMessage(err, '创建记事页签失败')
      return undefined
    } finally {
      creating.value = false
    }
  }

  async function deleteNote(id: number): Promise<boolean> {
    clearTimer(autoSaveTimers, id)
    deletingId.value = id
    error.value = undefined
    try {
      await deleteNoteItem(id)
      const idx = notes.value.findIndex((item) => item.id === id)
      if (idx !== -1) {
        notes.value.splice(idx, 1)
      }
      savedSnapshots.value.delete(id)
      savingIds.value.delete(id)
      if (activeNoteId.value === id) {
        const nextTab = notes.value[idx] ?? notes.value[idx - 1]
        activeNoteId.value = nextTab?.id
      }
      return true
    } catch (err) {
      error.value = extractErrorMessage(err, '删除记事页签失败')
      return false
    } finally {
      deletingId.value = undefined
    }
  }

  async function uploadImage(file: File): Promise<string> {
    error.value = undefined
    const result = await uploadNoteImage(file)
    return result.url
  }

  function clearError(): void {
    error.value = undefined
  }

  return {
    activeNote,
    activeNoteId,
    activeSaveStatus,
    clearError,
    commitTitleEdit,
    createNote,
    creating,
    deleteNote,
    deletingId,
    error,
    flushActiveNote,
    flushNote: helper.flushNote,
    hasUnsavedOrSaving,
    isNoteDirty: helper.isNoteDirty,
    isNoteSaving: (id: number) => savingIds.value.has(id),
    loadNotes,
    loaded,
    loading,
    notes,
    saveNote: helper.saveNote,
    selectNote,
    updateDraftContent,
    updateDraftTitle,
    uploadImage,
  }
})
