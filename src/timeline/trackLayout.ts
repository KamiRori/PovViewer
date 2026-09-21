import type { TimelineRange } from './range'

export interface TrackSegmentLayout {
  /** Segment left edge as % of master range. */
  leftPct: number
  /** Segment width as % of master range. */
  widthPct: number
  /** Start marker position as % of master range (= leftPct). */
  startPct: number
}

export function trackSegmentLayout(
  offset: number,
  duration: number,
  range: TimelineRange
): TrackSegmentLayout {
  const span = Math.max(range.duration, 0.001)
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeOffset = Number.isFinite(offset) ? offset : range.start
  const leftPct = ((safeOffset - range.start) / span) * 100
  const widthPct = (safeDuration / span) * 100
  return {
    leftPct,
    widthPct: Math.max(0, widthPct),
    startPct: leftPct
  }
}

export function playheadPercent(masterTime: number, range: TimelineRange): number {
  const span = Math.max(range.duration, 0.001)
  if (!Number.isFinite(masterTime)) return 0
  return ((masterTime - range.start) / span) * 100
}

export function timeFromRatio(ratio: number, range: TimelineRange): number {
  const span = Math.max(range.duration, 0.001)
  const clamped = Math.min(1, Math.max(0, ratio))
  return range.start + clamped * span
}
