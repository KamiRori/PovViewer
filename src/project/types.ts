import type { ExportSelection } from '../timeline/selection'
import type { MarkerColor } from './markerColor'

export interface POV {
  id: string
  playerName: string
  filePath: string
  duration: number
  offset: number
  enabled: boolean
  muted: boolean
  /** Grid/Focus media: original file or generated preview proxy. */
  playbackSource: PlaybackSource
  /** Optional color tag for filtering and export-range styling. */
  markerColor: MarkerColor | null
  /** Master-timeline export in/out ranges (multiple allowed). */
  exportRanges: ExportSelection[]
}

export type PlaybackSource = 'original' | 'proxy'

export interface POVRuntime extends POV {
  metadataReady: boolean
  missing: boolean
}

export const DEFAULT_PLAYBACK_SOURCE: PlaybackSource = 'original'

export function isPlaybackSource(value: unknown): value is PlaybackSource {
  return value === 'original' || value === 'proxy'
}

export type ColumnCount = 2 | 3 | 4 | 5 | 6

export const COLUMN_OPTIONS: readonly ColumnCount[] = [2, 3, 4, 5, 6]

export function isColumnCount(value: number): value is ColumnCount {
  return COLUMN_OPTIONS.some((option) => option === value)
}
