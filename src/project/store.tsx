import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode
} from 'react'
import type { SyncResult } from '../sync/types'
import type { ColumnCount, PlaybackSource, POVRuntime } from './types'
import { initialProjectState, projectReducer, type ProjectState } from './reducer'

interface ProjectApi {
  state: ProjectState
  importFiles: (paths: string[]) => void
  rename: (id: string, playerName: string) => void
  remove: (id: string) => void
  setColumns: (columns: ColumnCount) => void
  setDuration: (id: string, duration: number) => void
  setDurationsByPath: (entries: Array<{ filePath: string; duration: number }>) => void
  setOffset: (id: string, offset: number) => void
  setPlaybackSource: (id: string, playbackSource: PlaybackSource) => void
  setMuted: (id: string, muted: boolean) => void
  soloAudio: (id: string) => void
  applySyncResults: (results: SyncResult[]) => void
  clearSyncReport: () => void
  loadProject: (povs: POVRuntime[], projectPath: string | null) => void
  setProjectPath: (projectPath: string | null) => void
  setMissing: (id: string, missing: boolean) => void
  relocate: (id: string, filePath: string) => void
}

const ProjectContext = createContext<ProjectApi | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, initialProjectState)

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
  const soloAudio = useCallback((id: string) => dispatch({ type: 'soloAudio', id }), [])
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
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setDurationsByPath,
      setOffset,
      setPlaybackSource,
      setMuted,
      soloAudio,
      applySyncResults,
      clearSyncReport,
      loadProject,
      setProjectPath,
      setMissing,
      relocate
    }),
    [
      state,
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setDurationsByPath,
      setOffset,
      setPlaybackSource,
      setMuted,
      soloAudio,
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
