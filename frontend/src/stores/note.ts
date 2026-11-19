import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { Note, NoteMeta } from '@/api'
import {
  createNoteItem,
  deleteNoteItem,
  extractErrorMessage,
  fetchNotes,
  updateNoteContentItem,
  updateNoteMetaItem,
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

const AUTO_SAVE_DELAY_MS = 1000
const SORT_ORDER_STEP = 1024
const MAX_SAFE_INT32_ORDER = 2_000_000_000

export type TabDropPlacement = 'before' | 'after'

function toSnapshot(note: Note): NoteSnapshot {
  return {
    content: note.content,
    sort_order: note.sort_order,
    title: note.title,
  }
}

function getNextSortOrder(notes: Note[]): number {
  if (notes.length === 0) {
    return SORT_ORDER_STEP
  }
  let maxOrder = notes[0]?.sort_order ?? 0
  for (const item of notes) {
    if (item.sort_order > maxOrder) {
      maxOrder = item.sort_order
    }
  }
  return maxOrder + SORT_ORDER_STEP
}

function buildReorderedNotes(
  list: Note[],
  move: { draggedId: number; placement: TabDropPlacement; targetId: number },
): { insertIdx: number; reordered: Note[] } | undefined {
  const fromIdx = list.findIndex((item) => item.id === move.draggedId)
  const targetIdx = list.findIndex((item) => item.id === move.targetId)
  if (fromIdx === -1 || targetIdx === -1 || fromIdx === targetIdx) {
    return undefined
  }
  let insertIdx = targetIdx
  if (move.placement === 'after') {
    insertIdx = targetIdx + 1
  }
  if (fromIdx < insertIdx) {
    insertIdx -= 1
  }
  if (insertIdx === fromIdx) {
    return undefined
  }
  const reordered = [...list]
  const [moved] = reordered.splice(fromIdx, 1)
  if (!moved) {
    return undefined
  }
  reordered.splice(insertIdx, 0, moved)
  return { insertIdx, reordered }
}

function applySortOrders(list: Note[], orders: Map<number, number>): void {
  for (const item of list) {
    const nextOrder = orders.get(item.id)
    if (nextOrder !== undefined) {
      item.sort_order = nextOrder
    }
  }
}

function computeReorderedSortOrders(reordered: Note[], movedIndex: number): Map<number, number> {
  const moved = reordered[movedIndex]
  if (!moved) {
    return new Map()
  }
  const prev = reordered[movedIndex - 1]
  const next = reordered[movedIndex + 1]

  let singleOrder: number | undefined = undefined
  if (!prev && next) {
    singleOrder = next.sort_order - SORT_ORDER_STEP
  } else if (prev && !next) {
    singleOrder = prev.sort_order + SORT_ORDER_STEP
  } else if (prev && next && next.sort_order - prev.sort_order >= 2) {
    singleOrder = Math.floor((prev.sort_order + next.sort_order) / 2)
  }

  if (singleOrder !== undefined && Math.abs(singleOrder) <= MAX_SAFE_INT32_ORDER) {
    return new Map([[moved.id, singleOrder]])
  }

  const updates = new Map<number, number>()
  for (const [idx, item] of reordered.entries()) {
    const nextOrder = (idx + 1) * SORT_ORDER_STEP
    if (item.sort_order !== nextOrder) {
      updates.set(item.id, nextOrder)
    }
  }
  return updates
}

function buildNextNoteTitle(notes: Note[]): string {
  const existingTitles = new Set(notes.map((item) => item.title.trim()))
  let index = 1
  while (existingTitles.has(`新记事 ${index}`)) {
    index += 1
  }
  return `新记事 ${index}`
}

function hasMetaDiff(note: Note | undefined, snap: NoteSnapshot | undefined): boolean {
  if (!note || !snap) {
    return false
  }
  return note.title !== snap.title || note.sort_order !== snap.sort_order
}

function hasContentDiff(note: Note | undefined, snap: NoteSnapshot | undefined): boolean {
  if (!note || !snap) {
    return false
  }
  return note.content !== snap.content
}

function hasNoteDiff(note: Note | undefined, snap: NoteSnapshot | undefined): boolean {
  return hasMetaDiff(note, snap) || hasContentDiff(note, snap)
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

  function applySavedMeta(id: number, saved: NoteMeta): void {
    const current = findNote(id)
    if (!current) {
      return
    }
    const prevSnap = ctx.savedSnapshots.value.get(id)
    ctx.savedSnapshots.value.set(id, {
      content: prevSnap?.content ?? current.content,
      sort_order: saved.sort_order,
      title: saved.title,
    })
    current.created_at = saved.created_at
    current.updated_at = saved.updated_at
  }

  function applySavedContent(id: number, saved: Note): void {
    const current = findNote(id)
    if (!current) {
      return
    }
    const prevSnap = ctx.savedSnapshots.value.get(id)
    ctx.savedSnapshots.value.set(id, {
      content: saved.content,
      sort_order: prevSnap?.sort_order ?? saved.sort_order,
      title: prevSnap?.title ?? saved.title,
    })
    current.created_at = saved.created_at
    current.updated_at = saved.updated_at
  }

  function rescheduleIfEditedDuringFlight(id: number): void {
    const current = findNote(id)
    const snap = ctx.savedSnapshots.value.get(id)
    if (!current || !snap) {
      return
    }
    const metaStillDirty = hasMetaDiff(current, snap)
    const contentStillDirty = hasContentDiff(current, snap)
    if (contentStillDirty || (metaStillDirty && current.title.trim() !== '')) {
      scheduleAutoSave(id)
    }
  }

  async function executeSave(
    note: Note,
    dirty: { content: boolean; meta: boolean },
  ): Promise<boolean> {
    const { id } = note
    ctx.savingIds.value.add(id)
    ctx.error.value = undefined
    try {
      if (dirty.meta) {
        const savedMeta = await updateNoteMetaItem(id, {
          sort_order: note.sort_order,
          title: note.title,
        })
        applySavedMeta(id, savedMeta)
      }
      if (dirty.content) {
        const savedNote = await updateNoteContentItem(id, { content: note.content })
        applySavedContent(id, savedNote)
      }
      rescheduleIfEditedDuringFlight(id)
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
    const snap = ctx.savedSnapshots.value.get(id)
    if (!note) {
      return false
    }
    const meta = hasMetaDiff(note, snap)
    const content = hasContentDiff(note, snap)
    if (!meta && !content) {
      return true
    }
    if (meta && note.title.trim() === '') {
      ctx.error.value = '记事页签标题不能为空'
      return false
    }

    const savePromise = executeSave(note, { content, meta })
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

  async function saveNoteMetaOnly(id: number): Promise<boolean> {
    const pending = ctx.inFlightSaves.get(id)
    if (pending) {
      await pending
    }
    const note = findNote(id)
    if (!note) {
      return false
    }
    const snap = ctx.savedSnapshots.value.get(id)
    if (!hasMetaDiff(note, snap)) {
      return true
    }
    let { title } = note
    if (title.trim() === '') {
      title = snap?.title ?? '未命名记事'
    }
    const savedMeta = await updateNoteMetaItem(id, {
      sort_order: note.sort_order,
      title,
    })
    applySavedMeta(id, savedMeta)
    return true
  }

  return {
    findNote,
    flushNote,
    isNoteDirty,
    saveNote,
    saveNoteMetaOnly,
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
      const sortOrder = getNextSortOrder(notes.value)
      const created = await createNoteItem({ content: '', sort_order: sortOrder, title: nextTitle })
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

  async function reorderNote(
    draggedId: number,
    targetId: number,
    placement: TabDropPlacement,
  ): Promise<boolean> {
    const prevList = [...notes.value]
    const moveResult = buildReorderedNotes(prevList, { draggedId, placement, targetId })
    if (!moveResult) {
      return false
    }

    const orderUpdates = computeReorderedSortOrders(moveResult.reordered, moveResult.insertIdx)
    const prevOrders = new Map(prevList.map((item) => [item.id, item.sort_order]))

    notes.value = moveResult.reordered
    applySortOrders(notes.value, orderUpdates)

    error.value = undefined
    try {
      await Promise.all([...orderUpdates.keys()].map((id) => helper.saveNoteMetaOnly(id)))
      return true
    } catch (err) {
      notes.value = prevList
      applySortOrders(notes.value, prevOrders)
      error.value = extractErrorMessage(err, '调整记事页签顺序失败')
      return false
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
    loadNotes,
    loaded,
    loading,
    notes,
    reorderNote,
    saveNote: helper.saveNote,
    selectNote,
    updateDraftContent,
    updateDraftTitle,
    uploadImage,
  }
})
