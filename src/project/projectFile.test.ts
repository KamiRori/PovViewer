import { describe, expect, it } from 'vitest'
import { parseProjectJson, projectToJson, serializeProject } from './projectFile'
import type { POVRuntime } from './types'

function samplePov(overrides: Partial<POVRuntime> = {}): POVRuntime {
  return {
    id: 'alice',
    playerName: 'Alice',
    filePath: 'D:/POV/Alice.mp4',
    duration: 120,
    offset: 0,
    enabled: true,
    muted: true,
    metadataReady: true,
    missing: false,
    ...overrides
  }
}

describe('serializeProject', () => {
  it('omits duration from persisted povs and writes masterDuration from range', () => {
    const json = serializeProject([
      samplePov(),
      samplePov({
        id: 'bob',
        playerName: 'Bob',
        filePath: 'D:/POV/Bob.mp4',
        offset: 10,
        duration: 100,
        muted: false
      })
    ])
    expect(json.version).toBe(1)
    expect(json.masterDuration).toBe(120)
    expect(json.povs[0]).toEqual({
      id: 'alice',
      playerName: 'Alice',
      filePath: 'D:/POV/Alice.mp4',
      offset: 0,
      enabled: true,
      muted: true
    })
    expect(json.povs[0]).not.toHaveProperty('duration')
  })
})

describe('parseProjectJson', () => {
  it('loads version 1 and ignores persisted duration', () => {
    const text = projectToJson([samplePov({ duration: 999 })])
    const withDuration = text.replace(
      '"muted": true',
      '"muted": true,\n      "duration": 999'
    )
    const parsed = parseProjectJson(withDuration)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.runtime[0]?.duration).toBe(0)
    expect(parsed.runtime[0]?.metadataReady).toBe(false)
    expect(parsed.project.povs[0]?.playerName).toBe('Alice')
  })

  it('rejects unsupported versions', () => {
    const parsed = parseProjectJson(JSON.stringify({ version: 2, povs: [] }))
    expect(parsed.ok).toBe(false)
  })
})
