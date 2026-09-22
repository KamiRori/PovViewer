import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode
} from 'react'
import type { SyncResult } from '../sync/types'
import type { TimelineSelection } from '../timeline/selection'
import type { MarkerColor } from './markerColor'
import type { ColumnCount, PlaybackSource, POVRuntime } from './types'
import type { ProjectState } from './reducer'
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  initialProjectHistoryState,
  projectHistoryReducer
} from './history'

interface ProjectApi {
  state: ProjectState
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  importFiles: (paths: string[]) => void
  rename: (id: string, playerName: string) => void
  remove: (id: string) => void
  setColumns: (columns: ColumnCount) => void
  setDuration: (id: string, duration: number) => void
  setDurationsByPath: (entries: Array<{ filePath: string; duration: number }>) => void
  setOffset: (id: string, offset: number) => void
  setPlaybackSource: (id: string, playbackSource: PlaybackSource) => void
  setMuted: (id: string, muted: boolean) => void
  setMarkerColor: (id: string, markerColor: MarkerColor | null) => void
  addExportRange: (id: string, range: TimelineSelection) => void
  updateExportRange: (id: string, selectionId: string, range: TimelineSelection) => void
  removeExportRange: (id: string, selectionId: string) => void
  setExportRangeLocked: (id: string, selectionId: string, locked: boolean) => void
  reorder: (fromId: string, toId: string) => void
  applySyncResults: (results: SyncResult[]) => void
  clearSyncReport: () => void
  loadProject: (povs: POVRuntime[], projectPath: string | null) => void
  setProjectPath: (projectPath: string | null) => void
  setMissing: (id: string, missing: boolean) => void
  relocate: (id: string, filePath: string) => void
}

const ProjectContext = createContext<ProjectApi | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(projectHistoryReducer, initialProjectHistoryState)
  const state = history.present

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const importFiles = useCallback((paths: string[]) => dispatch({ type: 'import', paths }), [])
  const rename = useCallback(
    (id: string, playerName: string) => dispatch({ type: 'rename', id, playerName }),
    []
  )
  const remove = useCallback((id: string) => dispatch({ type: 'remove', id }), [])
  const setColumns = useCallback(
    (columns: ColumnCount) => dispatch({ type: 'setColumns', columns }),
    []
  )
  const setDuration = useCallback(
    (id: string, duration: number) => dispatch({ type: 'metadata', id, duration }),
    []
  )
  const setDurationsByPath = useCallback(
    (entries: Array<{ filePath: string; duration: number }>) =>
      dispatch({ type: 'metadataByPath', entries }),
    []
  )
  const setOffset = useCallback(
    (id: string, offset: number) => dispatch({ type: 'setOffset', id, offset }),
    []
  )
  const setPlaybackSource = useCallback(
    (id: string, playbackSource: PlaybackSource) =>
      dispatch({ type: 'setPlaybackSource', id, playbackSource }),
    []
  )
  const setMuted = useCallback(
    (id: string, muted: boolean) => dispatch({ type: 'setMuted', id, muted }),
    []
  )
  const setMarkerColor = useCallback(
    (id: string, markerColor: MarkerColor | null) =>
      dispatch({ type: 'setMarkerColor', id, markerColor }),
    []
  )
  const addExportRange = useCallback(
    (id: string, range: TimelineSelection) => dispatch({ type: 'addExportRange', id, range }),
    []
  )
  const updateExportRange = useCallback(
    (id: string, selectionId: string, range: TimelineSelection) =>
      dispatch({ type: 'updateExportRange', id, selectionId, range }),
    []
  )
  const removeExportRange = useCallback(
    (id: string, selectionId: string) =>
      dispatch({ type: 'removeExportRange', id, selectionId }),
    []
  )
  const setExportRangeLocked = useCallback(
    (id: string, selectionId: string, locked: boolean) =>
      dispatch({ type: 'setExportRangeLocked', id, selectionId, locked }),
    []
  )
  const reorder = useCallback(
    (fromId: string, toId: string) => dispatch({ type: 'reorder', fromId, toId }),
    []
  )
  const applySyncResults = useCallback(
    (results: SyncResult[]) => dispatch({ type: 'applySync', results }),
    []
  )
  const clearSyncReport = useCallback(() => dispatch({ type: 'clearSyncReport' }), [])
  const loadProject = useCallback(
    (povs: POVRuntime[], projectPath: string | null) =>
      dispatch({ type: 'loadProject', povs, projectPath }),
    []
  )
  const setProjectPath = useCallback(
    (projectPath: string | null) => dispatch({ type: 'setProjectPath', projectPath }),
    []
  )
  const setMissing = useCallback(
    (id: string, missing: boolean) => dispatch({ type: 'setMissing', id, missing }),
    []
  )
  const relocate = useCallback(
    (id: string, filePath: string) => dispatch({ type: 'relocate', id, filePath }),
    []
  )

  const api = useMemo<ProjectApi>(
    () => ({
      state,
      canUndo: historyCanUndo(history),
      canRedo: historyCanRedo(history),
      undo,
      redo,
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setDurationsByPath,
      setOffset,
      setPlaybackSource,
      setMuted,
      setMarkerColor,
      addExportRange,
      updateExportRange,
      removeExportRange,
      setExportRangeLocked,
      reorder,
      applySyncResults,
      clearSyncReport,
      loadProject,
      setProjectPath,
      setMissing,
      relocate
    }),
    [
      state,
      history,
      undo,
      redo,
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setDurationsByPath,
      setOffset,
      setPlaybackSource,
      setMuted,
      setMarkerColor,
      addExportRange,
      updateExportRange,
      removeExportRange,
      setExportRangeLocked,
      reorder,
      applySyncResults,
      clearSyncReport,
      loadProject,
      setProjectPath,
      setMissing,
      relocate
    ]
  )

  return <ProjectContext.Provider value={api}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectApi {
  const api = useContext(ProjectContext)
  if (!api) throw new Error('useProject must be used within ProjectProvider')
  return api
}
