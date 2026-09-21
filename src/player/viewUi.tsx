import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { MarkerFilter } from '../project/markerColor'
import type { ViewMode } from './audioPolicy'

interface ViewUiApi {
  mode: ViewMode
  focusId: string | null
  /** Last card interacted with — keyboard M/F target in grid; no visual chrome. */
  activeId: string | null
  query: string
  markerFilter: MarkerFilter
  enterFocus: (id: string) => void
  exitFocus: () => void
  setActiveId: (id: string | null) => void
  setQuery: (query: string) => void
  setMarkerFilter: (filter: MarkerFilter) => void
}

const ViewUiContext = createContext<ViewUiApi | null>(null)

export function ViewUiProvider({ children }: { children: ReactNode }) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [markerFilter, setMarkerFilter] = useState<MarkerFilter>(null)

  const enterFocus = useCallback((id: string) => {
    setFocusId(id)
    setActiveId(id)
  }, [])

  const exitFocus = useCallback(() => {
    setFocusId(null)
  }, [])

  const api = useMemo<ViewUiApi>(
    () => ({
      mode: focusId ? 'focus' : 'grid',
      focusId,
      activeId,
      query,
      markerFilter,
      enterFocus,
      exitFocus,
      setActiveId,
      setQuery,
      setMarkerFilter
    }),
    [activeId, enterFocus, exitFocus, focusId, markerFilter, query]
  )

  return <ViewUiContext.Provider value={api}>{children}</ViewUiContext.Provider>
}

export function useViewUi(): ViewUiApi {
  const api = useContext(ViewUiContext)
  if (!api) throw new Error('useViewUi must be used within ViewUiProvider')
  return api
}
