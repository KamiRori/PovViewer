import { describe, expect, it } from 'vitest'
import {
  clampViewport,
  panViewport,
  resizeViewportEdge,
  viewportWindowPercent
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

  it('resizes the start edge', () => {
    expect(resizeViewportEdge({ start: 10, end: 40 }, 'start', 20, full)).toEqual({
      start: 20,
      end: 40
    })
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
