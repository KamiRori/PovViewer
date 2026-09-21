import { describe, expect, it } from 'vitest'
import { enqueueMetadataProbe } from './mediaProbeQueue'

describe('mediaProbeQueue', () => {
  it('resolves null immediately when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await enqueueMetadataProbe('pov://test', controller.signal)
    expect(result).toBeNull()
  })
})
