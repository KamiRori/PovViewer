import { describe, expect, it } from 'vitest'
import { matchesPlayerQuery, shouldMutePov } from './audioPolicy'

describe('shouldMutePov', () => {
  it('follows each POV muted flag independently', () => {
    expect(shouldMutePov({ muted: true })).toBe(true)
    expect(shouldMutePov({ muted: false })).toBe(false)
  })
})

describe('matchesPlayerQuery', () => {
  it('matches case-insensitive substrings', () => {
    expect(matchesPlayerQuery('Alice', '')).toBe(true)
    expect(matchesPlayerQuery('Alice', 'ali')).toBe(true)
    expect(matchesPlayerQuery('Alice', 'BOB')).toBe(false)
  })
})
