import { describe, expect, it } from 'vitest'
import { PREVIEW_QUALITY_PRESETS } from './previewQuality'

describe('PREVIEW_QUALITY_PRESETS', () => {
  it('keeps continuous playback for all presets to avoid seek thrashing', () => {
    expect(PREVIEW_QUALITY_PRESETS.high.playbackMode).toBe('continuous')
    expect(PREVIEW_QUALITY_PRESETS.medium.playbackMode).toBe('continuous')
    expect(PREVIEW_QUALITY_PRESETS.low.playbackMode).toBe('continuous')
  })

  it('relaxes sync corrections on lower quality', () => {
    expect(PREVIEW_QUALITY_PRESETS.low.hardSeekSlack).toBeGreaterThan(
      PREVIEW_QUALITY_PRESETS.high.hardSeekSlack
    )
    expect(PREVIEW_QUALITY_PRESETS.low.softSync).toBe(false)
  })
})
