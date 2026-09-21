import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { SyncResult } from '../sync/types'
import type { ColumnCount, POVRuntime } from './types'
import { initialProjectState, projectReducer, type ProjectState } from './reducer'

interface ProjectApi {
  state: ProjectState
  importFiles: (paths: string[]) => void
  rename: (id: string, playerName: string) => void
  remove: (id: string) => void
  setColumns: (columns: ColumnCount) => void
  setDuration: (id: string, duration: number) => void
  setOffset: (id: string, offset: number) => void
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
  const api = useMemo<ProjectApi>(
    () => ({
      state,
      importFiles: (paths) => dispatch({ type: 'import', paths }),
      rename: (id, playerName) => dispatch({ type: 'rename', id, playerName }),
      remove: (id) => dispatch({ type: 'remove', id }),
      setColumns: (columns) => dispatch({ type: 'setColumns', columns }),
      setDuration: (id, duration) => dispatch({ type: 'metadata', id, duration }),
      setOffset: (id, offset) => dispatch({ type: 'setOffset', id, offset }),
      setMuted: (id, muted) => dispatch({ type: 'setMuted', id, muted }),
      soloAudio: (id) => dispatch({ type: 'soloAudio', id }),
      applySyncResults: (results) => dispatch({ type: 'applySync', results }),
      clearSyncReport: () => dispatch({ type: 'clearSyncReport' }),
      loadProject: (povs, projectPath) => dispatch({ type: 'loadProject', povs, projectPath }),
      setProjectPath: (projectPath) => dispatch({ type: 'setProjectPath', projectPath }),
      setMissing: (id, missing) => dispatch({ type: 'setMissing', id, missing }),
      relocate: (id, filePath) => dispatch({ type: 'relocate', id, filePath })
    }),
    [state]
  )

  return <ProjectContext.Provider value={api}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectApi {
  const api = useContext(ProjectContext)
  if (!api) throw new Error('useProject must be used within ProjectProvider')
  return api
}
