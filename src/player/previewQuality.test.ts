import { describe, expect, it } from 'vitest'
import { PREVIEW_QUALITY_PRESETS } from './previewQuality'

describe('PREVIEW_QUALITY_PRESETS', () => {
  it('uses sampled playback for medium and low to avoid continuous decode', () => {
    expect(PREVIEW_QUALITY_PRESETS.high.playbackMode).toBe('continuous')
    expect(PREVIEW_QUALITY_PRESETS.medium.playbackMode).toBe('sampled')
    expect(PREVIEW_QUALITY_PRESETS.low.playbackMode).toBe('sampled')
  })

  it('samples less often on the lowest preset', () => {
    expect(PREVIEW_QUALITY_PRESETS.low.maxFps).toBeLessThan(PREVIEW_QUALITY_PRESETS.medium.maxFps)
  })
})
