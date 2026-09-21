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
    playbackSource: 'original',
    markerColor: null,
    exportRanges: [],
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
      muted: true,
      playbackSource: 'original'
    })
    expect(json.povs[0]).not.toHaveProperty('duration')
  })

  it('round-trips a proxy playbackSource', () => {
    const json = serializeProject([samplePov({ playbackSource: 'proxy' })])
    expect(json.povs[0]?.playbackSource).toBe('proxy')
  })

  it('persists per-POV exportRanges including zero-length', () => {
    const json = serializeProject([
      samplePov({
        exportRanges: [{ id: 'r1', start: 12, end: 40 }]
      }),
      samplePov({
        id: 'bob',
        playerName: 'Bob',
        filePath: 'D:/POV/Bob.mp4',
        exportRanges: [
          { id: 'r2', start: 5, end: 5 },
          { id: 'r3', start: 20, end: 30 }
        ]
      })
    ])
    expect(json.povs[0]?.exportRanges).toEqual([{ id: 'r1', start: 12, end: 40 }])
    expect(json.povs[1]?.exportRanges).toEqual([
      { id: 'r2', start: 5, end: 5 },
      { id: 'r3', start: 20, end: 30 }
    ])
    expect(json.povs[0]).not.toHaveProperty('exportRange')
  })
  it('persists markerColor', () => {
    const json = serializeProject([samplePov({ markerColor: 'cyan' })])
    expect(json.povs[0]?.markerColor).toBe('cyan')
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
    expect(parsed.runtime[0]?.playbackSource).toBe('original')
    expect(parsed.project.povs[0]?.playerName).toBe('Alice')
  })

  it('defaults playbackSource when omitted from older files', () => {
    const parsed = parseProjectJson(
      JSON.stringify({
        version: 1,
        masterDuration: 0,
        povs: [
          {
            id: 'alice',
            playerName: 'Alice',
            filePath: 'D:/POV/Alice.mp4',
            offset: 0,
            enabled: true,
            muted: true
          }
        ]
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.runtime[0]?.playbackSource).toBe('original')
  })

  it('loads per-POV exportRanges from project files', () => {
    const parsed = parseProjectJson(
      JSON.stringify({
        version: 1,
        masterDuration: 120,
        povs: [
          {
            id: 'alice',
            playerName: 'Alice',
            filePath: 'D:/POV/Alice.mp4',
            offset: 0,
            enabled: true,
            muted: true,
            exportRanges: [
              { id: 'a', start: 10, end: 50 },
              { id: 'b', start: 60, end: 80 }
            ]
          }
        ]
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.runtime[0]?.exportRanges).toEqual([
      { id: 'a', start: 10, end: 50 },
      { id: 'b', start: 60, end: 80 }
    ])
  })

  it('migrates legacy single exportRange into exportRanges', () => {
    const parsed = parseProjectJson(
      JSON.stringify({
        version: 1,
        masterDuration: 120,
        povs: [
          {
            id: 'alice',
            playerName: 'Alice',
            filePath: 'D:/POV/Alice.mp4',
            offset: 0,
            enabled: true,
            muted: true,
            exportRange: { start: 10, end: 50 }
          }
        ]
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.runtime[0]?.exportRanges).toHaveLength(1)
    expect(parsed.runtime[0]?.exportRanges[0]).toMatchObject({ start: 10, end: 50 })
    expect(parsed.runtime[0]?.exportRanges[0]?.id).toBeTruthy()
  })

  it('rejects unsupported versions', () => {
    const parsed = parseProjectJson(JSON.stringify({ version: 2, povs: [] }))
    expect(parsed.ok).toBe(false)
  })
})
