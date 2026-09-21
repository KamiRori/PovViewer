import type { ColumnCount, PlaybackSource, POVRuntime } from './types'
import {
  createExportSelection,
  constrainSelectionNoOverlap,
  isTimeInsideSelection,
  type TimelineSelection
} from '../timeline/selection'
import type { MarkerColor } from './markerColor'
import { importPovPaths } from './importPov'
import { reorderPovsById } from './reorderPovs'
import { applySync } from '../sync/applySync'
import type { SyncResult } from '../sync/types'
import { pathIdentity } from '../utils/playerName'

export interface ProjectState {
  povs: POVRuntime[]
  columns: ColumnCount
  lastSyncUnmatched: string[]
  projectPath: string | null
}

export const initialProjectState: ProjectState = {
  povs: [],
  columns: 4,
  lastSyncUnmatched: [],
  projectPath: null
}

export type ProjectAction =
  | { type: 'import'; paths: string[] }
  | { type: 'rename'; id: string; playerName: string }
  | { type: 'remove'; id: string }
  | { type: 'setColumns'; columns: ColumnCount }
  | { type: 'metadata'; id: string; duration: number }
  | { type: 'metadataByPath'; entries: Array<{ filePath: string; duration: number }> }
  | { type: 'setOffset'; id: string; offset: number }
  | { type: 'setPlaybackSource'; id: string; playbackSource: PlaybackSource }
  | { type: 'setMuted'; id: string; muted: boolean }
  | { type: 'setMarkerColor'; id: string; markerColor: MarkerColor | null }
  | { type: 'addExportRange'; id: string; range: TimelineSelection }
  | { type: 'updateExportRange'; id: string; selectionId: string; range: TimelineSelection }
  | { type: 'removeExportRange'; id: string; selectionId: string }
  | { type: 'reorder'; fromId: string; toId: string }
  | { type: 'applySync'; results: SyncResult[] }
  | { type: 'clearSyncReport' }
  | { type: 'loadProject'; povs: POVRuntime[]; projectPath: string | null }
  | { type: 'setProjectPath'; projectPath: string | null }
  | { type: 'setMissing'; id: string; missing: boolean }
  | { type: 'relocate'; id: string; filePath: string }

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'import': {
      const added = importPovPaths(state.povs, action.paths)
      if (added.length === 0) return state
      return { ...state, povs: [...state.povs, ...added] }
    }
    case 'rename':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, playerName: action.playerName } : pov
        )
      }
    case 'remove':
      return {
        ...state,
        povs: state.povs.filter((pov) => pov.id !== action.id)
      }
    case 'setColumns':
      return { ...state, columns: action.columns }
    case 'metadata': {
      if (!Number.isFinite(action.duration) || action.duration < 0) return state
      let changed = false
      const povs = state.povs.map((pov) => {
        if (pov.id !== action.id) return pov
        if (pov.metadataReady && pov.duration === action.duration) return pov
        changed = true
        return { ...pov, duration: action.duration, metadataReady: true }
      })
      return changed ? { ...state, povs } : state
    }
    case 'metadataByPath': {
      if (action.entries.length === 0) return state
      const byPath = new Map<string, number>()
      for (const entry of action.entries) {
        if (!Number.isFinite(entry.duration) || entry.duration < 0) continue
        byPath.set(pathIdentity(entry.filePath), entry.duration)
      }
      if (byPath.size === 0) return state
      let changed = false
      const povs = state.povs.map((pov) => {
        const duration = byPath.get(pathIdentity(pov.filePath))
        if (duration === undefined) return pov
        if (pov.metadataReady && pov.duration === duration) return pov
        changed = true
        return { ...pov, duration, metadataReady: true }
      })
      return changed ? { ...state, povs } : state
    }
    case 'setOffset': {
      if (!Number.isFinite(action.offset)) return state
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, offset: action.offset } : pov
        )
      }
    }
    case 'setPlaybackSource':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, playbackSource: action.playbackSource } : pov
        )
      }
    case 'setMuted':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, muted: action.muted } : pov
        )
      }
    case 'setMarkerColor':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, markerColor: action.markerColor } : pov
        )
      }
    case 'addExportRange':
      return {
        ...state,
        povs: state.povs.map((pov) => {
          if (pov.id !== action.id) return pov
          if (isTimeInsideSelection(action.range.start, pov.exportRanges)) return pov
          if (isTimeInsideSelection(action.range.end, pov.exportRanges)) return pov
          const created = createExportSelection(action.range.start, action.range.end)
          const overlaps = pov.exportRanges.some(
            (existing) => created.start < existing.end && existing.start < created.end
          )
          if (overlaps) return pov
          return { ...pov, exportRanges: [...pov.exportRanges, created] }
        })
      }
    case 'updateExportRange':
      return {
        ...state,
        povs: state.povs.map((pov) => {
          if (pov.id !== action.id) return pov
          const origin = pov.exportRanges.find(
            (selection) => selection.id === action.selectionId
          )
          if (!origin) return pov
          const wideRange = { start: -1e12, end: 1e12, duration: 2e12 }
          const next = constrainSelectionNoOverlap(
            action.range,
            origin,
            pov.exportRanges,
            action.selectionId,
            wideRange
          )
          return {
            ...pov,
            exportRanges: pov.exportRanges.map((selection) =>
              selection.id === action.selectionId
                ? { ...selection, start: next.start, end: next.end }
                : selection
            )
          }
        })
      }
    case 'removeExportRange':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id
            ? {
                ...pov,
                exportRanges: pov.exportRanges.filter(
                  (selection) => selection.id !== action.selectionId
                )
              }
            : pov
        )
      }
    case 'reorder': {
      const povs = reorderPovsById(state.povs, action.fromId, action.toId)
      return povs === state.povs ? state : { ...state, povs }
    }
    case 'applySync': {
      const report = applySync(state.povs, action.results)
      return {
        ...state,
        povs: report.povs,
        lastSyncUnmatched: report.unmatched
      }
    }
    case 'clearSyncReport':
      return state.lastSyncUnmatched.length === 0
        ? state
        : { ...state, lastSyncUnmatched: [] }
    case 'loadProject':
      return {
        ...state,
        povs: action.povs,
        projectPath: action.projectPath,
        lastSyncUnmatched: []
      }
    case 'setProjectPath':
      return { ...state, projectPath: action.projectPath }
    case 'setMissing':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id ? { ...pov, missing: action.missing } : pov
        )
      }
    case 'relocate':
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id
            ? {
                ...pov,
                filePath: action.filePath,
                missing: false,
                duration: 0,
                metadataReady: false
              }
            : pov
        )
      }
    default:
      return state
  }
}
