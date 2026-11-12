import { ScheduleTypeEnum } from '@/api'
import type { ScheduleDisplayItem } from './schedule-occurrences'

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

export const LANE_STEP_PX = 14
export const BASE_OFFSET_PX = 40
export const CARD_GAP_PX = 4

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

  const rawPairs: {
    done: boolean
    endIdx: number
    endKey: string | undefined
    scheduleId: number
    startIdx: number
    startKey: string
  }[] = []

  for (const [scheduleId, startInfo] of startMap) {
    const endInfo = endMap.get(scheduleId)
    let endIdx = entries.length
    if (endInfo) {
      endIdx = endInfo.idx
    }
    rawPairs.push({
      done: startInfo.item.effectiveDone,
      endIdx,
      endKey: endInfo?.item.key,
      scheduleId,
      startIdx: startInfo.idx,
      startKey: startInfo.item.key,
    })
  }

  rawPairs.sort((left, right) => left.startIdx - right.startIdx)

  const laneLastEnd: number[] = []
  const pairs: RangePairSpec[] = []

  for (let idx = 0; idx < rawPairs.length; idx += 1) {
    const raw = rawPairs[idx]
    if (raw) {
      const lane = assignLane(laneLastEnd, raw.startIdx, raw.endIdx)
      pairs.push({
        color: pickDistinctColor(idx),
        done: raw.done,
        endIdx: raw.endIdx,
        endKey: raw.endKey,
        lane,
        scheduleId: raw.scheduleId,
        startIdx: raw.startIdx,
        startKey: raw.startKey,
      })
    }
  }

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
