import type { TimelineRange } from './range'

export interface TimelineSelection {
  start: number
  end: number
}

/** Named export in/out on the master timeline (multiple per POV). */
export interface ExportSelection extends TimelineSelection {
  id: string
}

const EPS = 1e-6

export function selectionSpan(selection: TimelineSelection): number {
  return Math.max(0, selection.end - selection.start)
}

export function normalizeSelection(start: number, end: number): TimelineSelection {
  if (start <= end) return { start, end }
  return { start: end, end: start }
}

export function clampSelection(
  selection: TimelineSelection,
  range: TimelineRange
): TimelineSelection {
  const start = Math.min(range.end, Math.max(range.start, selection.start))
  const end = Math.min(range.end, Math.max(range.start, selection.end))
  return normalizeSelection(start, end)
}

export function selectionsOverlap(a: TimelineSelection, b: TimelineSelection): boolean {
  return a.start < b.end - EPS && b.start < a.end - EPS
}

/** True when `time` sits strictly inside an existing range (boundaries allowed). */
export function isTimeInsideSelection(
  time: number,
  others: readonly TimelineSelection[]
): boolean {
  return others.some((other) => other.start + EPS < time && time < other.end - EPS)
}

/**
 * Free interval around `origin` after excluding `excludeId`.
 * Adjacent ranges may touch endpoints; they must not overlap.
 */
export function freeBoundsAround(
  origin: TimelineSelection,
  others: readonly ExportSelection[],
  excludeId: string | null,
  range: TimelineRange
): { left: number; right: number } {
  let left = range.start
  let right = range.end
  const originMid = (origin.start + origin.end) / 2

  for (const other of others) {
    if (excludeId && other.id === excludeId) continue
    if (other.end <= origin.start + EPS) {
      left = Math.max(left, other.end)
      continue
    }
    if (other.start >= origin.end - EPS) {
      right = Math.min(right, other.start)
      continue
    }
    // Overlaps origin (legacy / in-progress): assign by midpoint.
    const otherMid = (other.start + other.end) / 2
    if (otherMid <= originMid) left = Math.max(left, other.end)
    else right = Math.min(right, other.start)
  }

  if (right < left) {
    const mid = (left + right) / 2
    return { left: mid, right: mid }
  }
  return { left, right }
}

/** Fit `proposed` into the free gap belonging to `origin`, without overlapping others. */
export function constrainSelectionNoOverlap(
  proposed: TimelineSelection,
  origin: TimelineSelection,
  others: readonly ExportSelection[],
  excludeId: string | null,
  range: TimelineRange
): TimelineSelection {
  const clamped = clampSelection(proposed, range)
  const { left, right } = freeBoundsAround(origin, others, excludeId, range)
  const room = Math.max(0, right - left)
  const originSpan = selectionSpan(origin)
  const proposedSpan = selectionSpan(clamped)
  const isMove = Math.abs(proposedSpan - originSpan) <= EPS

  if (isMove) {
    const span = Math.min(originSpan, room)
    if (span <= EPS) {
      const t = Math.min(right, Math.max(left, (clamped.start + clamped.end) / 2))
      return { start: t, end: t }
    }
    let start = clamped.start
    if (start < left) start = left
    if (start + span > right) start = right - span
    start = Math.max(left, Math.min(start, right - span))
    return { start, end: start + span }
  }

  // Resize: clamp each endpoint independently into the free gap.
  let start = Math.min(Math.max(clamped.start, left), right)
  let end = Math.min(Math.max(clamped.end, left), right)
  return normalizeSelection(start, end)
}

export function moveSelection(
  selection: TimelineSelection,
  deltaSeconds: number,
  range: TimelineRange
): TimelineSelection {
  const span = selectionSpan(selection)
  let start = selection.start + deltaSeconds
  let end = selection.end + deltaSeconds
  if (start < range.start) {
    start = range.start
    end = range.start + span
  }
  if (end > range.end) {
    end = range.end
    start = range.end - span
  }
  return clampSelection({ start, end }, range)
}

export function moveSelectionNoOverlap(
  selection: ExportSelection,
  deltaSeconds: number,
  others: readonly ExportSelection[],
  range: TimelineRange
): TimelineSelection {
  const moved = moveSelection(selection, deltaSeconds, range)
  return constrainSelectionNoOverlap(moved, selection, others, selection.id, range)
}

/** Prefer the nearest target within `threshold`; otherwise return `time` unchanged. */
export function snapTime(
  time: number,
  targets: readonly number[],
  threshold: number
): number {
  if (!(threshold > 0) || targets.length === 0) return time
  let best = time
  let bestDist = threshold
  for (const target of targets) {
    if (!Number.isFinite(target)) continue
    const dist = Math.abs(time - target)
    if (dist <= bestDist + EPS) {
      bestDist = dist
      best = target
    }
  }
  return best
}

/**
 * Snap a moved selection by pulling the nearer endpoint onto a target,
 * preserving span.
 */
export function snapMovedSelection(
  selection: TimelineSelection,
  targets: readonly number[],
  threshold: number
): TimelineSelection {
  if (!(threshold > 0) || targets.length === 0) return selection
  const span = selectionSpan(selection)
  let best: TimelineSelection | null = null
  let bestDist = threshold

  for (const target of targets) {
    if (!Number.isFinite(target)) continue
    const dStart = Math.abs(selection.start - target)
    if (dStart <= bestDist + EPS) {
      bestDist = dStart
      best = { start: target, end: target + span }
    }
    const dEnd = Math.abs(selection.end - target)
    if (dEnd <= bestDist + EPS) {
      bestDist = dEnd
      best = { start: target - span, end: target }
    }
  }

  return best ?? selection
}

/** Neighbor edges plus caller-supplied anchors (playhead, media bounds, …). */
export function collectSelectionSnapTargets(
  others: readonly ExportSelection[],
  excludeId: string | null,
  extras: readonly number[] = []
): number[] {
  const targets: number[] = []
  for (const value of extras) {
    if (Number.isFinite(value)) targets.push(value)
  }
  for (const other of others) {
    if (excludeId && other.id === excludeId) continue
    targets.push(other.start, other.end)
  }
  return targets
}

export function selectionWindowPercent(
  selection: TimelineSelection,
  range: TimelineRange
): { leftPct: number; widthPct: number } {
  const span = Math.max(range.duration, 0.001)
  const leftPct = ((selection.start - range.start) / span) * 100
  const widthPct = (selectionSpan(selection) / span) * 100
  return {
    leftPct,
    widthPct: Math.max(widthPct, 0)
  }
}

export function isTimelineSelection(value: unknown): value is TimelineSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.start === 'number' &&
    Number.isFinite(record.start) &&
    typeof record.end === 'number' &&
    Number.isFinite(record.end)
  )
}

export function createExportSelection(
  start: number,
  end: number,
  id = crypto.randomUUID()
): ExportSelection {
  const normalized = normalizeSelection(start, end)
  return { id, start: normalized.start, end: normalized.end }
}

/** Accepts a single persisted export range; normalizes endpoint order. */
export function parseExportRange(value: unknown): TimelineSelection | null {
  if (value == null) return null
  if (!isTimelineSelection(value)) return null
  return normalizeSelection(value.start, value.end)
}

function parseOneExportSelection(value: unknown): ExportSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!isTimelineSelection(record)) return null
  const normalized = normalizeSelection(record.start, record.end)
  const id =
    typeof record.id === 'string' && record.id.trim() !== ''
      ? record.id
      : crypto.randomUUID()
  return { id, start: normalized.start, end: normalized.end }
}

/** Sort by start and shrink/drop ranges so none overlap (legacy repair). */
export function resolveOverlappingSelections(
  ranges: readonly ExportSelection[]
): ExportSelection[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: ExportSelection[] = []
  for (const entry of sorted) {
    const prev = result[result.length - 1]
    if (!prev) {
      result.push(entry)
      continue
    }
    if (entry.start >= prev.end - EPS) {
      result.push(entry)
      continue
    }
    const start = prev.end
    const end = Math.max(start, entry.end)
    result.push({ ...entry, start, end })
  }
  return result
}

/**
 * Loads exportRanges array, or migrates legacy single exportRange.
 * Pass both fields when reading project.json.
 */
export function parseExportRanges(
  ranges: unknown,
  legacySingle: unknown = undefined
): ExportSelection[] {
  if (Array.isArray(ranges)) {
    const parsed: ExportSelection[] = []
    for (const entry of ranges) {
      const item = parseOneExportSelection(entry)
      if (item) parsed.push(item)
    }
    return resolveOverlappingSelections(parsed)
  }
  const single = parseExportRange(legacySingle ?? ranges)
  if (!single) return []
  return [createExportSelection(single.start, single.end)]
}

export function isExportRanges(value: unknown): value is ExportSelection[] {
  return Array.isArray(value) && value.every((entry) => parseOneExportSelection(entry) !== null)
}
