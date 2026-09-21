import { describe, expect, it } from 'vitest'
import type { POVRuntime } from '../project/types'
import { applySync } from './applySync'

function pov(name: string, offset = 0): POVRuntime {
  return {
    id: name.toLowerCase(),
    playerName: name,
    filePath: `D:/POV/${name}.mp4`,
    duration: 100,
    offset,
    enabled: true,
    muted: true,
    playbackSource: 'proxy',
    markerColor: null,
    exportRanges: [],
    metadataReady: true,
    missing: false
  }
}

describe('applySync', () => {
  it('writes offsets for exact player names', () => {
    const report = applySync([pov('Alice'), pov('Bob')], [
      { playerName: 'Alice', offset: 0 },
      { playerName: 'Bob', offset: 13.42 }
    ])
    expect(report.matched).toEqual(['Alice', 'Bob'])
    expect(report.unmatched).toEqual([])
    expect(report.povs.map((item) => item.offset)).toEqual([0, 13.42])
  })

  it('is case-sensitive and reports unmatched sync names', () => {
    const report = applySync([pov('Alice')], [
      { playerName: 'alice', offset: 5 },
      { playerName: 'Bob', offset: 1 }
    ])
    expect(report.matched).toEqual([])
    expect(report.unmatched).toEqual(['alice', 'Bob'])
    expect(report.povs[0].offset).toBe(0)
  })

  it('leaves unmatched POV offsets unchanged', () => {
    const report = applySync([pov('Alice', 3), pov('Charlie', 7)], [
      { playerName: 'Alice', offset: 1.5 }
    ])
    expect(report.matched).toEqual(['Alice'])
    expect(report.povs.find((item) => item.playerName === 'Alice')?.offset).toBe(1.5)
    expect(report.povs.find((item) => item.playerName === 'Charlie')?.offset).toBe(7)
  })
})
