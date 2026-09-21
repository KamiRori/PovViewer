import { describe, expect, it } from 'vitest'
import { playheadPercent, timeFromRatio, trackSegmentLayout } from './trackLayout'

describe('trackSegmentLayout', () => {
  it('places a zero-offset clip at the left of a non-negative range', () => {
    expect(trackSegmentLayout(0, 50, { start: 0, end: 100, duration: 100 })).toEqual({
      leftPct: 0,
      widthPct: 50,
      startPct: 0
    })
  })

  it('marks start at the offset position for delayed clips', () => {
    expect(trackSegmentLayout(25, 25, { start: 0, end: 100, duration: 100 })).toEqual({
      leftPct: 25,
      widthPct: 25,
      startPct: 25
    })
  })

  it('supports negative offsets relative to range start', () => {
    expect(trackSegmentLayout(-10, 20, { start: -10, end: 30, duration: 40 })).toEqual({
      leftPct: 0,
      widthPct: 50,
      startPct: 0
    })
  })
})

describe('playheadPercent / timeFromRatio', () => {
  const range = { start: 0, end: 100, duration: 100 }

  it('maps master time to percent', () => {
    expect(playheadPercent(40, range)).toBe(40)
  })

  it('round-trips click ratio to master time', () => {
    expect(timeFromRatio(0.25, range)).toBe(25)
    expect(timeFromRatio(-1, range)).toBe(0)
    expect(timeFromRatio(2, range)).toBe(100)
  })
})
