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
import { history } from '@milkdown/kit/plugin/history'
import { indent } from '@milkdown/kit/plugin/indent'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { upload, uploadConfig, type Uploader } from '@milkdown/kit/plugin/upload'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Decoration } from '@milkdown/kit/prose/view'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'
import { extractErrorMessage } from '@/api/client'
import { resizableImageView } from '@/utils/milkdown-image-resize'

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

function focusEditor(): void {
  if (!editorInstance || !editorReady) {
    return
  }
  editorInstance.action((ctx) => {
    ctx.get(editorViewCtx).focus()
  })
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
    .use(resizableImageView)
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
    <div ref="editorRootRef" class="milkdown-host" @click.self="focusEditor" />
  </div>
</template>

<style scoped>
.milkdown-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
}

.milkdown-host {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  cursor: text;
}

.milkdown-host :deep(.milkdown) {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

.milkdown-host :deep(.milkdown-prosemirror) {
  flex: 1 0 auto;
  padding: 1.35rem 1.5rem 2.5rem;
  outline: none;
  color: var(--text-regular);
  font-family:
    'LXGW WenKai GB',
    'PingFang SC',
    'Microsoft YaHei',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  font-size: 1rem;
  line-height: 1.78;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'LXGW WenKai GB', monospace;
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

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resizable) {
  position: relative;
  display: inline-block;
  max-width: 100%;
  margin: 0.75rem 0;
  line-height: 0;
  vertical-align: middle;
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resizable .milkdown-image-el) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.milkdown-host
  :deep(.milkdown-prosemirror .milkdown-image-resizable.is-selected .milkdown-image-el),
.milkdown-host
  :deep(
    .milkdown-prosemirror .milkdown-image-resizable.ProseMirror-selectednode .milkdown-image-el
  ),
.milkdown-host
  :deep(.milkdown-prosemirror .milkdown-image-resizable.is-resizing .milkdown-image-el) {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resize-handle) {
  position: absolute;
  z-index: 2;
  opacity: 0;
  touch-action: none;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease,
    transform 0.15s ease;
}

.milkdown-host
  :deep(.milkdown-prosemirror .milkdown-image-resizable:hover .milkdown-image-resize-handle),
.milkdown-host
  :deep(.milkdown-prosemirror .milkdown-image-resizable.is-selected .milkdown-image-resize-handle),
.milkdown-host
  :deep(
    .milkdown-prosemirror
      .milkdown-image-resizable.ProseMirror-selectednode
      .milkdown-image-resize-handle
  ),
.milkdown-host
  :deep(.milkdown-prosemirror .milkdown-image-resizable.is-resizing .milkdown-image-resize-handle) {
  opacity: 1;
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resize-handle-right) {
  top: 50%;
  right: 6px;
  width: 6px;
  height: 36px;
  max-height: 45%;
  min-height: 16px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
  cursor: ew-resize;
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resize-handle-right:hover),
.milkdown-host
  :deep(
    .milkdown-prosemirror .milkdown-image-resizable.is-resizing .milkdown-image-resize-handle-right
  ) {
  background: var(--primary-color);
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resize-handle-corner) {
  right: -5px;
  bottom: -5px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--card-bg);
  border: 2px solid var(--primary-color);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  cursor: nwse-resize;
}

.milkdown-host :deep(.milkdown-prosemirror .milkdown-image-resize-handle-corner:hover),
.milkdown-host
  :deep(
    .milkdown-prosemirror .milkdown-image-resizable.is-resizing .milkdown-image-resize-handle-corner
  ) {
  background: var(--primary-color);
  transform: scale(1.1);
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
