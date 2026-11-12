import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

export interface InfiniteScrollOptions {
  sentinelRef: Readonly<Ref<HTMLElement | undefined>>
  canLoadMore: () => boolean
  onLoadMore: () => void
  rootMarginPx?: number
}

export function useInfiniteScroll(options: InfiniteScrollOptions): void {
  const { sentinelRef, canLoadMore, onLoadMore, rootMarginPx = 240 } = options
  let observer: IntersectionObserver | undefined = undefined

  function checkSentinelInView(): void {
    const el = sentinelRef.value
    if (!el || !canLoadMore()) {
      return
    }
    const rect = el.getBoundingClientRect()
    if (rect.top <= globalThis.innerHeight + rootMarginPx) {
      onLoadMore()
    }
  }

  function setupObserver(): void {
    observer?.disconnect()
    const el = sentinelRef.value
    if (typeof IntersectionObserver === 'undefined' || !el) {
      return
    }
    observer = new IntersectionObserver(
      ([first]) => {
        if (first?.isIntersecting && canLoadMore()) {
          onLoadMore()
        }
      },
      { rootMargin: `${rootMarginPx}px 0px` },
    )
    observer.observe(el)
  }

  watch(sentinelRef, setupObserver)

  onMounted(() => {
    setupObserver()
    globalThis.addEventListener('scroll', checkSentinelInView, { passive: true })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    globalThis.removeEventListener('scroll', checkSentinelInView)
  })
}
