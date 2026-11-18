<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { indent } from '@milkdown/kit/plugin/indent'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { upload, uploadConfig, type Uploader } from '@milkdown/kit/plugin/upload'
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import { gfm, insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { Decoration } from '@milkdown/kit/prose/view'
import { callCommand, getMarkdown, replaceAll } from '@milkdown/kit/utils'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'
import { extractErrorMessage } from '@/api/client'

const IMAGE_EXT_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i

const { modelValue, noteId, uploadImage } = defineProps<{
  modelValue: string
  noteId: number
  uploadImage: (file: File) => Promise<string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
  'upload-error': [message: string]
}>()

const editorRootRef = ref<HTMLElement | undefined>(undefined)
const fileInputRef = ref<HTMLInputElement | undefined>(undefined)
const uploadingCount = ref(0)

let editorInstance: Editor | undefined = undefined
let editorReady = false
let destroyed = false
let suppressUpdate = false
let lastEmittedMarkdown = modelValue

function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_PATTERN.test(file.name)
}

function collectImageFiles(files: FileList | File[]): File[] {
  const result: File[] = []
  for (const file of files) {
    if (isSupportedImageFile(file)) {
      result.push(file)
    }
  }
  return result
}

async function uploadSingleImage(file: File): Promise<string | undefined> {
  try {
    return await uploadImage(file)
  } catch (err) {
    emit('upload-error', extractErrorMessage(err, '图片上传失败'))
    return undefined
  }
}

const handleMilkdownUpload: Uploader = async (files, schema) => {
  const imageNode = schema.nodes.image
  if (!imageNode) {
    return []
  }
  const imageFiles = collectImageFiles(files)
  if (imageFiles.length === 0) {
    return []
  }

  uploadingCount.value += imageFiles.length
  try {
    const urls = await Promise.all(imageFiles.map((file) => uploadSingleImage(file)))
    const nodes = []
    for (const [idx, file] of imageFiles.entries()) {
      const url = urls[idx]
      if (url) {
        const node = imageNode.createAndFill({ alt: file.name, src: url })
        if (node) {
          nodes.push(node)
        }
      }
    }
    return nodes
  } finally {
    uploadingCount.value = Math.max(0, uploadingCount.value - imageFiles.length)
  }
}

function createUploadPlaceholder(pos: number, spec: Parameters<typeof Decoration.widget>[2]) {
  const widgetDOM = document.createElement('span')
  widgetDOM.className = 'milkdown-upload-placeholder'
  widgetDOM.textContent = '图片上传中...'
  return Decoration.widget(pos, widgetDOM, spec)
}

function configureEditor(ctx: Ctx, root: HTMLElement): void {
  ctx.set(rootCtx, root)
  ctx.set(defaultValueCtx, modelValue)
  ctx.update(editorViewOptionsCtx, (prev) => ({
    ...prev,
    attributes: {
      class: 'milkdown-prosemirror',
      spellcheck: 'false',
    },
  }))

  ctx.update(uploadConfig.key, (prev) => ({
    ...prev,
    enableHtmlFileUploader: true,
    uploadWidgetFactory: createUploadPlaceholder,
    uploader: handleMilkdownUpload,
  }))

  ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
    if (suppressUpdate) {
      return
    }
    lastEmittedMarkdown = markdown
    emit('update:modelValue', markdown)
  })
}

function getCurrentMarkdown(): string {
  if (!editorInstance || !editorReady) {
    return modelValue
  }
  return editorInstance.action(getMarkdown())
}

function syncNow(): string {
  const current = getCurrentMarkdown()
  if (current !== lastEmittedMarkdown) {
    lastEmittedMarkdown = current
    emit('update:modelValue', current)
  }
  return current
}

function applyExternalMarkdown(markdown: string): void {
  if (!editorInstance || !editorReady) {
    return
  }
  suppressUpdate = true
  try {
    lastEmittedMarkdown = markdown
    editorInstance.action(replaceAll(markdown, true))
  } finally {
    suppressUpdate = false
  }
}

function runCmd(action: (ctx: Ctx) => unknown): void {
  if (!editorInstance || !editorReady) {
    return
  }
  editorInstance.action(action)
}

function focusEditor(): void {
  runCmd((ctx) => {
    ctx.get(editorViewCtx).focus()
  })
}

function triggerImagePicker(): void {
  fileInputRef.value?.click()
}

async function handleFileInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const rawFiles = input.files
  input.value = ''
  if (!rawFiles || !editorInstance || !editorReady) {
    return
  }
  const files = collectImageFiles(rawFiles)
  if (files.length === 0) {
    return
  }

  uploadingCount.value += files.length
  try {
    const urls = await Promise.all(files.map((file) => uploadSingleImage(file)))
    for (const [idx, file] of files.entries()) {
      const url = urls[idx]
      if (url) {
        runCmd(callCommand(insertImageCommand.key, { alt: file.name, src: url }))
      }
    }
    syncNow()
  } finally {
    uploadingCount.value = Math.max(0, uploadingCount.value - files.length)
  }
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    syncNow()
    emit('save')
  }
}

watch(
  () => [noteId, modelValue] as const,
  ([nextId, nextValue], [prevId]) => {
    if (!editorInstance || !editorReady) {
      return
    }
    if (nextId !== prevId) {
      applyExternalMarkdown(nextValue)
      return
    }
    if (nextValue !== lastEmittedMarkdown) {
      applyExternalMarkdown(nextValue)
    }
  },
)

onMounted(async () => {
  const root = editorRootRef.value
  if (!root) {
    return
  }

  const editor = Editor.make()
    .config((ctx) => configureEditor(ctx, root))
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
    .use(listener)
    .use(upload)

  editorInstance = editor
  await editor.create()
  if (destroyed) {
    await editor.destroy()
    return
  }
  editorReady = true
})

onBeforeUnmount(() => {
  destroyed = true
  editorReady = false
  if (editorInstance) {
    void editorInstance.destroy()
    editorInstance = undefined
  }
})

defineExpose({
  focus: focusEditor,
  getMarkdown: getCurrentMarkdown,
  syncNow,
})
</script>

<template>
  <div class="milkdown-shell" @keydown="handleEditorKeydown">
    <div class="editor-toolbar" role="toolbar" aria-label="Markdown 格式工具栏">
      <div class="toolbar-group">
        <button
          type="button"
          class="tool-btn"
          title="撤销 (Ctrl+Z)"
          @mousedown.prevent
          @click="runCmd(callCommand(undoCommand.key))"
        >
          撤销
        </button>
        <button
          type="button"
          class="tool-btn"
          title="重做 (Ctrl+Y)"
          @mousedown.prevent
          @click="runCmd(callCommand(redoCommand.key))"
        >
          重做
        </button>
      </div>

      <span class="toolbar-divider" aria-hidden="true" />

      <div class="toolbar-group">
        <button
          type="button"
          class="tool-btn"
          title="一级标题"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInHeadingCommand.key, 1))"
        >
          H1
        </button>
        <button
          type="button"
          class="tool-btn"
          title="二级标题"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInHeadingCommand.key, 2))"
        >
          H2
        </button>
        <button
          type="button"
          class="tool-btn"
          title="三级标题"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInHeadingCommand.key, 3))"
        >
          H3
        </button>
      </div>

      <span class="toolbar-divider" aria-hidden="true" />

      <div class="toolbar-group">
        <button
          type="button"
          class="tool-btn tool-bold"
          title="加粗 (Ctrl+B)"
          @mousedown.prevent
          @click="runCmd(callCommand(toggleStrongCommand.key))"
        >
          B
        </button>
        <button
          type="button"
          class="tool-btn tool-italic"
          title="斜体 (Ctrl+I)"
          @mousedown.prevent
          @click="runCmd(callCommand(toggleEmphasisCommand.key))"
        >
          I
        </button>
        <button
          type="button"
          class="tool-btn tool-strike"
          title="删除线"
          @mousedown.prevent
          @click="runCmd(callCommand(toggleStrikethroughCommand.key))"
        >
          S
        </button>
        <button
          type="button"
          class="tool-btn tool-mono"
          title="行内代码"
          @mousedown.prevent
          @click="runCmd(callCommand(toggleInlineCodeCommand.key))"
        >
          `代码`
        </button>
      </div>

      <span class="toolbar-divider" aria-hidden="true" />

      <div class="toolbar-group">
        <button
          type="button"
          class="tool-btn"
          title="无序列表"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInBulletListCommand.key))"
        >
          列表
        </button>
        <button
          type="button"
          class="tool-btn"
          title="有序列表"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInOrderedListCommand.key))"
        >
          1. 列表
        </button>
        <button
          type="button"
          class="tool-btn"
          title="引用块"
          @mousedown.prevent
          @click="runCmd(callCommand(wrapInBlockquoteCommand.key))"
        >
          引用
        </button>
        <button
          type="button"
          class="tool-btn"
          title="代码块"
          @mousedown.prevent
          @click="runCmd(callCommand(createCodeBlockCommand.key))"
        >
          代码块
        </button>
        <button
          type="button"
          class="tool-btn"
          title="插入表格"
          @mousedown.prevent
          @click="runCmd(callCommand(insertTableCommand.key, { row: 3, col: 3 }))"
        >
          表格
        </button>
        <button
          type="button"
          class="tool-btn"
          title="分割线"
          @mousedown.prevent
          @click="runCmd(callCommand(insertHrCommand.key))"
        >
          分割线
        </button>
      </div>

      <span class="toolbar-divider" aria-hidden="true" />

      <div class="toolbar-group">
        <button
          type="button"
          class="tool-btn tool-image"
          :disabled="uploadingCount > 0"
          title="插入或上传图片（也支持 Ctrl+V 粘贴截图 / 拖拽图片）"
          @mousedown.prevent
          @click="triggerImagePicker"
        >
          {{ uploadingCount > 0 ? '上传中...' : '插入图片' }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*,.svg"
          multiple
          hidden
          @change="handleFileInputChange"
        />
      </div>
    </div>

    <div ref="editorRootRef" class="milkdown-host" @click.self="focusEditor" />
  </div>
</template>

<style scoped>
.milkdown-shell {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.55rem 0.85rem;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.toolbar-divider {
  width: 1px;
  height: 1.15rem;
  background: var(--border-strong);
  margin: 0 0.2rem;
}

.tool-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-regular);
  border-radius: 6px;
  padding: 0.26rem 0.52rem;
  font-size: 0.8rem;
  line-height: 1.25;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover:not(:disabled) {
  background: var(--surface-muted);
  color: var(--text-primary);
}

.tool-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tool-bold {
  font-weight: 700;
}

.tool-italic {
  font-style: italic;
}

.tool-strike {
  text-decoration: line-through;
}

.tool-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.tool-image {
  color: var(--primary-color);
  font-weight: 500;
}

.milkdown-host {
  min-height: 440px;
  cursor: text;
}

.milkdown-host :deep(.milkdown-prosemirror) {
  min-height: 440px;
  padding: 1.35rem 1.5rem 2.5rem;
  outline: none;
  color: var(--text-regular);
  font-size: 0.96rem;
  line-height: 1.72;
}

.milkdown-host :deep(.milkdown-prosemirror > :first-child) {
  margin-top: 0;
}

.milkdown-host :deep(.milkdown-prosemirror h1),
.milkdown-host :deep(.milkdown-prosemirror h2),
.milkdown-host :deep(.milkdown-prosemirror h3),
.milkdown-host :deep(.milkdown-prosemirror h4) {
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.35;
  margin: 1.25rem 0 0.55rem;
}

.milkdown-host :deep(.milkdown-prosemirror h1) {
  font-size: 1.65rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border-color);
}

.milkdown-host :deep(.milkdown-prosemirror h2) {
  font-size: 1.35rem;
}

.milkdown-host :deep(.milkdown-prosemirror h3) {
  font-size: 1.12rem;
}

.milkdown-host :deep(.milkdown-prosemirror p) {
  margin: 0.55rem 0;
}

.milkdown-host :deep(.milkdown-prosemirror a) {
  color: var(--primary-color);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.milkdown-host :deep(.milkdown-prosemirror ul),
.milkdown-host :deep(.milkdown-prosemirror ol) {
  padding-left: 1.5rem;
  margin: 0.55rem 0;
}

.milkdown-host :deep(.milkdown-prosemirror ul) {
  list-style-type: disc;
}

.milkdown-host :deep(.milkdown-prosemirror ol) {
  list-style-type: decimal;
}

.milkdown-host :deep(.milkdown-prosemirror li) {
  margin: 0.25rem 0;
}

.milkdown-host :deep(.milkdown-prosemirror li[data-item-type='task']) {
  list-style-type: none;
  position: relative;
}

.milkdown-host :deep(.milkdown-prosemirror li[data-item-type='task']::before) {
  content: '';
  position: absolute;
  left: -1.35rem;
  top: 0.38rem;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 4px;
  border: 1.5px solid var(--border-strong);
  background: var(--input-bg);
}

.milkdown-host :deep(.milkdown-prosemirror li[data-item-type='task'][data-checked='true']::before) {
  border-color: var(--primary-color);
  background: var(--primary-color);
  box-shadow: inset 0 0 0 2px var(--card-bg);
}

.milkdown-host :deep(.milkdown-prosemirror blockquote) {
  margin: 0.75rem 0;
  padding: 0.35rem 0.95rem;
  border-left: 3px solid var(--primary-color);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  border-radius: 0 8px 8px 0;
}

.milkdown-host :deep(.milkdown-prosemirror code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: var(--surface-muted);
  color: var(--text-primary);
  padding: 0.12rem 0.36rem;
  border-radius: 4px;
}

.milkdown-host :deep(.milkdown-prosemirror pre) {
  margin: 0.8rem 0;
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: var(--surface-muted);
  border: 1px solid var(--border-color);
  overflow-x: auto;
}

.milkdown-host :deep(.milkdown-prosemirror pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.88rem;
  line-height: 1.55;
}

.milkdown-host :deep(.milkdown-prosemirror hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1.15rem 0;
}

.milkdown-host :deep(.milkdown-prosemirror table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.9rem 0;
  font-size: 0.9rem;
}

.milkdown-host :deep(.milkdown-prosemirror th),
.milkdown-host :deep(.milkdown-prosemirror td) {
  border: 1px solid var(--border-strong);
  padding: 0.45rem 0.7rem;
  text-align: left;
}

.milkdown-host :deep(.milkdown-prosemirror th) {
  background: var(--surface-muted);
  color: var(--text-primary);
  font-weight: 600;
}

.milkdown-host :deep(.milkdown-prosemirror img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.75rem 0;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.milkdown-host :deep(.milkdown-prosemirror img.ProseMirror-selectednode) {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.milkdown-host :deep(.milkdown-upload-placeholder) {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.84rem;
  background: var(--surface-muted);
  color: var(--text-secondary);
}
</style>
