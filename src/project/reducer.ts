import type { ColumnCount, POVRuntime } from './types'
import { importPovPaths } from './importPov'

export interface ProjectState {
  povs: POVRuntime[]
  columns: ColumnCount
}

export const initialProjectState: ProjectState = {
  povs: [],
  columns: 4
}

export type ProjectAction =
  | { type: 'import'; paths: string[] }
  | { type: 'rename'; id: string; playerName: string }
  | { type: 'remove'; id: string }
  | { type: 'setColumns'; columns: ColumnCount }
  | { type: 'metadata'; id: string; duration: number }

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
    case 'metadata':
      if (!Number.isFinite(action.duration) || action.duration < 0) return state
      return {
        ...state,
        povs: state.povs.map((pov) =>
          pov.id === action.id
            ? { ...pov, duration: action.duration, metadataReady: true }
            : pov
        )
      }
    default:
      return state
  }
}
