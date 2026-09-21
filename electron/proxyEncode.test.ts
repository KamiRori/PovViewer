import { describe, expect, it } from 'vitest'
import { planProxySegments, resolveJobParallelism } from './proxyEncode'

describe('resolveJobParallelism', () => {
  it('gives all cores to a solitary job', () => {
    expect(resolveJobParallelism(8, 1, 0)).toBe(8)
  })

  it('splits cores across many in-flight jobs', () => {
    expect(resolveJobParallelism(8, 8, 0)).toBe(1)
    expect(resolveJobParallelism(8, 4, 0)).toBe(2)
  })

  it('ignores queued work (file concurrency already gates starts)', () => {
    expect(resolveJobParallelism(8, 1, 7)).toBe(8)
  })
})

describe('planProxySegments', () => {
  it('keeps short clips as one segment', () => {
    expect(planProxySegments(60, 8)).toEqual([{ start: 0, duration: 60 }])
  })

  it('splits long clips across parallelism', () => {
    const parts = planProxySegments(3600, 4)
    expect(parts).toHaveLength(4)
    const covered = parts.reduce((sum, part) => sum + part.duration, 0)
    expect(covered).toBeCloseTo(3600, 5)
    expect(parts[0]?.start).toBe(0)
  })

  it('does not over-split tiny long-enough clips', () => {
    const parts = planProxySegments(100, 16)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.length).toBeLessThanOrEqual(2)
  })
})
