import type { POVRuntime } from '../project/types'

export interface TimelineRange {
  start: number
  end: number
  duration: number
}

export function computeTimelineRange(povs: readonly POVRuntime[]): TimelineRange {
  const ready = povs.filter((pov) => pov.enabled && pov.metadataReady && Number.isFinite(pov.duration))
  if (ready.length === 0) {
    return { start: 0, end: 0, duration: 0 }
  }

  let start = 0
  let end = Number.NEGATIVE_INFINITY
  for (const pov of ready) {
    start = Math.min(start, pov.offset)
    end = Math.max(end, pov.offset + pov.duration)
  }

  if (!Number.isFinite(end)) {
    return { start: 0, end: 0, duration: 0 }
  }

  return {
    start,
    end,
    duration: end - start
  }
}

export function clampMasterTime(masterTime: number, range: TimelineRange): number {
  if (!Number.isFinite(masterTime)) return range.start
  if (masterTime < range.start) return range.start
  if (masterTime > range.end) return range.end
  return masterTime
}
