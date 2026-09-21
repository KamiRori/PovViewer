import type { TimelineRange } from './range'

export interface TimelineViewport {
  start: number
  end: number
}

export function viewportToRange(viewport: TimelineViewport): TimelineRange {
  const duration = Math.max(0.001, viewport.end - viewport.start)
  return { start: viewport.start, end: viewport.end, duration }
}

/** Smallest visible window — finer scrubbing without collapsing to zero. */
export function minViewportSpan(full: TimelineRange): number {
  const span = Math.max(full.duration, 0.001)
  return Math.min(span, Math.max(0.25, span * 0.015))
}

export function clampViewport(
  start: number,
  end: number,
  full: TimelineRange,
  minSpan = minViewportSpan(full)
): TimelineViewport {
  const fullSpan = Math.max(full.duration, 0.001)
  const floor = Math.min(minSpan, fullSpan)
  let nextStart = Number.isFinite(start) ? start : full.start
  let nextEnd = Number.isFinite(end) ? end : full.end

  if (nextEnd < nextStart) {
    const swap = nextStart
    nextStart = nextEnd
    nextEnd = swap
  }

  if (nextEnd - nextStart < floor) {
    const mid = (nextStart + nextEnd) / 2
    nextStart = mid - floor / 2
    nextEnd = mid + floor / 2
  }

  if (nextStart < full.start) {
    nextEnd += full.start - nextStart
    nextStart = full.start
  }
  if (nextEnd > full.end) {
    nextStart -= nextEnd - full.end
    nextEnd = full.end
  }

  nextStart = Math.max(full.start, nextStart)
  nextEnd = Math.min(full.end, nextEnd)

  if (nextEnd - nextStart < floor) {
    nextStart = full.start
    nextEnd = Math.min(full.end, full.start + floor)
  }

  return { start: nextStart, end: nextEnd }
}

export function fullViewport(full: TimelineRange): TimelineViewport {
  return { start: full.start, end: full.end }
}

export function panViewport(
  viewport: TimelineViewport,
  deltaSeconds: number,
  full: TimelineRange
): TimelineViewport {
  return clampViewport(viewport.start + deltaSeconds, viewport.end + deltaSeconds, full, viewport.end - viewport.start)
}

export function resizeViewportEdge(
  viewport: TimelineViewport,
  edge: 'start' | 'end',
  time: number,
  full: TimelineRange
): TimelineViewport {
  if (edge === 'start') {
    return clampViewport(time, viewport.end, full)
  }
  return clampViewport(viewport.start, time, full)
}

export function viewportWindowPercent(
  viewport: TimelineViewport,
  full: TimelineRange
): { leftPct: number; widthPct: number } {
  const span = Math.max(full.duration, 0.001)
  const leftPct = ((viewport.start - full.start) / span) * 100
  const widthPct = ((viewport.end - viewport.start) / span) * 100
  return {
    leftPct,
    widthPct: Math.max(widthPct, 0.5)
  }
}
