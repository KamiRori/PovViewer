import { describe, expect, it } from 'vitest'
import {
  clampSelection,
  constrainSelectionNoOverlap,
  freeBoundsAround,
  isTimeInsideSelection,
  moveSelection,
  moveSelectionNoOverlap,
  normalizeSelection,
  parseExportRanges,
  resolveOverlappingSelections,
  selectionSpan,
  selectionWindowPercent,
  selectionsOverlap,
  snapMovedSelection,
  snapTime,
  collectSelectionSnapTargets
} from './selection'

const range = { start: 0, end: 100, duration: 100 }

describe('normalizeSelection / span', () => {
  it('orders endpoints', () => {
    expect(normalizeSelection(40, 10)).toEqual({ start: 10, end: 40 })
    expect(selectionSpan({ start: 10, end: 10 })).toBe(0)
  })
})

describe('clampSelection / moveSelection', () => {
  it('clamps into the master range', () => {
    expect(clampSelection({ start: -5, end: 120 }, range)).toEqual({ start: 0, end: 100 })
  })

  it('keeps span while panning inside bounds', () => {
    expect(moveSelection({ start: 10, end: 30 }, 5, range)).toEqual({ start: 15, end: 35 })
  })

  it('stops at the right edge without shrinking', () => {
    expect(moveSelection({ start: 80, end: 100 }, 10, range)).toEqual({ start: 80, end: 100 })
  })
})

describe('selectionWindowPercent', () => {
  it('maps zero-length selections to a zero-width window', () => {
    expect(selectionWindowPercent({ start: 25, end: 25 }, range)).toEqual({
      leftPct: 25,
      widthPct: 0
    })
  })
})

describe('parseExportRanges', () => {
  it('loads an array of named ranges', () => {
    expect(
      parseExportRanges([
        { id: 'a', start: 1, end: 2 },
        { id: 'b', start: 5, end: 3 }
      ])
    ).toEqual([
      { id: 'a', start: 1, end: 2 },
      { id: 'b', start: 3, end: 5 }
    ])
  })

  it('migrates a legacy single exportRange', () => {
    const parsed = parseExportRanges(undefined, { start: 10, end: 20 })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ start: 10, end: 20 })
    expect(parsed[0]?.id).toBeTruthy()
  })
})

describe('non-overlapping selections', () => {
  const others = [
    { id: 'a', start: 10, end: 20 },
    { id: 'c', start: 40, end: 50 }
  ]

  it('detects overlaps and interior points', () => {
    expect(selectionsOverlap({ start: 15, end: 25 }, others[0]!)).toBe(true)
    expect(selectionsOverlap({ start: 20, end: 30 }, others[0]!)).toBe(false)
    expect(isTimeInsideSelection(15, others)).toBe(true)
    expect(isTimeInsideSelection(20, others)).toBe(false)
  })

  it('computes free bounds between neighbors', () => {
    expect(freeBoundsAround({ start: 25, end: 30 }, others, null, range)).toEqual({
      left: 20,
      right: 40
    })
  })

  it('constrains resize and move so ranges only touch', () => {
    expect(
      constrainSelectionNoOverlap(
        { start: 5, end: 30 },
        { start: 22, end: 30 },
        others,
        null,
        range
      )
    ).toEqual({ start: 20, end: 30 })

    expect(
      moveSelectionNoOverlap({ id: 'b', start: 22, end: 30 }, -10, others, range)
    ).toEqual({ start: 20, end: 28 })
  })

  it('repairs overlapping legacy ranges', () => {
    expect(
      resolveOverlappingSelections([
        { id: 'a', start: 0, end: 20 },
        { id: 'b', start: 10, end: 30 }
      ])
    ).toEqual([
      { id: 'a', start: 0, end: 20 },
      { id: 'b', start: 20, end: 30 }
    ])
  })
})

describe('snapTime / snapMovedSelection', () => {
  it('snaps to the nearest target inside the threshold', () => {
    expect(snapTime(10.04, [0, 10, 20], 0.1)).toBe(10)
    expect(snapTime(10.2, [0, 10, 20], 0.1)).toBe(10.2)
  })

  it('snaps a moved block by the nearer edge', () => {
    expect(snapMovedSelection({ start: 9.95, end: 19.95 }, [10, 30], 0.1)).toEqual({
      start: 10,
      end: 20
    })
    expect(snapMovedSelection({ start: 20.05, end: 30.05 }, [10, 30], 0.1)).toEqual({
      start: 20,
      end: 30
    })
  })

  it('collects neighbor edges and extras', () => {
    expect(
      collectSelectionSnapTargets(
        [
          { id: 'a', start: 10, end: 20 },
          { id: 'b', start: 40, end: 50 }
        ],
        'b',
        [5, 100]
      )
    ).toEqual([5, 100, 10, 20])
  })
})
