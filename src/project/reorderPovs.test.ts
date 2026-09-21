import { describe, expect, it } from 'vitest'
import type { POVRuntime } from './types'
import { reorderPovsById } from './reorderPovs'

function pov(id: string): POVRuntime {
  return {
    id,
    playerName: id,
    filePath: `${id}.mp4`,
    duration: 10,
    offset: 0,
    enabled: true,
    muted: true,
    playbackSource: 'original',
    markerColor: null,
    exportRanges: [],
    metadataReady: true,
    missing: false
  }
}

describe('reorderPovsById', () => {
  it('moves an item to the target index', () => {
    const list = [pov('a'), pov('b'), pov('c'), pov('d')]
    expect(reorderPovsById(list, 'a', 'c').map((p) => p.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderPovsById(list, 'c', 'a').map((p) => p.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(reorderPovsById(list, 'b', 'd').map((p) => p.id)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('returns the same array reference when nothing changes', () => {
    const list = [pov('a'), pov('b')]
    expect(reorderPovsById(list, 'a', 'a')).toBe(list)
    expect(reorderPovsById(list, 'x', 'a')).toBe(list)
  })
})
