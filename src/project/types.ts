export interface POV {
  id: string
  playerName: string
  filePath: string
  duration: number
  offset: number
  enabled: boolean
  muted: boolean
}

export interface POVRuntime extends POV {
  metadataReady: boolean
  missing: boolean
}

export type ColumnCount = 2 | 3 | 4 | 5 | 6

export const COLUMN_OPTIONS: readonly ColumnCount[] = [2, 3, 4, 5, 6]

export function isColumnCount(value: number): value is ColumnCount {
  return COLUMN_OPTIONS.some((option) => option === value)
}
