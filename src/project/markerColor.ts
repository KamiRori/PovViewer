export const MARKER_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink'
] as const

export type MarkerColor = (typeof MARKER_COLORS)[number]

/** null = no color filter; 'none' = unmarked only. */
export type MarkerFilter = MarkerColor | 'none' | null

export const MARKER_COLOR_LABELS: Record<MarkerColor, string> = {
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  cyan: '青',
  blue: '蓝',
  purple: '紫',
  pink: '粉'
}

export function isMarkerColor(value: unknown): value is MarkerColor {
  return typeof value === 'string' && (MARKER_COLORS as readonly string[]).includes(value)
}

export function parseMarkerColor(value: unknown): MarkerColor | null {
  if (value == null) return null
  return isMarkerColor(value) ? value : null
}

/** Match player name query and optional marker-color filter from the search panel. */
export function matchesPovQuery(
  input: { playerName: string; markerColor: MarkerColor | null },
  query: string,
  markerFilter: MarkerFilter = null
): boolean {
  if (markerFilter === 'none') {
    if (input.markerColor !== null) return false
  } else if (markerFilter !== null) {
    if (input.markerColor !== markerFilter) return false
  }

  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return input.playerName.toLowerCase().includes(needle)
}
