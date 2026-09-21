import { describe, expect, it } from 'vitest'
import { matchesPovQuery, parseMarkerColor } from './markerColor'

describe('parseMarkerColor', () => {
  it('accepts known colors and rejects others', () => {
    expect(parseMarkerColor('blue')).toBe('blue')
    expect(parseMarkerColor(null)).toBeNull()
    expect(parseMarkerColor('navy')).toBeNull()
  })
})

describe('matchesPovQuery', () => {
  const alice = { playerName: 'Alice', markerColor: 'red' as const }
  const bob = { playerName: 'Bob', markerColor: null }

  it('matches by name', () => {
    expect(matchesPovQuery(alice, '', null)).toBe(true)
    expect(matchesPovQuery(alice, 'ali', null)).toBe(true)
    expect(matchesPovQuery(alice, 'bob', null)).toBe(false)
  })

  it('filters by marker panel selection', () => {
    expect(matchesPovQuery(alice, '', 'red')).toBe(true)
    expect(matchesPovQuery(alice, '', 'blue')).toBe(false)
    expect(matchesPovQuery(bob, '', 'none')).toBe(true)
    expect(matchesPovQuery(alice, '', 'none')).toBe(false)
  })

  it('combines name and color filter', () => {
    expect(matchesPovQuery(alice, 'Ali', 'red')).toBe(true)
    expect(matchesPovQuery(alice, 'Ali', 'blue')).toBe(false)
  })
})
