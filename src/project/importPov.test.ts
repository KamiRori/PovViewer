import { describe, expect, it } from 'vitest'
import { importPovPaths } from './importPov'
import type { POVRuntime } from './types'

describe('importPovPaths', () => {
  it('creates muted, enabled POV records from file names', () => {
    const added = importPovPaths([], ['D:\\POV\\Alice.mp4', 'D:\\Other\\Alice.mov'])

    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({
      playerName: 'Alice',
      filePath: 'D:\\POV\\Alice.mp4',
      duration: 0,
      offset: 0,
      enabled: true,
      muted: true,
      metadataReady: false,
      missing: false
    })
    expect(added[1].playerName).toBe('Alice (2)')
    expect(added[0].id).not.toBe(added[1].id)
  })

  it('skips a path that is already imported', () => {
    const existing = importPovPaths([], ['D:/POV/Alice.mp4'])
    const added = importPovPaths(existing, ['d:\\pov\\Alice.mp4', 'D:/POV/Bob.mp4'])

    expect(added.map((pov) => pov.playerName)).toEqual(['Bob'])
  })

  it('considers names that already exist', () => {
    const existing: POVRuntime[] = [
      {
        id: 'alice',
        playerName: 'Alice',
        filePath: 'D:/POV/Alice.mp4',
        duration: 0,
        offset: 0,
        enabled: true,
        muted: true,
        metadataReady: false,
        missing: false
      }
    ]
    const added = importPovPaths(existing, ['D:/Other/Alice.mp4'])
    expect(added[0].playerName).toBe('Alice (2)')
  })
})
