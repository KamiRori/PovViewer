import { describe, expect, it } from 'vitest'
import { buildProxyCacheKey, resolveProxyConcurrency } from './proxyService'

describe('proxy cache key', () => {
  it('changes when mtime or size changes', () => {
    const a = buildProxyCacheKey('D:/a.mp4', 100, 1)
    const b = buildProxyCacheKey('D:/a.mp4', 100, 2)
    const c = buildProxyCacheKey('D:/a.mp4', 101, 1)
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('is stable for identical inputs', () => {
    expect(buildProxyCacheKey('D:/a.mp4', 100, 1)).toBe(buildProxyCacheKey('D:/a.mp4', 100, 1))
  })
})

describe('resolveProxyConcurrency', () => {
  it('defaults to a higher concurrent-file count for short segmented encodes', () => {
    expect(resolveProxyConcurrency(1, undefined)).toBe(1)
    expect(resolveProxyConcurrency(8, undefined)).toBe(3)
    expect(resolveProxyConcurrency(32, undefined)).toBe(6)
  })

  it('honors POV_PROXY_CONCURRENCY override', () => {
    expect(resolveProxyConcurrency(8, '12')).toBe(12)
    expect(resolveProxyConcurrency(8, '1')).toBe(1)
  })

  it('ignores invalid env and caps override at 64', () => {
    expect(resolveProxyConcurrency(8, 'nope')).toBe(3)
    expect(resolveProxyConcurrency(8, '0')).toBe(3)
    expect(resolveProxyConcurrency(256, undefined)).toBe(6)
    expect(resolveProxyConcurrency(8, '99')).toBe(64)
  })
})
