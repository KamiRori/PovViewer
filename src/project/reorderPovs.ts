import type { POVRuntime } from './types'

/** Move the POV with `fromId` so it occupies the index currently held by `toId`. */
export function reorderPovsById(
  povs: readonly POVRuntime[],
  fromId: string,
  toId: string
): POVRuntime[] {
  if (fromId === toId) return povs as POVRuntime[]
  const fromIndex = povs.findIndex((pov) => pov.id === fromId)
  const toIndex = povs.findIndex((pov) => pov.id === toId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return povs as POVRuntime[]
  }
  const next = [...povs]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}
