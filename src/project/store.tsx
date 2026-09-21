import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { ColumnCount } from './types'
import { initialProjectState, projectReducer, type ProjectState } from './reducer'

interface ProjectApi {
  state: ProjectState
  importFiles: (paths: string[]) => void
  rename: (id: string, playerName: string) => void
  remove: (id: string) => void
  setColumns: (columns: ColumnCount) => void
  setDuration: (id: string, duration: number) => void
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
      setDuration: (id, duration) => dispatch({ type: 'metadata', id, duration })
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
