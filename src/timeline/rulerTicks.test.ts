import { describe, expect, it } from 'vitest'
import { buildRulerTicks, formatRulerTickLabel } from './rulerTicks'

describe('buildRulerTicks', () => {
  it('returns empty ticks for an empty range', () => {
    expect(buildRulerTicks({ start: 0, end: 0, duration: 0 }).ticks).toEqual([])
  })

  it('uses nice major steps and includes minors between them', () => {
    const plan = buildRulerTicks({ start: 0, end: 60, duration: 60 }, 6)
    expect(plan.majorStep).toBe(10)
    expect(plan.minorStep).toBe(2)
    const majors = plan.ticks.filter((tick) => tick.major).map((tick) => tick.time)
    expect(majors).toEqual([0, 10, 20, 30, 40, 50, 60])
    expect(plan.ticks.some((tick) => !tick.major && tick.time === 2)).toBe(true)
  })

  it('clamps ticks to the visible window', () => {
    const plan = buildRulerTicks({ start: 12, end: 48, duration: 36 }, 6)
    expect(plan.ticks.every((tick) => tick.time >= 12 - 1e-6 && tick.time <= 48 + 1e-6)).toBe(
      true
    )
    expect(plan.ticks.some((tick) => tick.major)).toBe(true)
  })
})

describe('formatRulerTickLabel', () => {
  it('drops milliseconds for whole-second steps', () => {
    expect(formatRulerTickLabel(65, 10)).toBe('01:05')
    expect(formatRulerTickLabel(3661, 60)).toBe('01:01:01')
  })

  it('keeps milliseconds for sub-second steps', () => {
    expect(formatRulerTickLabel(1.25, 0.25)).toBe('00:01.250')
  })
})
