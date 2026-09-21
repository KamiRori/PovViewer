import { describe, expect, it } from 'vitest'
import {
  expectedVideoTime,
  HARD_SEEK_THRESHOLD_SECONDS,
  hardSeekThresholdSeconds,
  MULTI_ARM_HARD_SEEK_THRESHOLD_SECONDS,
  needsCorrection,
  povPlaybackStatus,
  softPlaybackRate,
  syncAction
} from './playbackMath'

describe('expectedVideoTime', () => {
  it('subtracts the offset from master time', () => {
    expect(expectedVideoTime(100, 0)).toBe(100)
    expect(expectedVideoTime(100, 13.42)).toBeCloseTo(86.58)
    expect(expectedVideoTime(100, -5.81)).toBeCloseTo(105.81)
  })
})

describe('povPlaybackStatus', () => {
  it('waits for metadata before ending', () => {
    expect(povPlaybackStatus(10, 0, 0, false)).toBe('pending')
  })

  it('reports not started, active, and ended', () => {
    expect(povPlaybackStatus(5, 10, 20, true)).toBe('not_started')
    expect(povPlaybackStatus(15, 10, 20, true)).toBe('active')
    expect(povPlaybackStatus(40, 10, 20, true)).toBe('ended')
  })
})

describe('needsCorrection', () => {
  it('only corrects past the 50ms threshold', () => {
    expect(needsCorrection(10, 10.04)).toBe(false)
    expect(needsCorrection(10, 10.06)).toBe(true)
  })
})

describe('syncAction', () => {
  it('uses soft rate sync for small drift and hard seek for large drift', () => {
    expect(syncAction(10, 10.04)).toBe('none')
    expect(syncAction(10, 10.1)).toBe('soft')
    expect(syncAction(10, 10.3)).toBe('hard')
  })
})

describe('softPlaybackRate', () => {
  it('speeds up a late video and slows an early one', () => {
    expect(softPlaybackRate(1, 10, 10.1)).toBeGreaterThan(1)
    expect(softPlaybackRate(1, 10.1, 10)).toBeLessThan(1)
  })
})

describe('hardSeekThresholdSeconds', () => {
  it('widens the hard-seek threshold when multiple POVs are armed', () => {
    expect(hardSeekThresholdSeconds(1)).toBe(HARD_SEEK_THRESHOLD_SECONDS)
    expect(hardSeekThresholdSeconds(2)).toBe(MULTI_ARM_HARD_SEEK_THRESHOLD_SECONDS)
  })
})
