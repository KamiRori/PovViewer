import { describe, expect, it } from 'vitest'
import {
  releaseHardSeek,
  releaseSampleSeek,
  resetSeekGatesForTests,
  tryAcquireHardSeek,
  tryAcquireSampleSeek
} from './seekGate'

describe('seekGate', () => {
  it('allows only one hard seek owner at a time', () => {
    resetSeekGatesForTests()
    expect(tryAcquireHardSeek('a')).toBe(true)
    expect(tryAcquireHardSeek('b')).toBe(false)
    releaseHardSeek('a')
    expect(tryAcquireHardSeek('b')).toBe(true)
    releaseHardSeek('b')
  })

  it('allows only one sample seek owner at a time', () => {
    resetSeekGatesForTests()
    expect(tryAcquireSampleSeek('a')).toBe(true)
    expect(tryAcquireSampleSeek('b')).toBe(false)
    releaseSampleSeek('a')
    expect(tryAcquireSampleSeek('b')).toBe(true)
    releaseSampleSeek('b')
  })
})
