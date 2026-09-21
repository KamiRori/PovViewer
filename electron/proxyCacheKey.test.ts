import { describe, expect, it } from 'vitest'
import { buildProxyCacheKey } from './proxyService'

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
