import { describe, expect, it } from 'vitest'
import type { POVRuntime } from '../project/types'
import { clampMasterTime, computeTimelineRange } from './range'

function pov(partial: Partial<POVRuntime> & Pick<POVRuntime, 'id' | 'offset' | 'duration' | 'metadataReady'>): POVRuntime {
  return {
    playerName: partial.id,
    filePath: `${partial.id}.mp4`,
    enabled: true,
    muted: true,
    missing: false,
    ...partial
  }
}

describe('computeTimelineRange', () => {
  it('returns an empty range when no media is ready', () => {
    expect(computeTimelineRange([])).toEqual({ start: 0, end: 0, duration: 0 })
    expect(
      computeTimelineRange([
        pov({ id: 'a', offset: 0, duration: 0, metadataReady: false })
      ])
    ).toEqual({ start: 0, end: 0, duration: 0 })
  })

  it('starts at zero when every offset is non-negative', () => {
    const range = computeTimelineRange([
      pov({ id: 'a', offset: 0, duration: 100, metadataReady: true }),
      pov({ id: 'b', offset: 10, duration: 50, metadataReady: true })
    ])
    expect(range).toEqual({ start: 0, end: 100, duration: 100 })
  })

  it('allows a negative start when a POV began earlier', () => {
    const range = computeTimelineRange([
      pov({ id: 'a', offset: -5, duration: 20, metadataReady: true }),
      pov({ id: 'b', offset: 0, duration: 10, metadataReady: true })
    ])
    expect(range).toEqual({ start: -5, end: 15, duration: 20 })
  })
})

describe('clampMasterTime', () => {
  it('keeps the clock inside the timeline', () => {
    const range = { start: -2, end: 10, duration: 12 }
    expect(clampMasterTime(-9, range)).toBe(-2)
    expect(clampMasterTime(4, range)).toBe(4)
    expect(clampMasterTime(20, range)).toBe(10)
  })
})
