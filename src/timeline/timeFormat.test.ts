import { describe, expect, it } from 'vitest'
import { formatMasterTime } from './timeFormat'

describe('formatMasterTime', () => {
  it('formats short times as MM:SS.mmm', () => {
    expect(formatMasterTime(822.321)).toBe('13:42.321')
  })

  it('formats long times with hours', () => {
    expect(formatMasterTime(3723.5)).toBe('01:02:03.500')
  })

  it('formats negative master times', () => {
    expect(formatMasterTime(-5.81)).toBe('-00:05.810')
  })
})
