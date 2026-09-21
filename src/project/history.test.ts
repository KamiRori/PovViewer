import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  initialProjectHistoryState,
  projectHistoryReducer,
  undoKey
} from './history'
import type { POVRuntime } from './types'

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

describe('projectHistoryReducer', () => {
  it('undoes and redoes user edits', () => {
    let state = initialProjectHistoryState
    state = projectHistoryReducer(state, {
      type: 'import',
      paths: ['D:/POV/Alice.mp4']
    })
    expect(state.present.povs).toHaveLength(1)
    expect(canUndo(state)).toBe(true)

    const afterImport = state
    state = projectHistoryReducer(state, {
      type: 'setMuted',
      id: state.present.povs[0]!.id,
      muted: false
    })
    expect(state.present.povs[0]?.muted).toBe(false)

    state = projectHistoryReducer(state, { type: 'undo' })
    expect(state.present.povs[0]?.muted).toBe(true)
    expect(canRedo(state)).toBe(true)

    state = projectHistoryReducer(state, { type: 'redo' })
    expect(state.present.povs[0]?.muted).toBe(false)

    state = projectHistoryReducer(state, { type: 'undo' })
    state = projectHistoryReducer(state, { type: 'undo' })
    expect(state.present.povs).toHaveLength(0)
    expect(afterImport.past).toHaveLength(1)
  })

  it('coalesces repeated export-range updates into one undo step', () => {
    let state = projectHistoryReducer(initialProjectHistoryState, {
      type: 'loadProject',
      povs: [pov('a')],
      projectPath: null
    })
    expect(state.past).toHaveLength(0)

    state = projectHistoryReducer(state, {
      type: 'addExportRange',
      id: 'a',
      range: { start: 1, end: 1 }
    })
    const selectionId = state.present.povs[0]!.exportRanges[0]!.id

    state = projectHistoryReducer(state, {
      type: 'updateExportRange',
      id: 'a',
      selectionId,
      range: { start: 1, end: 2 }
    })
    state = projectHistoryReducer(state, {
      type: 'updateExportRange',
      id: 'a',
      selectionId,
      range: { start: 1, end: 5 }
    })
    state = projectHistoryReducer(state, {
      type: 'updateExportRange',
      id: 'a',
      selectionId,
      range: { start: 1, end: 9 }
    })

    expect(state.present.povs[0]?.exportRanges[0]).toMatchObject({ start: 1, end: 9 })
    // load (no history) + add + first update = 2 past entries (coalesced updates)
    expect(state.past).toHaveLength(2)

    state = projectHistoryReducer(state, { type: 'undo' })
    expect(state.present.povs[0]?.exportRanges[0]).toMatchObject({ start: 1, end: 1 })
  })

  it('does not record metadata probes in undo history', () => {
    let state = projectHistoryReducer(initialProjectHistoryState, {
      type: 'loadProject',
      povs: [pov('a')],
      projectPath: null
    })
    state = projectHistoryReducer(state, { type: 'metadata', id: 'a', duration: 42 })
    expect(state.present.povs[0]?.duration).toBe(42)
    expect(canUndo(state)).toBe(false)
  })

  it('builds coalesce keys for drag-like edits', () => {
    expect(
      undoKey({
        type: 'updateExportRange',
        id: 'a',
        selectionId: 's1',
        range: { start: 0, end: 1 }
      })
    ).toBe('updateExportRange:a:s1')
    expect(undoKey({ type: 'import', paths: [] })).toBeNull()
  })
})
