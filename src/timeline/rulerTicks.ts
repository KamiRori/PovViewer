import type { TimelineRange } from './range'

/** Nice durations (seconds) for major tick spacing on video timelines. */
const MAJOR_STEPS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
  900, 1800, 3600, 7200, 10_800, 14_400, 21_600, 43_200, 86_400
] as const

export interface RulerTick {
  time: number
  major: boolean
}

export interface RulerTickPlan {
  ticks: RulerTick[]
  majorStep: number
  minorStep: number
}

function pickMajorStep(span: number, targetMajors: number): number {
  const ideal = Math.max(span, 0.001) / Math.max(targetMajors, 1)
  for (const step of MAJOR_STEPS) {
    if (step >= ideal) return step
  }
  return MAJOR_STEPS[MAJOR_STEPS.length - 1]!
}

function pickMinorStep(majorStep: number): number {
  for (const divisor of [5, 4, 2] as const) {
    const minor = majorStep / divisor
    if (minor > 0 && Number.isFinite(minor)) return minor
  }
  return majorStep
}

/**
 * Build major/minor ticks for a visible time window.
 * `targetMajors` controls label density (~6–10 works well for the track ruler).
 */
export function buildRulerTicks(
  range: TimelineRange,
  targetMajors = 8
): RulerTickPlan {
  const span = Math.max(range.duration, 0)
  if (!(span > 0) || !Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return { ticks: [], majorStep: 1, minorStep: 1 }
  }

  const majorStep = pickMajorStep(span, targetMajors)
  const minorStep = pickMinorStep(majorStep)
  const eps = Math.min(minorStep, majorStep) * 1e-6
  const firstIndex = Math.ceil((range.start - eps) / minorStep)
  const lastIndex = Math.floor((range.end + eps) / minorStep)
  const ticks: RulerTick[] = []
  const majorRatio = majorStep / minorStep

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const raw = index * minorStep
    const time = Object.is(raw, -0) ? 0 : raw
    if (time < range.start - eps || time > range.end + eps) continue
    const major =
      Math.abs(index / majorRatio - Math.round(index / majorRatio)) < 1e-6
    ticks.push({ time, major })
  }

  return { ticks, majorStep, minorStep }
}

/** Compact labels for ruler ticks (drop milliseconds when step ≥ 1s). */
export function formatRulerTickLabel(seconds: number, majorStep: number): string {
  if (!Number.isFinite(seconds)) return '00:00'
  const negative = seconds < 0
  const absolute = Math.abs(seconds)
  const showMs = majorStep < 1
  const totalMs = showMs
    ? Math.round(absolute * 1000)
    : Math.round(absolute) * 1000
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  let body: string
  if (hours > 0) {
    body = showMs
      ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
  } else if (showMs) {
    body = `${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
  } else {
    body = `${pad(minutes)}:${pad(secs)}`
  }
  return negative ? `-${body}` : body
}
