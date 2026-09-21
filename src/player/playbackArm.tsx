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
  /** Unmount only — keeps armed so Focus↔Grid remounts preserve participation. */
  releaseMount: (id: string) => void
  /** Permanent delete (user removed the POV). */
  forget: (id: string) => void
  clearAll: () => void
  getArmedCount: () => number
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => number
}

const PlaybackArmContext = createContext<PlaybackArmApi | null>(null)

export function PlaybackArmProvider({ children }: { children: ReactNode }) {
  const armedRef = useRef(new Set<string>())
  const mountedRef = useRef(new Set<string>())
  const versionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())

  const emit = useCallback(() => {
    versionRef.current += 1
    for (const listener of listenersRef.current) listener()
  }, [])

  const isArmed = useCallback((id: string) => armedRef.current.has(id), [])

  const setArmed = useCallback(
    (id: string, armed: boolean) => {
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

  /** Cards start idle unless explicitly defaultArmed — avoids import-time decoder storm. */
  const ensure = useCallback(
    (id: string, defaultArmed = false) => {
      const wasMounted = mountedRef.current.has(id)
      mountedRef.current.add(id)
      if (wasMounted) return

      // Remount after Focus/Grid switch: keep prior armed state.
      if (armedRef.current.has(id)) {
        emit()
        return
      }

      if (defaultArmed) armedRef.current.add(id)
      emit()
    },
    [emit]
  )

  const releaseMount = useCallback((id: string) => {
    mountedRef.current.delete(id)
  }, [])

  const forget = useCallback(
    (id: string) => {
      mountedRef.current.delete(id)
      if (armedRef.current.delete(id)) emit()
    },
    [emit]
  )

  const clearAll = useCallback(() => {
    armedRef.current.clear()
    mountedRef.current.clear()
    emit()
  }, [emit])

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
      releaseMount,
      forget,
      clearAll,
      getArmedCount,
      subscribe,
      getSnapshot
    }),
    [
      isArmed,
      toggle,
      setArmed,
      ensure,
      releaseMount,
      forget,
      clearAll,
      getArmedCount,
      subscribe,
      getSnapshot
    ]
  )

  return <PlaybackArmContext.Provider value={api}>{children}</PlaybackArmContext.Provider>
}

function usePlaybackArmApi(): PlaybackArmApi {
  const api = useContext(PlaybackArmContext)
  if (!api) throw new Error('usePlaybackArm must be used within PlaybackArmProvider')
  return api
}

/** Subscribe to arm changes for one POV. Participation survives Focus↔Grid remounts. */
export function usePlaybackArm(id: string): {
  armed: boolean
  toggle: () => void
  setArmed: (armed: boolean) => void
} {
  const api = usePlaybackArmApi()

  useEffect(() => {
    api.ensure(id)
    return () => api.releaseMount(id)
  }, [api, id])

  const version = useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot)
  void version

  return {
    armed: api.isArmed(id),
    toggle: () => api.toggle(id),
    setArmed: (armed: boolean) => api.setArmed(id, armed)
  }
}

export function useArmedCount(): number {
  const api = usePlaybackArmApi()
  const version = useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot)
  void version
  return api.getArmedCount()
}

/** Subscribe to arm changes; returns a stable lookup for whether a POV is participating. */
export function useArmedLookup(): (id: string) => boolean {
  const api = usePlaybackArmApi()
  const version = useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot)
  void version
  return api.isArmed
}

export function usePlaybackArmActions(): Pick<PlaybackArmApi, 'forget' | 'clearAll'> {
  const api = usePlaybackArmApi()
  return useMemo(() => ({ forget: api.forget, clearAll: api.clearAll }), [api])
}
