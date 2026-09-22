import { describe, expect, it } from 'vitest'
import {
  parseFfmpegOutTime,
  planProxySegments,
  planProxySegmentsByMaxLength,
  resolveJobParallelism
} from './proxyEncode'
import { resolveSegmentConcurrency, videoEncoderArgs } from './proxyEncoder'

describe('resolveJobParallelism', () => {
  it('gives many threads to a solitary CPU job', () => {
    expect(resolveJobParallelism(8, 1, 0)).toBe(8)
  })

  it('splits cores across many in-flight jobs', () => {
    expect(resolveJobParallelism(8, 8, 0)).toBe(1)
    expect(resolveJobParallelism(8, 4, 0)).toBe(2)
  })

  it('ignores queued work (file concurrency already gates starts)', () => {
    expect(resolveJobParallelism(8, 1, 7)).toBe(8)
  })
})

describe('resolveSegmentConcurrency', () => {
  it('runs several CPU segment workers', () => {
    expect(resolveSegmentConcurrency(16, 1, 'libx264')).toBe(8)
    expect(resolveSegmentConcurrency(8, 2, 'libx264')).toBe(4)
  })

  it('serializes GPU segment workers', () => {
    expect(resolveSegmentConcurrency(16, 1, 'h264_nvenc')).toBe(1)
  })
})

describe('videoEncoderArgs', () => {
  it('includes nvenc codec', () => {
    expect(videoEncoderArgs('h264_nvenc').join(' ')).toContain('h264_nvenc')
  })
})

describe('parseFfmpegOutTime', () => {
  it('parses ffmpeg time stamps', () => {
    expect(parseFfmpegOutTime('frame=  10 fps=30 time=00:01:30.50 bitrate=N/A')).toBeCloseTo(
      90.5,
      5
    )
    expect(parseFfmpegOutTime('no time here')).toBeNull()
  })
})

describe('planProxySegmentsByMaxLength', () => {
  it('keeps short clips whole', () => {
    expect(planProxySegmentsByMaxLength(120, 300)).toEqual([{ start: 0, duration: 120 }])
  })

  it('splits long clips into capped chunks', () => {
    const parts = planProxySegmentsByMaxLength(3600, 600)
    expect(parts.length).toBe(6)
    const covered = parts.reduce((sum, part) => sum + part.duration, 0)
    expect(covered).toBeCloseTo(3600, 5)
  })
})

describe('planProxySegments', () => {
  it('keeps short clips as one segment', () => {
    expect(planProxySegments(60, 8)).toEqual([{ start: 0, duration: 60 }])
  })

  it('splits long clips across parallelism', () => {
    const parts = planProxySegments(3600, 4)
    expect(parts).toHaveLength(4)
    const covered = parts.reduce((sum, part) => sum + part.duration, 0)
    expect(covered).toBeCloseTo(3600, 5)
    expect(parts[0]?.start).toBe(0)
  })

  it('does not over-split tiny long-enough clips', () => {
    const parts = planProxySegments(100, 16)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.length).toBeLessThanOrEqual(2)
  })
})
