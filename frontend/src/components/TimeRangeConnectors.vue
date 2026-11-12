<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BASE_OFFSET_PX,
  CARD_GAP_PX,
  LANE_STEP_PX,
  buildOrthogonalPath,
  buildRangePairSpecs,
  type RangePairSpec,
  type RenderedBracket,
} from '@/utils/range-connectors'
import type { ScheduleDisplayItem } from '@/utils/schedule-occurrences'

const {
  entries,
  listEl = undefined,
  enabled = true,
} = defineProps<{
  entries: ScheduleDisplayItem[]
  listEl?: HTMLElement | undefined
  enabled?: boolean
}>()

const emit = defineEmits<{
  gutterChange: [widthPx: number]
}>()

const svgHeight = ref(0)
const brackets = ref<RenderedBracket[]>([])

const specResult = computed(() => {
  if (!enabled) {
    return { maxLane: 0, pairs: [] }
  }
  return buildRangePairSpecs(entries)
})

const gutterWidth = computed(() => {
  if (specResult.value.pairs.length === 0) {
    return 0
  }
  return BASE_OFFSET_PX + specResult.value.maxLane * LANE_STEP_PX + 8
})

let resizeObserver: ResizeObserver | undefined = undefined

function buildKeyElementMap(container: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>()
  const nodes = container.querySelectorAll<HTMLElement>('[data-entry-key]')
  for (const node of nodes) {
    const key = node.dataset.entryKey
    if (key) {
      map.set(key, node)
    }
  }
  return map
}

function toRenderedBracket(
  pair: RangePairSpec,
  elMap: Map<string, HTMLElement>,
  fallbackBottomY: number,
): RenderedBracket | undefined {
  const startEl = elMap.get(pair.startKey)
  if (!startEl) {
    return undefined
  }
  const startY = Math.round(startEl.offsetTop + startEl.offsetHeight / 2)
  let endEl: HTMLElement | undefined = undefined
  if (pair.endKey) {
    endEl = elMap.get(pair.endKey)
  }
  let endY = fallbackBottomY
  let hasEnd = false
  if (endEl) {
    endY = Math.round(endEl.offsetTop + endEl.offsetHeight / 2)
    hasEnd = true
  }
  const width = gutterWidth.value
  const path = buildOrthogonalPath({
    endY,
    gutterWidth: width,
    hasEnd,
    lane: pair.lane,
    startY,
  })
  return {
    color: pair.color,
    done: pair.done,
    endY,
    hasEnd,
    path,
    rightX: width - CARD_GAP_PX,
    scheduleId: pair.scheduleId,
    startY,
  }
}

function measurePositions(): void {
  if (!enabled || !listEl || specResult.value.pairs.length === 0) {
    brackets.value = []
    svgHeight.value = 0
    return
  }
  const totalHeight = listEl.offsetHeight
  const elMap = buildKeyElementMap(listEl)
  const nextBrackets: RenderedBracket[] = []
  for (const pair of specResult.value.pairs) {
    const item = toRenderedBracket(pair, elMap, totalHeight)
    if (item) {
      nextBrackets.push(item)
    }
  }
  svgHeight.value = totalHeight
  brackets.value = nextBrackets
}

function observeListContainer(): void {
  resizeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined' || !listEl) {
    return
  }
  resizeObserver = new ResizeObserver(() => {
    measurePositions()
  })
  resizeObserver.observe(listEl)
}

watch(
  gutterWidth,
  (val) => {
    emit('gutterChange', val)
  },
  { immediate: true },
)

watch(
  () => [entries, enabled, listEl],
  async () => {
    await nextTick()
    observeListContainer()
    measurePositions()
  },
  { deep: false, immediate: true },
)

onMounted(() => {
  observeListContainer()
  measurePositions()
  globalThis.addEventListener('resize', measurePositions, { passive: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  globalThis.removeEventListener('resize', measurePositions)
})
</script>

<template>
  <svg
    v-if="enabled && brackets.length > 0 && svgHeight > 0"
    class="range-connectors-svg"
    :width="gutterWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${gutterWidth} ${svgHeight}`"
    aria-hidden="true"
  >
    <g
      v-for="item in brackets"
      :key="item.scheduleId"
      class="connector-group"
      :class="{ 'is-done': item.done }"
    >
      <path
        :d="item.path"
        :stroke="item.color"
        fill="none"
        stroke-width="2"
        stroke-linejoin="miter"
        stroke-linecap="square"
        :stroke-dasharray="item.hasEnd ? undefined : '5 4'"
      />
      <circle :cx="item.rightX" :cy="item.startY" r="2.5" :fill="item.color" />
      <circle v-if="item.hasEnd" :cx="item.rightX" :cy="item.endY" r="2.5" :fill="item.color" />
    </g>
  </svg>
</template>

<style scoped>
.range-connectors-svg {
  position: absolute;
  top: 0;
  right: 100%;
  pointer-events: none;
  overflow: visible;
}

.connector-group {
  transition: opacity 0.2s ease;
}

.connector-group.is-done {
  opacity: 0.35;
}
</style>
