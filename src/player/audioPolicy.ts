export type ViewMode = 'grid' | 'focus'

/**
 * Per-card mute is independent — multiple POVs may play audio at once.
 * The project `muted` flag is the sole source of truth.
 */
export function shouldMutePov(input: { muted: boolean }): boolean {
  return input.muted
}

export function matchesPlayerQuery(playerName: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return playerName.toLowerCase().includes(needle)
}
