import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode
} from 'react'
import type { SyncResult } from '../sync/types'
import type { ColumnCount } from './types'
import { initialProjectState, projectReducer, type ProjectState } from './reducer'

interface ProjectApi {
  state: ProjectState
  importFiles: (paths: string[]) => void
  rename: (id: string, playerName: string) => void
  remove: (id: string) => void
  setColumns: (columns: ColumnCount) => void
  setDuration: (id: string, duration: number) => void
  setOffset: (id: string, offset: number) => void
  applySyncResults: (results: SyncResult[]) => void
  clearSyncReport: () => void
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
  const setOffset = useCallback(
    (id: string, offset: number) => dispatch({ type: 'setOffset', id, offset }),
    []
  )
  const applySyncResults = useCallback(
    (results: SyncResult[]) => dispatch({ type: 'applySync', results }),
    []
  )
  const clearSyncReport = useCallback(() => dispatch({ type: 'clearSyncReport' }), [])

  const api = useMemo<ProjectApi>(
    () => ({
      state,
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setOffset,
      applySyncResults,
      clearSyncReport
    }),
    [
      state,
      importFiles,
      rename,
      remove,
      setColumns,
      setDuration,
      setOffset,
      applySyncResults,
      clearSyncReport
    ]
  )

  return <ProjectContext.Provider value={api}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectApi {
  const api = useContext(ProjectContext)
  if (!api) throw new Error('useProject must be used within ProjectProvider')
  return api
}
