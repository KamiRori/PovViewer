export type ViewMode = 'grid' | 'focus'

/**
 * Exactly one audible POV at a time.
 * Grid: only the solo id may unmute; no solo ⇒ all muted.
 * Focus: only the focused POV may unmute.
 */
export function shouldMutePov(input: {
  mode: ViewMode
  povId: string
  focusId: string | null
  soloId: string | null
}): boolean {
  if (input.mode === 'focus') {
    if (input.focusId == null || input.povId !== input.focusId) return true
    // M clears solo while staying in focus → mute the focused POV.
    return input.soloId !== input.focusId
  }
  return input.soloId == null || input.povId !== input.soloId
}

export function matchesPlayerQuery(playerName: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return playerName.toLowerCase().includes(needle)
}
