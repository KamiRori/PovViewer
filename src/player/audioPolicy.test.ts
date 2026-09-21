import { describe, expect, it } from 'vitest'
import { matchesPlayerQuery, shouldMutePov } from './audioPolicy'

describe('shouldMutePov', () => {
  it('mutes everyone in grid when there is no solo', () => {
    expect(
      shouldMutePov({ mode: 'grid', povId: 'a', focusId: null, soloId: null })
    ).toBe(true)
  })

  it('unmutes only the solo id in grid', () => {
    expect(
      shouldMutePov({ mode: 'grid', povId: 'a', focusId: null, soloId: 'a' })
    ).toBe(false)
    expect(
      shouldMutePov({ mode: 'grid', povId: 'b', focusId: null, soloId: 'a' })
    ).toBe(true)
  })

  it('unmutes only the focused id in focus mode when solo matches', () => {
    expect(
      shouldMutePov({ mode: 'focus', povId: 'a', focusId: 'a', soloId: 'a' })
    ).toBe(false)
    expect(
      shouldMutePov({ mode: 'focus', povId: 'b', focusId: 'a', soloId: 'a' })
    ).toBe(true)
    expect(
      shouldMutePov({ mode: 'focus', povId: 'a', focusId: 'a', soloId: null })
    ).toBe(true)
  })
})

describe('matchesPlayerQuery', () => {
  it('matches case-insensitive substrings', () => {
    expect(matchesPlayerQuery('Alice', '')).toBe(true)
    expect(matchesPlayerQuery('Alice', 'ali')).toBe(true)
    expect(matchesPlayerQuery('Alice', 'BOB')).toBe(false)
  })
})
