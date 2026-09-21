import type { POVRuntime } from '../project/types'
import type { SyncResult } from './types'

export interface ApplySyncReport {
  povs: POVRuntime[]
  matched: string[]
  unmatched: string[]
}

/**
 * Apply SyncResult[] by exact playerName match (case-sensitive).
 * Unmatched sync entries keep existing POV offsets unchanged.
 */
export function applySync(povs: readonly POVRuntime[], results: readonly SyncResult[]): ApplySyncReport {
  const byName = new Map<string, SyncResult>()
  for (const result of results) {
    byName.set(result.playerName, result)
  }

  const matched: string[] = []
  const unmatched: string[] = []
  const next = povs.map((pov) => {
    const hit = byName.get(pov.playerName)
    if (!hit) return pov
    matched.push(pov.playerName)
    byName.delete(pov.playerName)
    if (pov.offset === hit.offset) return pov
    return { ...pov, offset: hit.offset }
  })

  for (const name of byName.keys()) unmatched.push(name)

  return { povs: next, matched, unmatched }
}
