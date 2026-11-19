import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

export const DEFAULT_EDITOR_ZOOM = 1
export const MIN_EDITOR_ZOOM = 0.5
export const MAX_EDITOR_ZOOM = 3

const WHEEL_LINE_HEIGHT_PX = 16
const WHEEL_PAGE_HEIGHT_PX = 100
const TRACKPAD_DELTA_THRESHOLD = 40
const TRACKPAD_ZOOM_SENSITIVITY = 0.008
const MOUSE_WHEEL_DELTA_CAP = 120
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.0012
const ZOOM_PRECISION = 1000

interface ZoomAnchor {
  offsetX: number
  offsetY: number
}

interface TouchPinchSession {
  startDist: number
  startZoom: number
}

interface TouchPinchMetrics {
  dist: number
  midX: number
  midY: number
}

interface WebKitGestureEvent extends UIEvent {
  clientX?: number
  clientY?: number
  scale?: number
}

export interface EditorZoomOptions {
  containerRef: Readonly<Ref<HTMLElement | undefined>>
  zoom: Ref<number>
  onZoomChange?: (nextZoom: number) => void
}

export function clampEditorZoom(scale: number): number {
  if (!Number.isFinite(scale)) {
    return DEFAULT_EDITOR_ZOOM
  }
  const clamped = Math.max(MIN_EDITOR_ZOOM, Math.min(MAX_EDITOR_ZOOM, scale))
  return Math.round(clamped * ZOOM_PRECISION) / ZOOM_PRECISION
}

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) {
    return event.deltaY * WHEEL_LINE_HEIGHT_PX
  }
  if (event.deltaMode === 2) {
    return event.deltaY * WHEEL_PAGE_HEIGHT_PX
  }
  return event.deltaY
}

function computeWheelZoomFactor(event: WheelEvent): number {
  const delta = normalizeWheelDelta(event)
  if (Math.abs(delta) < TRACKPAD_DELTA_THRESHOLD) {
    return Math.exp(-delta * TRACKPAD_ZOOM_SENSITIVITY)
  }
  const capped = Math.max(-MOUSE_WHEEL_DELTA_CAP, Math.min(MOUSE_WHEEL_DELTA_CAP, delta))
  return Math.exp(-capped * MOUSE_WHEEL_ZOOM_SENSITIVITY)
}

function getTouchPinchMetrics(touches: TouchList): TouchPinchMetrics | undefined {
  if (touches.length !== 2) {
    return undefined
  }
  const first = touches.item(0)
  const second = touches.item(1)
  if (!first || !second) {
    return undefined
  }
  return {
    dist: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
    midX: (first.clientX + second.clientX) / 2,
    midY: (first.clientY + second.clientY) / 2,
  }
}

function getAnchorFromClientPoint(
  host: HTMLElement,
  clientX: number | undefined,
  clientY: number | undefined,
): ZoomAnchor {
  const rect = host.getBoundingClientRect()
  if (typeof clientX === 'number' && typeof clientY === 'number') {
    return {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
    }
  }
  return {
    offsetX: rect.width / 2,
    offsetY: rect.height / 2,
  }
}

export function useEditorZoom(options: EditorZoomOptions): void {
  const { containerRef, onZoomChange, zoom } = options
  let boundHost: HTMLElement | undefined = undefined
  let touchPinch: TouchPinchSession | undefined = undefined
  let gestureStartZoom: number | undefined = undefined

  function applyZoomWithAnchor(host: HTMLElement, nextScale: number, anchor: ZoomAnchor): void {
    const prevZoom = clampEditorZoom(zoom.value)
    const nextZoom = clampEditorZoom(nextScale)
    if (nextZoom === prevZoom) {
      return
    }
    const contentX = (host.scrollLeft + anchor.offsetX) / prevZoom
    const contentY = (host.scrollTop + anchor.offsetY) / prevZoom

    zoom.value = nextZoom
    host.style.setProperty('--editor-zoom', String(nextZoom))
    host.scrollLeft = Math.max(0, contentX * nextZoom - anchor.offsetX)
    host.scrollTop = Math.max(0, contentY * nextZoom - anchor.offsetY)
    onZoomChange?.(nextZoom)
  }

  function handleWheel(event: WheelEvent): void {
    if (!boundHost || (!event.ctrlKey && !event.metaKey)) {
      return
    }
    event.preventDefault()
    const anchor = getAnchorFromClientPoint(boundHost, event.clientX, event.clientY)
    applyZoomWithAnchor(boundHost, zoom.value * computeWheelZoomFactor(event), anchor)
  }

  function handleTouchStart(event: TouchEvent): void {
    const metrics = getTouchPinchMetrics(event.touches)
    if (!metrics || metrics.dist <= 0) {
      touchPinch = undefined
      return
    }
    touchPinch = {
      startDist: metrics.dist,
      startZoom: zoom.value,
    }
  }

  function handleTouchMove(event: TouchEvent): void {
    if (!boundHost || event.touches.length !== 2) {
      touchPinch = undefined
      return
    }
    event.preventDefault()
    const metrics = getTouchPinchMetrics(event.touches)
    if (!metrics || metrics.dist <= 0) {
      return
    }
    if (!touchPinch) {
      touchPinch = { startDist: metrics.dist, startZoom: zoom.value }
      return
    }
    const anchor = getAnchorFromClientPoint(boundHost, metrics.midX, metrics.midY)
    applyZoomWithAnchor(
      boundHost,
      touchPinch.startZoom * (metrics.dist / touchPinch.startDist),
      anchor,
    )
  }

  function handleTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      touchPinch = undefined
    }
  }

  function handleGestureStart(event: Event): void {
    event.preventDefault()
    if (!touchPinch) {
      gestureStartZoom = zoom.value
    }
  }

  function handleGestureChange(event: Event): void {
    event.preventDefault()
    if (!boundHost || touchPinch || gestureStartZoom === undefined) {
      return
    }
    const gestureEvent = event as WebKitGestureEvent
    if (typeof gestureEvent.scale !== 'number' || gestureEvent.scale <= 0) {
      return
    }
    const anchor = getAnchorFromClientPoint(boundHost, gestureEvent.clientX, gestureEvent.clientY)
    applyZoomWithAnchor(boundHost, gestureStartZoom * gestureEvent.scale, anchor)
  }

  function handleGestureEnd(event: Event): void {
    event.preventDefault()
    gestureStartZoom = undefined
  }

  function unbindHost(): void {
    if (!boundHost) {
      return
    }
    boundHost.removeEventListener('wheel', handleWheel)
    boundHost.removeEventListener('touchstart', handleTouchStart)
    boundHost.removeEventListener('touchmove', handleTouchMove)
    boundHost.removeEventListener('touchend', handleTouchEnd)
    boundHost.removeEventListener('touchcancel', handleTouchEnd)
    boundHost.removeEventListener('gesturestart', handleGestureStart)
    boundHost.removeEventListener('gesturechange', handleGestureChange)
    boundHost.removeEventListener('gestureend', handleGestureEnd)
    boundHost = undefined
    touchPinch = undefined
    gestureStartZoom = undefined
  }

  function bindHost(host: HTMLElement | undefined): void {
    unbindHost()
    if (!host) {
      return
    }
    boundHost = host
    host.addEventListener('wheel', handleWheel, { passive: false })
    host.addEventListener('touchstart', handleTouchStart, { passive: true })
    host.addEventListener('touchmove', handleTouchMove, { passive: false })
    host.addEventListener('touchend', handleTouchEnd, { passive: true })
    host.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    host.addEventListener('gesturestart', handleGestureStart, { passive: false })
    host.addEventListener('gesturechange', handleGestureChange, { passive: false })
    host.addEventListener('gestureend', handleGestureEnd, { passive: false })
  }

  watch(containerRef, bindHost)

  onMounted(() => {
    bindHost(containerRef.value)
  })

  onBeforeUnmount(unbindHost)
}
