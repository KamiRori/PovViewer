import { memo, useEffect, useRef } from 'react'
import {
  expectedVideoTime,
  HARD_SEEK_THRESHOLD_SECONDS,
  povPlaybackStatus,
  softPlaybackRate,
  syncAction,
  type PlaybackRate
} from '../timeline/playbackMath'
import { useMasterTimeRef } from '../timeline/store'

/** After a verified hard seek, avoid another hard seek briefly. */
const HARD_SEEK_COOLDOWN_MS = 800
/** After rate changes / hard seeks, play at the exact base rate before soft-nudging again. */
const SOFT_SYNC_SUPPRESS_MS = 1200
/** Seek counts as landed when within this many seconds of the target. */
const SEEK_VERIFY_SECONDS = 0.35

interface VideoSurfaceProps {
  src: string
  offset: number
  duration: number
  metadataReady: boolean
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  onDuration: (duration: number) => void
  onError: () => void
}

function VideoSurfaceImpl({
  src,
  offset,
  duration,
  metadataReady,
  playing,
  playbackRate,
  seekGeneration,
  onDuration,
  onError
}: VideoSurfaceProps) {
  const masterTimeRef = useMasterTimeRef()
  const videoRef = useRef<HTMLVideoElement>(null)
  const offsetRef = useRef(offset)
  const durationRef = useRef(duration)
  const metadataReadyRef = useRef(metadataReady)
  const playingRef = useRef(playing)
  const baseRateRef = useRef(playbackRate)
  const onDurationRef = useRef(onDuration)
  const onErrorRef = useRef(onError)
  const seekingRef = useRef(false)
  const seekTokenRef = useRef(0)
  const hardSeekCooldownUntilRef = useRef(0)
  const softSyncSuppressUntilRef = useRef(0)
  const playRequestRef = useRef<Promise<void> | null>(null)
  offsetRef.current = offset
  durationRef.current = duration
  metadataReadyRef.current = metadataReady
  playingRef.current = playing
  baseRateRef.current = playbackRate
  onDurationRef.current = onDuration
  onErrorRef.current = onError

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const status = povPlaybackStatus(
      masterTimeRef.current,
      offsetRef.current,
      durationRef.current,
      metadataReadyRef.current
    )
    if (status !== 'active') {
      seekingRef.current = false
      video.pause()
      return
    }

    const expected = Math.max(0, expectedVideoTime(masterTimeRef.current, offsetRef.current))
    softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
    video.pause()
    video.playbackRate = baseRateRef.current
    void seekAndVerify(video, expected, seekingRef, seekTokenRef, hardSeekCooldownUntilRef).then((ok) => {
      if (!ok) return
      video.playbackRate = baseRateRef.current
      softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
      if (playingRef.current) requestPlay(video, playRequestRef)
    })
  }, [seekGeneration, masterTimeRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
    if (!seekingRef.current) video.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!playing) {
      video.pause()
      playRequestRef.current = null
      video.playbackRate = baseRateRef.current
      return
    }

    let frame = 0
    const tick = () => {
      const status = povPlaybackStatus(
        masterTimeRef.current,
        offsetRef.current,
        durationRef.current,
        metadataReadyRef.current
      )

      if (status !== 'active') {
        if (!video.paused) video.pause()
      } else if (seekingRef.current || video.seeking) {
        if (!video.paused) video.pause()
      } else {
        const expected = Math.max(0, expectedVideoTime(masterTimeRef.current, offsetRef.current))
        const drift = Math.abs(video.currentTime - expected)
        const action = syncAction(video.currentTime, expected)
        const now = performance.now()
        const softAllowed = now >= softSyncSuppressUntilRef.current

        if (drift > HARD_SEEK_THRESHOLD_SECONDS) {
          if (!video.paused) video.pause()
          if (now >= hardSeekCooldownUntilRef.current) {
            softSyncSuppressUntilRef.current = now + SOFT_SYNC_SUPPRESS_MS
            void seekAndVerify(video, expected, seekingRef, seekTokenRef, hardSeekCooldownUntilRef).then(
              (ok) => {
                if (!ok || !playingRef.current) return
                video.playbackRate = baseRateRef.current
                softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
                requestPlay(video, playRequestRef)
              }
            )
          } else {
            // Wait out the cooldown at the exact base rate instead of soft-fighting the drift.
            if (video.playbackRate !== baseRateRef.current) {
              video.playbackRate = baseRateRef.current
            }
          }
        } else if (softAllowed && action === 'soft') {
          video.playbackRate = softPlaybackRate(baseRateRef.current, video.currentTime, expected)
          requestPlay(video, playRequestRef)
        } else {
          if (video.playbackRate !== baseRateRef.current) {
            video.playbackRate = baseRateRef.current
          }
          requestPlay(video, playRequestRef)
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      video.pause()
      playRequestRef.current = null
    }
  }, [playing, masterTimeRef])

  return (
    <video
      ref={videoRef}
      className="video-surface"
      src={src}
      muted
      playsInline
      preload="auto"
      tabIndex={-1}
      disablePictureInPicture
      onLoadedMetadata={(event) => {
        const nextDuration = event.currentTarget.duration
        if (Number.isFinite(nextDuration)) onDurationRef.current(nextDuration)
        const expected = expectedVideoTime(masterTimeRef.current, offsetRef.current)
        if (expected >= 0 && expected <= nextDuration) {
          void seekAndVerify(
            event.currentTarget,
            expected,
            seekingRef,
            seekTokenRef,
            hardSeekCooldownUntilRef
          )
        }
      }}
      onError={() => onErrorRef.current()}
    />
  )
}

function requestPlay(
  video: HTMLVideoElement,
  playRequestRef: { current: Promise<void> | null }
): void {
  if (!video.paused || playRequestRef.current) return
  const request = video
    .play()
    .catch(() => undefined)
    .finally(() => {
      if (playRequestRef.current === request) playRequestRef.current = null
    })
  playRequestRef.current = request
}

function seekAndVerify(
  video: HTMLVideoElement,
  target: number,
  seekingRef: { current: boolean },
  seekTokenRef: { current: number },
  hardSeekCooldownUntilRef: { current: number }
): Promise<boolean> {
  const clamped = Math.max(0, target)
  if (!Number.isFinite(clamped)) return Promise.resolve(false)

  if (Math.abs(video.currentTime - clamped) <= SEEK_VERIFY_SECONDS && !video.seeking) {
    seekingRef.current = false
    return Promise.resolve(true)
  }

  const token = ++seekTokenRef.current
  seekingRef.current = true

  return new Promise((resolve) => {
    let finished = false
    let attempts = 0

    const finish = (ok: boolean) => {
      if (finished) return
      finished = true
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      window.clearTimeout(timeout)
      if (seekTokenRef.current === token) {
        seekingRef.current = false
        if (ok) hardSeekCooldownUntilRef.current = performance.now() + HARD_SEEK_COOLDOWN_MS
      }
      resolve(ok)
    }

    const landed = (): boolean => Math.abs(video.currentTime - clamped) <= SEEK_VERIFY_SECONDS

    const onSeeked = () => {
      if (seekTokenRef.current !== token) return
      if (landed()) {
        finish(true)
        return
      }
      if (attempts < 2) {
        attempts += 1
        try {
          video.currentTime = clamped
        } catch {
          finish(false)
        }
        return
      }
      finish(false)
    }

    const onError = () => finish(false)
    const timeout = window.setTimeout(() => {
      if (seekTokenRef.current !== token) return
      finish(landed())
    }, 1200)

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = clamped
    } catch {
      finish(false)
    }
  })
}

export const VideoSurface = memo(VideoSurfaceImpl, (prev, next) => {
  return (
    prev.src === next.src &&
    prev.offset === next.offset &&
    prev.duration === next.duration &&
    prev.metadataReady === next.metadataReady &&
    prev.playing === next.playing &&
    prev.playbackRate === next.playbackRate &&
    prev.seekGeneration === next.seekGeneration
  )
})
