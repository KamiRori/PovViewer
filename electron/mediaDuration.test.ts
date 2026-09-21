import { describe, expect, it } from 'vitest'
import { parseFfmpegDuration } from './mediaDuration'

describe('parseFfmpegDuration', () => {
  it('parses HH:MM:SS.ms', () => {
    const sample =
      "Input #0, mov,mp4:\n  Duration: 01:23:45.67, start: 0.000000, bitrate: 8000 kb/s\n"
    expect(parseFfmpegDuration(sample)).toBeCloseTo(1 * 3600 + 23 * 60 + 45.67, 5)
  })

  it('returns null when missing', () => {
    expect(parseFfmpegDuration('no duration here')).toBeNull()
  })
})
