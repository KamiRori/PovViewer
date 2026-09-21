import type { POVRuntime } from '../project/types'
import { selectionSpan } from '../timeline/selection'

const MIN_CLIP_SECONDS = 0.05

export interface ExportClipPlan {
  povId: string
  playerName: string
  sourcePath: string
  selectionId: string
  /** Master-timeline in/out. */
  masterStart: number
  masterEnd: number
  /** Source-media in/out (seconds). */
  videoStart: number
  videoEnd: number
  /** Suggested file name (no directory). */
  outputName: string
}

function sanitizeFilePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return cleaned || 'clip'
}

function formatStamp(seconds: number): string {
  const safe = Math.max(0, seconds)
  const whole = Math.floor(safe)
  const ms = Math.round((safe - whole) * 1000)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const base = `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`
  return ms > 0 ? `${base}.${String(ms).padStart(3, '0')}` : base
}

/**
 * Map master-timeline export ranges onto each POV's media timeline.
 * Skips missing files, unread metadata, and empty/out-of-range clips.
 */
export function planExportClips(povs: readonly POVRuntime[]): ExportClipPlan[] {
  const plans: ExportClipPlan[] = []
  const usedNames = new Set<string>()

  for (const pov of povs) {
    if (pov.missing) continue
    if (!pov.metadataReady || !(pov.duration > 0)) continue
    if (!pov.filePath.trim()) continue

    for (const range of pov.exportRanges) {
      if (selectionSpan(range) < MIN_CLIP_SECONDS) continue
      const videoStart = Math.max(0, range.start - pov.offset)
      const videoEnd = Math.min(pov.duration, range.end - pov.offset)
      if (!(videoEnd - videoStart >= MIN_CLIP_SECONDS)) continue

      const base = `${formatStamp(videoStart)}-${formatStamp(videoEnd)}_${sanitizeFilePart(pov.playerName)}`
      let outputName = `${base}.mp4`
      let suffix = 2
      while (usedNames.has(outputName.toLowerCase())) {
        outputName = `${base}_${suffix}.mp4`
        suffix += 1
      }
      usedNames.add(outputName.toLowerCase())

      plans.push({
        povId: pov.id,
        playerName: pov.playerName,
        sourcePath: pov.filePath,
        selectionId: range.id,
        masterStart: range.start,
        masterEnd: range.end,
        videoStart,
        videoEnd,
        outputName
      })
    }
  }

  return plans
}

export function describeExportPlan(plans: readonly ExportClipPlan[]): string {
  if (plans.length === 0) return '没有可导出的选区'
  const players = new Set(plans.map((plan) => plan.playerName))
  return `${plans.length} 个片段 · ${players.size} 个视角`
}
