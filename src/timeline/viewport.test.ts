import { describe, expect, it } from 'vitest'
import {
  clampViewport,
  minViewportSpan,
  panViewport,
  panViewportToGrab,
  resizeViewportEdge,
  viewportWindowPercent,
  viewportsEqual
} from './viewport'

const full = { start: 0, end: 100, duration: 100 }

describe('clampViewport', () => {
  it('keeps a valid window inside the full range', () => {
    expect(clampViewport(10, 40, full)).toEqual({ start: 10, end: 40 })
  })

  it('rejects windows smaller than the minimum span', () => {
    const next = clampViewport(50, 50.01, full, 5)
    expect(next.end - next.start).toBeGreaterThanOrEqual(5)
  })
})

describe('pan / resize', () => {
  it('pans without changing span when room allows', () => {
    expect(panViewport({ start: 10, end: 30 }, 5, full)).toEqual({ start: 15, end: 35 })
  })

  it('does not snap back to the origin when float noise shrinks the span', () => {
    // Regression: clampViewport used to treat span < minSpan literally and jump to start=0.
    const origin = { start: 10, end: 10 + 1 / 3 }
    const next = panViewport(origin, 1 / 3, full)
    expect(next.start).toBeGreaterThan(10)
    expect(next.end - next.start).toBeCloseTo(origin.end - origin.start, 10)
    expect(next.start).not.toBe(0)
  })

  it('stays put after TimelineBar-style default re-clamp', () => {
    const origin = { start: 10, end: 30 }
    const next = panViewport(origin, 20 + 1 / 7, full)
    const reclamped = clampViewport(next.start, next.end, full)
    expect(reclamped.start).toBeCloseTo(next.start, 10)
    expect(reclamped.end).toBeCloseTo(next.end, 10)
    expect(reclamped.start).not.toBe(0)
  })

  it('survives default re-clamp while already at minSpan', () => {
    const floor = minViewportSpan(full)
    const origin = { start: 10, end: 10 + floor }
    const next = panViewport(origin, 5 + 1 / 3, full)
    const reclamped = clampViewport(next.start, next.end, full)
    expect(reclamped.start).toBeCloseTo(next.start, 10)
    expect(reclamped.end - reclamped.start).toBeCloseTo(floor, 10)
    expect(reclamped.start).not.toBe(0)
  })

  it('must not re-clamp with the exact window width as minSpan', () => {
    // This is the parent-path bug: floor === width + float noise → snap to 0%.
    const origin = { start: 10, end: 10 + 1 / 3 }
    const next = panViewport(origin, 1 / 3, full)
    const badFloor = next.end - next.start
    // Force a microscopically smaller span so an exact-floor clamp would reject it.
    const noisy = { start: next.start, end: next.start + badFloor * (1 - 1e-12) }
    const withExactFloor = clampViewport(noisy.start, noisy.end, full, badFloor)
    // With epsilon, exact-floor clamp should still keep the pan — not jump to 0.
    expect(withExactFloor.start).toBeGreaterThan(1)
    expect(withExactFloor.start).toBeCloseTo(noisy.start, 5)
  })

  it('clamps against the full-range edges while keeping span', () => {
    expect(panViewport({ start: 10, end: 30 }, -100, full)).toEqual({ start: 0, end: 20 })
    expect(panViewport({ start: 70, end: 90 }, 100, full)).toEqual({ start: 80, end: 100 })
  })

  it('pans by keeping the grab offset under the pointer', () => {
    expect(panViewportToGrab(20, 40, 5, full)).toEqual({ start: 35, end: 55 })
  })

  it('clamps grab-pan at the full-range edges without shrinking', () => {
    expect(panViewportToGrab(20, 5, 10, full)).toEqual({ start: 0, end: 20 })
    expect(panViewportToGrab(20, 98, 5, full)).toEqual({ start: 80, end: 100 })
  })

  it('resizes the start edge', () => {
    expect(resizeViewportEdge({ start: 10, end: 40 }, 'start', 20, full)).toEqual({
      start: 20,
      end: 40
    })
  })
})

describe('viewportsEqual', () => {
  it('compares within epsilon', () => {
    expect(viewportsEqual({ start: 1, end: 2 }, { start: 1 + 1e-9, end: 2 })).toBe(true)
    expect(viewportsEqual({ start: 1, end: 2 }, { start: 1.01, end: 2 })).toBe(false)
  })
})

describe('viewportWindowPercent', () => {
  it('maps the window onto the overview bar', () => {
    expect(viewportWindowPercent({ start: 25, end: 50 }, full)).toEqual({
      leftPct: 25,
      widthPct: 25
    })
  })
})
