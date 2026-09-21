import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'

/** Max simultaneous continuous decoders among participating cards. */
export const DEFAULT_MAX_LIVE_DECODERS = 4
export const LIVE_DECODER_OPTIONS = [1, 2, 3, 4, 6, 8] as const

interface SlotClaim {
  id: string
  priority: number
}

interface DecodeBudgetApi {
  maxLive: number
  setMaxLive: (value: number) => void
  claim: (id: string, priority: number) => void
  release: (id: string) => void
  isLive: (id: string) => boolean
  getLiveCount: () => number
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => number
}

const DecodeBudgetContext = createContext<DecodeBudgetApi | null>(null)

export function DecodeBudgetProvider({
  maxLive = DEFAULT_MAX_LIVE_DECODERS,
  children
}: {
  maxLive?: number
  children: ReactNode
}) {
  const [limit, setLimit] = useState(maxLive)
  const claimsRef = useRef(new Map<string, SlotClaim>())
  const liveRef = useRef(new Set<string>())
  const versionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())

  const emit = useCallback(() => {
    versionRef.current += 1
    for (const listener of listenersRef.current) listener()
  }, [])

  const recompute = useCallback(() => {
    const ranked = [...claimsRef.current.values()].sort((a, b) => b.priority - a.priority)
    const nextLive = new Set(ranked.slice(0, Math.max(1, limit)).map((claim) => claim.id))
    let changed = nextLive.size !== liveRef.current.size
    if (!changed) {
      for (const id of nextLive) {
        if (!liveRef.current.has(id)) {
          changed = true
          break
        }
      }
    }
    if (!changed) return
    liveRef.current = nextLive
    emit()
  }, [emit, limit])

  const claim = useCallback(
    (id: string, priority: number) => {
      const existing = claimsRef.current.get(id)
      if (existing && existing.priority === priority) return
      claimsRef.current.set(id, { id, priority })
      recompute()
    },
    [recompute]
  )

  const release = useCallback(
    (id: string) => {
      if (!claimsRef.current.delete(id)) return
      if (liveRef.current.delete(id)) emit()
      recompute()
    },
    [emit, recompute]
  )

  const isLive = useCallback((id: string) => liveRef.current.has(id), [])
  const getLiveCount = useCallback(() => liveRef.current.size, [])

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange)
    return () => {
      listenersRef.current.delete(onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => versionRef.current, [])

  const setMaxLive = useCallback((value: number) => {
    const next = Math.max(1, Math.min(16, Math.round(value)))
    setLimit(next)
  }, [])

  useEffect(() => {
    recompute()
  }, [limit, recompute])

  const api = useMemo<DecodeBudgetApi>(
    () => ({
      maxLive: limit,
      setMaxLive,
      claim,
      release,
      isLive,
      getLiveCount,
      subscribe,
      getSnapshot
    }),
    [limit, setMaxLive, claim, release, isLive, getLiveCount, subscribe, getSnapshot]
  )

  return <DecodeBudgetContext.Provider value={api}>{children}</DecodeBudgetContext.Provider>
}

export function useDecodeBudget(): DecodeBudgetApi {
  const api = useContext(DecodeBudgetContext)
  if (!api) throw new Error('useDecodeBudget must be used within DecodeBudgetProvider')
  return api
}

/** Claim a live decode slot while enabled. */
export function useDecodeLive(id: string, enabled: boolean, priority: number): boolean {
  const budget = useDecodeBudget()

  useEffect(() => {
    if (!enabled) {
      budget.release(id)
      return
    }
    budget.claim(id, priority)
    return () => budget.release(id)
  }, [budget, enabled, id, priority])

  const version = useSyncExternalStore(budget.subscribe, budget.getSnapshot, budget.getSnapshot)
  void version
  return enabled && budget.isLive(id)
}

export function useLiveDecodeStats(): { live: number; max: number } {
  const budget = useDecodeBudget()
  const version = useSyncExternalStore(budget.subscribe, budget.getSnapshot, budget.getSnapshot)
  void version
  return { live: budget.getLiveCount(), max: budget.maxLive }
}
