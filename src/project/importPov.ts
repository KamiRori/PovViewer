import type { POVRuntime } from './types'
import { pathIdentity, playerNameFromPath, uniquePlayerName } from '../utils/playerName'

export function importPovPaths(
  existing: readonly POVRuntime[],
  paths: readonly string[]
): POVRuntime[] {
  const knownPaths = new Set(existing.map((pov) => pathIdentity(pov.filePath)))
  const usedNames = existing.map((pov) => pov.playerName)
  const added: POVRuntime[] = []

  for (const filePath of paths) {
    if (filePath.trim() === '') continue
    const key = pathIdentity(filePath)
    if (knownPaths.has(key)) continue
    const baseName = playerNameFromPath(filePath).trim()
    if (baseName === '') continue

    const playerName = uniquePlayerName(baseName, usedNames)
    usedNames.push(playerName)
    knownPaths.add(key)
    added.push({
      id: crypto.randomUUID(),
      playerName,
      filePath,
      duration: 0,
      offset: 0,
      enabled: true,
      muted: true,
      metadataReady: false,
      missing: false
    })
  }

  return added
}
