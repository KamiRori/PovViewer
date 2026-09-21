import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode
} from 'react'

interface PlaybackArmApi {
  isArmed: (id: string) => boolean
  toggle: (id: string) => void
  setArmed: (id: string, armed: boolean) => void
  ensure: (id: string, defaultArmed?: boolean) => void
  remove: (id: string) => void
  getArmedCount: () => number
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => number
}

const PlaybackArmContext = createContext<PlaybackArmApi | null>(null)

export function PlaybackArmProvider({ children }: { children: ReactNode }) {
  const armedRef = useRef(new Set<string>())
  const knownRef = useRef(new Set<string>())
  const versionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())

  const emit = useCallback(() => {
    versionRef.current += 1
    for (const listener of listenersRef.current) listener()
  }, [])

  const isArmed = useCallback((id: string) => armedRef.current.has(id), [])

  const setArmed = useCallback(
    (id: string, armed: boolean) => {
      knownRef.current.add(id)
      const has = armedRef.current.has(id)
      if (armed && !has) {
        armedRef.current.add(id)
        emit()
      } else if (!armed && has) {
        armedRef.current.delete(id)
        emit()
      }
    },
    [emit]
  )

  const toggle = useCallback(
    (id: string) => {
      setArmed(id, !armedRef.current.has(id))
    },
    [setArmed]
  )

  const ensure = useCallback((id: string, defaultArmed?: boolean) => {
    if (knownRef.current.has(id)) return
    knownRef.current.add(id)
    // First card arms by default; later imports stay idle until the user clicks.
    const shouldArm = defaultArmed ?? armedRef.current.size === 0
    if (shouldArm) armedRef.current.add(id)
    emit()
  }, [emit])

  const remove = useCallback(
    (id: string) => {
      knownRef.current.delete(id)
      if (armedRef.current.delete(id)) emit()
    },
    [emit]
  )

  const getArmedCount = useCallback(() => armedRef.current.size, [])

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange)
    return () => {
      listenersRef.current.delete(onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => versionRef.current, [])

  const api = useMemo<PlaybackArmApi>(
    () => ({
      isArmed,
      toggle,
      setArmed,
      ensure,
      remove,
      getArmedCount,
      subscribe,
      getSnapshot
    }),
    [isArmed, toggle, setArmed, ensure, remove, getArmedCount, subscribe, getSnapshot]
  )

  return <PlaybackArmContext.Provider value={api}>{children}</PlaybackArmContext.Provider>
}

function usePlaybackArmApi(): PlaybackArmApi {
  const api = useContext(PlaybackArmContext)
  if (!api) throw new Error('usePlaybackArm must be used within PlaybackArmProvider')
  return api
}

/** Subscribe to arm changes for one POV. First card arms by default. */
export function usePlaybackArm(id: string): { armed: boolean; toggle: () => void } {
  const api = usePlaybackArmApi()

  useEffect(() => {
    api.ensure(id)
    return () => api.remove(id)
  }, [api, id])

  const version = useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot)
  void version

  return {
    armed: api.isArmed(id),
    toggle: () => api.toggle(id)
  }
}

export function useArmedCount(): number {
  const api = usePlaybackArmApi()
  const version = useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot)
  void version
  return api.getArmedCount()
}
