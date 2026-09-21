export type PlaybackRate = 0.5 | 1 | 1.5 | 2 | 4

export const PLAYBACK_RATES: readonly PlaybackRate[] = [0.5, 1, 1.5, 2, 4]

/** Drift large enough to need attention (spec). Small drift uses rate nudge, not hard seek. */
export const SYNC_THRESHOLD_SECONDS = 0.05

/** Only rewrite currentTime past this — hard seeks make playback stutter. */
export const HARD_SEEK_THRESHOLD_SECONDS = 0.25

/** With 2+ armed POVs, prefer soft sync longer to avoid one card freezing on hard seek. */
export const MULTI_ARM_HARD_SEEK_THRESHOLD_SECONDS = 0.55

export type PovPlaybackStatus = 'not_started' | 'active' | 'ended' | 'pending'
export type SyncAction = 'none' | 'soft' | 'hard'

export function expectedVideoTime(masterTime: number, offset: number): number {
  return masterTime - offset
}

export function povPlaybackStatus(
  masterTime: number,
  offset: number,
  duration: number,
  metadataReady: boolean
): PovPlaybackStatus {
  if (!metadataReady || !Number.isFinite(duration)) return 'pending'
  const videoTime = expectedVideoTime(masterTime, offset)
  if (videoTime < 0) return 'not_started'
  if (videoTime > duration) return 'ended'
  return 'active'
}

export function needsCorrection(actualTime: number, expectedTime: number): boolean {
  if (!Number.isFinite(actualTime) || !Number.isFinite(expectedTime)) return false
  return Math.abs(actualTime - expectedTime) > SYNC_THRESHOLD_SECONDS
}

export function syncAction(actualTime: number, expectedTime: number): SyncAction {
  if (!Number.isFinite(actualTime) || !Number.isFinite(expectedTime)) return 'none'
  const drift = Math.abs(actualTime - expectedTime)
  if (drift <= SYNC_THRESHOLD_SECONDS) return 'none'
  if (drift <= HARD_SEEK_THRESHOLD_SECONDS) return 'soft'
  return 'hard'
}

/**
 * Nudge playbackRate so a slightly-late video catches up without seeking.
 * drift = expected - actual (positive means the video is behind).
 */
export function softPlaybackRate(baseRate: number, actualTime: number, expectedTime: number): number {
  const drift = expectedTime - actualTime
  const adjust = Math.max(-0.05, Math.min(0.05, drift * 0.35))
  return Math.max(0.25, Math.min(4, baseRate + adjust))
}

export function hardSeekThresholdSeconds(armedCount: number): number {
  return armedCount >= 2 ? MULTI_ARM_HARD_SEEK_THRESHOLD_SECONDS : HARD_SEEK_THRESHOLD_SECONDS
}
