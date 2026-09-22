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
  const eps = Math.max(floor * 1e-9, 1e-9)
  let nextStart = Number.isFinite(start) ? start : full.start
  let nextEnd = Number.isFinite(end) ? end : full.end

  if (nextEnd < nextStart) {
    const swap = nextStart
    nextStart = nextEnd
    nextEnd = swap
  }

  if (nextEnd - nextStart < floor - eps) {
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

  // Use epsilon: pan passes minSpan === exact window width, and float noise would
  // otherwise trip this branch and snap the window back to full.start (0%) every few frames.
  if (nextEnd - nextStart < floor - eps) {
    nextStart = full.start
    nextEnd = Math.min(full.end, full.start + floor)
  }

  return { start: nextStart, end: nextEnd }
}

export function fullViewport(full: TimelineRange): TimelineViewport {
  return { start: full.start, end: full.end }
}

/** Slide a fixed-span window. Avoids float snap-to-start that clampViewport can hit. */
export function panViewport(
  viewport: TimelineViewport,
  deltaSeconds: number,
  full: TimelineRange
): TimelineViewport {
  const fullSpan = Math.max(full.duration, 0.001)
  const span = Math.min(Math.max(viewport.end - viewport.start, 0), fullSpan)
  if (span <= 0) return fullViewport(full)

  let start = viewport.start + deltaSeconds
  let end = start + span

  if (start < full.start) {
    start = full.start
    end = start + span
  }
  if (end > full.end) {
    end = full.end
    start = end - span
  }
  if (start < full.start) {
    start = full.start
    end = Math.min(full.end, start + span)
  }

  return { start, end }
}

/** Place a fixed-span window so `pointerTime` stays at `grabOffset` from the window start. */
export function panViewportToGrab(
  span: number,
  pointerTime: number,
  grabOffset: number,
  full: TimelineRange
): TimelineViewport {
  return panViewport({ start: pointerTime - grabOffset, end: pointerTime - grabOffset + span }, 0, full)
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

export function viewportsEqual(
  a: TimelineViewport,
  b: TimelineViewport,
  epsilon = 1e-6
): boolean {
  return Math.abs(a.start - b.start) <= epsilon && Math.abs(a.end - b.end) <= epsilon
}

export function viewportWindowPercent(
  viewport: TimelineViewport,
  full: TimelineRange
): { leftPct: number; widthPct: number } {
  const span = Math.max(full.duration, 0.001)
  const leftPct = ((viewport.start - full.start) / span) * 100
  const widthPct = ((viewport.end - viewport.start) / span) * 100
  return {
    leftPct: Math.min(100, Math.max(0, leftPct)),
    widthPct: Math.min(100 - Math.min(100, Math.max(0, leftPct)), Math.max(widthPct, 0))
  }
}
