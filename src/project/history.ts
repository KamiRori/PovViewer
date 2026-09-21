import { projectReducer, type ProjectAction, type ProjectState, initialProjectState } from './reducer'

const MAX_HISTORY = 100

export interface ProjectHistoryState {
  past: ProjectState[]
  present: ProjectState
  future: ProjectState[]
  /** When set, consecutive actions with the same key share one undo step. */
  lastUndoKey: string | null
}

export type HistoryAction =
  | ProjectAction
  | { type: 'undo' }
  | { type: 'redo' }

export const initialProjectHistoryState: ProjectHistoryState = {
  past: [],
  present: initialProjectState,
  future: [],
  lastUndoKey: null
}

export function canUndo(state: ProjectHistoryState): boolean {
  return state.past.length > 0
}

export function canRedo(state: ProjectHistoryState): boolean {
  return state.future.length > 0
}

function isHistoryReset(action: ProjectAction): boolean {
  return action.type === 'loadProject'
}

function isUndoable(action: ProjectAction): boolean {
  switch (action.type) {
    case 'metadata':
    case 'metadataByPath':
    case 'setMissing':
    case 'setProjectPath':
    case 'clearSyncReport':
    case 'loadProject':
      return false
    default:
      return true
  }
}

/** Actions that should coalesce into one undo step while repeating. */
export function undoKey(action: ProjectAction): string | null {
  switch (action.type) {
    case 'updateExportRange':
      return `updateExportRange:${action.id}:${action.selectionId}`
    case 'setOffset':
      return `setOffset:${action.id}`
    case 'rename':
      return `rename:${action.id}`
    case 'setMuted':
      return `setMuted:${action.id}`
    case 'setMarkerColor':
      return `setMarkerColor:${action.id}`
    case 'setPlaybackSource':
      return `setPlaybackSource:${action.id}`
    default:
      return null
  }
}

export function projectHistoryReducer(
  state: ProjectHistoryState,
  action: HistoryAction
): ProjectHistoryState {
  if (action.type === 'undo') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]!
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
      lastUndoKey: null
    }
  }

  if (action.type === 'redo') {
    if (state.future.length === 0) return state
    const next = state.future[0]!
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
      lastUndoKey: null
    }
  }

  const nextPresent = projectReducer(state.present, action)
  if (nextPresent === state.present) return state

  if (isHistoryReset(action)) {
    return {
      past: [],
      present: nextPresent,
      future: [],
      lastUndoKey: null
    }
  }

  if (!isUndoable(action)) {
    return { ...state, present: nextPresent }
  }

  const key = undoKey(action)
  if (key !== null && key === state.lastUndoKey) {
    return {
      ...state,
      present: nextPresent,
      lastUndoKey: key
    }
  }

  const past = [...state.past, state.present]
  while (past.length > MAX_HISTORY) past.shift()

  return {
    past,
    present: nextPresent,
    future: [],
    lastUndoKey: key
  }
}
