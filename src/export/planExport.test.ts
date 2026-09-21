import { describe, expect, it } from 'vitest'
import type { POVRuntime } from '../project/types'
import { describeExportPlan, planExportClips } from './planExport'

function pov(partial: Partial<POVRuntime> & Pick<POVRuntime, 'id' | 'playerName' | 'filePath'>): POVRuntime {
  return {
    duration: 100,
    offset: 0,
    enabled: true,
    muted: true,
    playbackSource: 'original',
    markerColor: null,
    exportRanges: [],
    metadataReady: true,
    missing: false,
    ...partial
  }
}

describe('planExportClips', () => {
  it('maps master ranges onto video time using offset', () => {
    const plans = planExportClips([
      pov({
        id: 'a',
        playerName: 'Alice',
        filePath: 'D:/Alice.mp4',
        offset: 10,
        exportRanges: [{ id: 'r1', start: 15, end: 40 }]
      })
    ])
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      videoStart: 5,
      videoEnd: 30,
      outputName: expect.stringMatching(/_Alice\.mp4$/)
    })
  })

  it('skips empty, out-of-range, and missing clips', () => {
    const plans = planExportClips([
      pov({
        id: 'a',
        playerName: 'Alice',
        filePath: 'D:/Alice.mp4',
        exportRanges: [
          { id: 'zero', start: 10, end: 10 },
          { id: 'before', start: -20, end: -5 },
          { id: 'ok', start: 1, end: 3 }
        ]
      }),
      pov({
        id: 'b',
        playerName: 'Bob',
        filePath: 'D:/Bob.mp4',
        missing: true,
        exportRanges: [{ id: 'x', start: 0, end: 5 }]
      })
    ])
    expect(plans.map((plan) => plan.selectionId)).toEqual(['ok'])
  })

  it('avoids duplicate output names', () => {
    const plans = planExportClips([
      pov({
        id: 'a',
        playerName: 'Alice',
        filePath: 'D:/A.mp4',
        exportRanges: [
          { id: '1', start: 0, end: 2 },
          { id: '2', start: 0, end: 2.0001 }
        ]
      })
    ])
    // Nearly same stamps may collide — second gets suffix when identical names collide
    const names = plans.map((plan) => plan.outputName)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('describeExportPlan', () => {
  it('summarizes empty and non-empty plans', () => {
    expect(describeExportPlan([])).toBe('没有可导出的选区')
    expect(
      describeExportPlan([
        {
          povId: 'a',
          playerName: 'Alice',
          sourcePath: 'a.mp4',
          selectionId: '1',
          masterStart: 0,
          masterEnd: 1,
          videoStart: 0,
          videoEnd: 1,
          outputName: 'a.mp4'
        }
      ])
    ).toContain('1 个片段')
  })
})
