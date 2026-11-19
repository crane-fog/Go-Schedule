import { imageSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'

const IMAGE_ALT_WIDTH_PATTERN = /^(?<baseAlt>[\s\S]*)\|(?<width>\d+)$/
const MIN_IMAGE_WIDTH = 48
const MAX_IMAGE_WIDTH = 4096

type ResizeDirection = 'corner' | 'right'

const RESIZE_CURSORS: Record<ResizeDirection, string> = {
  corner: 'nwse-resize',
  right: 'ew-resize',
}

interface ParsedImageAlt {
  alt: string
  width: number | undefined
}

interface ResizeSession {
  currentWidth: number
  dir: ResizeDirection
  maxWidth: number
  moved: boolean
  startHeight: number
  startWidth: number
  startX: number
  startY: number
}

export function clampImageWidth(width: number, maxWidth: number): number {
  const upperBound = Math.max(MIN_IMAGE_WIDTH, Math.min(Math.round(maxWidth), MAX_IMAGE_WIDTH))
  return Math.max(MIN_IMAGE_WIDTH, Math.min(Math.round(width), upperBound))
}

export function parseImageAltWidth(rawAlt: string): ParsedImageAlt {
  const match = IMAGE_ALT_WIDTH_PATTERN.exec(rawAlt)
  if (!match?.groups) {
    return { alt: rawAlt, width: undefined }
  }
  const baseAlt = match.groups.baseAlt ?? ''
  const parsedWidth = Number.parseInt(match.groups.width ?? '', 10)
  if (
    !Number.isFinite(parsedWidth) ||
    parsedWidth < MIN_IMAGE_WIDTH ||
    parsedWidth > MAX_IMAGE_WIDTH
  ) {
    return { alt: rawAlt, width: undefined }
  }
  return { alt: baseAlt, width: parsedWidth }
}

export function formatImageAltWidth(rawAlt: string, width: number | undefined): string {
  const { alt } = parseImageAltWidth(rawAlt)
  if (width === undefined || !Number.isFinite(width)) {
    return alt
  }
  const normalized = clampImageWidth(width, MAX_IMAGE_WIDTH)
  return `${alt}|${normalized}`
}

function getAvailableMaxWidth(wrapper: HTMLElement): number {
  const parent = wrapper.parentElement
  if (!parent) {
    return MAX_IMAGE_WIDTH
  }
  const style = globalThis.getComputedStyle(parent)
  const paddingX =
    Number.parseFloat(style.paddingLeft || '0') + Number.parseFloat(style.paddingRight || '0')
  const available = Math.floor(parent.clientWidth - paddingX)
  if (available >= MIN_IMAGE_WIDTH) {
    return Math.min(available, MAX_IMAGE_WIDTH)
  }
  return MAX_IMAGE_WIDTH
}

function computeNextWidth(session: ResizeSession, event: PointerEvent): number {
  const dx = event.clientX - session.startX
  if (session.dir === 'right' || session.startHeight <= 0) {
    return clampImageWidth(session.startWidth + dx, session.maxWidth)
  }
  const dy = event.clientY - session.startY
  const widthFromX = session.startWidth + dx
  const widthFromY = (session.startHeight + dy) * (session.startWidth / session.startHeight)
  let rawWidth = widthFromY
  if (Math.abs(dx / session.startWidth) >= Math.abs(dy / session.startHeight)) {
    rawWidth = widthFromX
  }
  return clampImageWidth(rawWidth, session.maxWidth)
}

function createResizeHandle(dir: ResizeDirection): HTMLSpanElement {
  const handle = document.createElement('span')
  handle.className = `milkdown-image-resize-handle milkdown-image-resize-handle-${dir}`
  handle.dataset.resizeDir = dir
  handle.setAttribute('aria-hidden', 'true')
  handle.addEventListener('dragstart', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  return handle
}

function isResizeHandleTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.classList.contains('milkdown-image-resize-handle')
}

function syncImageElement(img: HTMLImageElement, node: ProseNode): void {
  const src = String(node.attrs.src ?? '')
  const rawAlt = String(node.attrs.alt ?? '')
  const title = String(node.attrs.title ?? '')
  const { alt, width } = parseImageAltWidth(rawAlt)

  if (img.getAttribute('src') !== src) {
    img.src = src
  }
  img.alt = alt
  if (title) {
    img.title = title
  } else {
    img.removeAttribute('title')
  }
  if (width) {
    img.style.width = `${width}px`
  } else {
    img.style.removeProperty('width')
  }
}

function commitImageWidth(
  view: EditorView,
  target: { expectedType: ProseNode['type']; pos: number | undefined },
  width: number,
): void {
  if (typeof target.pos !== 'number') {
    return
  }
  const nodeAtPos = view.state.doc.nodeAt(target.pos)
  if (!nodeAtPos || nodeAtPos.type !== target.expectedType) {
    return
  }
  const rawAlt = String(nodeAtPos.attrs.alt ?? '')
  const nextAlt = formatImageAltWidth(rawAlt, width)
  if (nextAlt !== rawAlt) {
    view.dispatch(view.state.tr.setNodeAttribute(target.pos, 'alt', nextAlt))
  }
}

function createResizableImageNodeView(
  initialNode: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = initialNode
  let session: ResizeSession | undefined = undefined
  let prevBodyCursor = ''
  let prevBodyUserSelect = ''

  const wrapper = document.createElement('span')
  wrapper.className = 'milkdown-image-resizable'

  const img = document.createElement('img')
  img.className = 'milkdown-image-el'

  const rightHandle = createResizeHandle('right')
  const cornerHandle = createResizeHandle('corner')
  wrapper.append(img, rightHandle, cornerHandle)
  syncImageElement(img, currentNode)

  function teardownDragListeners(): void {
    globalThis.removeEventListener('pointermove', handlePointerMove)
    globalThis.removeEventListener('pointerup', handlePointerUp)
    globalThis.removeEventListener('pointercancel', handlePointerCancel)
    wrapper.classList.remove('is-resizing')
    document.body.style.cursor = prevBodyCursor
    document.body.style.userSelect = prevBodyUserSelect
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!session) {
      return
    }
    event.preventDefault()
    const nextWidth = computeNextWidth(session, event)
    if (nextWidth !== session.currentWidth) {
      session.currentWidth = nextWidth
      session.moved = true
      img.style.width = `${nextWidth}px`
    }
  }

  function finishDrag(cancelled: boolean): void {
    const activeSession = session
    if (!activeSession) {
      return
    }
    session = undefined
    teardownDragListeners()

    if (cancelled || !activeSession.moved) {
      syncImageElement(img, currentNode)
      return
    }

    commitImageWidth(
      view,
      { expectedType: currentNode.type, pos: getPos() },
      activeSession.currentWidth,
    )
  }

  function handlePointerUp(): void {
    finishDrag(false)
  }

  function handlePointerCancel(): void {
    finishDrag(true)
  }

  function startResize(dir: ResizeDirection, event: PointerEvent): void {
    if (!view.editable || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const rect = img.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }

    session = {
      currentWidth: Math.round(rect.width),
      dir,
      maxWidth: getAvailableMaxWidth(wrapper),
      moved: false,
      startHeight: rect.height,
      startWidth: rect.width,
      startX: event.clientX,
      startY: event.clientY,
    }
    prevBodyCursor = document.body.style.cursor
    prevBodyUserSelect = document.body.style.userSelect
    document.body.style.cursor = RESIZE_CURSORS[dir]
    document.body.style.userSelect = 'none'
    wrapper.classList.add('is-resizing')

    globalThis.addEventListener('pointermove', handlePointerMove)
    globalThis.addEventListener('pointerup', handlePointerUp)
    globalThis.addEventListener('pointercancel', handlePointerCancel)
  }

  rightHandle.addEventListener('pointerdown', (event) => startResize('right', event))
  cornerHandle.addEventListener('pointerdown', (event) => startResize('corner', event))

  return {
    deselectNode: () => {
      wrapper.classList.remove('is-selected')
    },
    destroy: () => {
      if (session) {
        session = undefined
        teardownDragListeners()
      }
    },
    dom: wrapper,
    ignoreMutation: () => true,
    selectNode: () => {
      wrapper.classList.add('is-selected')
    },
    stopEvent: (event) => Boolean(session) || isResizeHandleTarget(event.target),
    update: (updatedNode) => {
      if (updatedNode.type !== currentNode.type) {
        return false
      }
      currentNode = updatedNode
      if (!session) {
        syncImageElement(img, updatedNode)
      }
      return true
    },
  }
}

export const resizableImageView = $view(imageSchema.node, () => createResizableImageNodeView)
