import { ScheduleTypeEnum } from '@/api'
import type { ScheduleDisplayItem } from '@/types/schedule'

export interface RangePairSpec {
  scheduleId: number
  startKey: string
  endKey: string | undefined
  startIdx: number
  endIdx: number
  lane: number
  color: string
  done: boolean
}

export interface RenderedBracket {
  scheduleId: number
  path: string
  rightX: number
  startY: number
  endY: number
  hasEnd: boolean
  color: string
  done: boolean
}

const DISTINCT_PALETTE = [
  '#2563eb',
  '#e11d48',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#db2777',
  '#65a30d',
  '#dc2626',
] as const

const LANE_STEP_PX = 14
const BASE_OFFSET_PX = 40
export const CARD_GAP_PX = 4
const GUTTER_PADDING_PX = 8

export function computeConnectorGutterWidth(pairCount: number, maxLane: number): number {
  if (pairCount === 0) {
    return 0
  }
  return BASE_OFFSET_PX + maxLane * LANE_STEP_PX + GUTTER_PADDING_PX
}

function pickDistinctColor(colorOrder: number): string {
  if (colorOrder < DISTINCT_PALETTE.length) {
    return DISTINCT_PALETTE[colorOrder] ?? '#2563eb'
  }
  const hue = Math.round((colorOrder * 137.508) % 360)
  return `hsl(${hue} 72% 48%)`
}

function assignLane(laneLastEnd: number[], startIdx: number, endIdx: number): number {
  for (let lane = 0; lane < laneLastEnd.length; lane += 1) {
    const occupiedUntil = laneLastEnd[lane] ?? -1
    if (occupiedUntil < startIdx) {
      laneLastEnd[lane] = endIdx
      return lane
    }
  }
  const newLane = laneLastEnd.length
  laneLastEnd.push(endIdx)
  return newLane
}

export function buildRangePairSpecs(entries: ScheduleDisplayItem[]): {
  pairs: RangePairSpec[]
  maxLane: number
} {
  const startMap = new Map<number, { idx: number; item: ScheduleDisplayItem }>()
  const endMap = new Map<number, { idx: number; item: ScheduleDisplayItem }>()

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx]
    if (entry?.schedule.type === ScheduleTypeEnum.TimeRange) {
      if (entry.rangeRole === 'start') {
        startMap.set(entry.schedule.id, { idx, item: entry })
      } else if (entry.rangeRole === 'end') {
        endMap.set(entry.schedule.id, { idx, item: entry })
      }
    }
  }

  const rawPairs = [...startMap.entries()]
    .map(([scheduleId, startInfo]) => {
      const endInfo = endMap.get(scheduleId)
      return {
        done: startInfo.item.effectiveDone,
        endIdx: endInfo?.idx ?? entries.length,
        endKey: endInfo?.item.key,
        scheduleId,
        startIdx: startInfo.idx,
        startKey: startInfo.item.key,
      }
    })
    .toSorted((left, right) => left.startIdx - right.startIdx)

  const laneLastEnd: number[] = []
  const pairs: RangePairSpec[] = rawPairs.map((raw, idx) => ({
    color: pickDistinctColor(idx),
    done: raw.done,
    endIdx: raw.endIdx,
    endKey: raw.endKey,
    lane: assignLane(laneLastEnd, raw.startIdx, raw.endIdx),
    scheduleId: raw.scheduleId,
    startIdx: raw.startIdx,
    startKey: raw.startKey,
  }))

  return {
    maxLane: Math.max(0, laneLastEnd.length - 1),
    pairs,
  }
}

export interface BracketCoordInput {
  gutterWidth: number
  lane: number
  startY: number
  endY: number
  hasEnd: boolean
}

export function buildOrthogonalPath(coord: BracketCoordInput): string {
  const rightX = coord.gutterWidth - CARD_GAP_PX
  const laneX = coord.gutterWidth - BASE_OFFSET_PX - coord.lane * LANE_STEP_PX
  if (coord.hasEnd) {
    return `M ${rightX} ${coord.startY} H ${laneX} V ${coord.endY} H ${rightX}`
  }
  return `M ${rightX} ${coord.startY} H ${laneX} V ${coord.endY}`
}
