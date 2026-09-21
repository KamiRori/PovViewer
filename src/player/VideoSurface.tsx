import { memo, useEffect, useRef, useState } from 'react'
import {
  expectedVideoTime,
  hardSeekThresholdSeconds,
  povPlaybackStatus,
  softPlaybackRate,
  syncAction,
  type PlaybackRate
} from '../timeline/playbackMath'
import { useMasterTimeRef } from '../timeline/store'
import { useArmedCount } from './playbackArm'
import { recordContinuousPlay, recordHardSeek, recordSampleSeek } from './perfCounters'
import { usePreviewQuality } from './previewQuality'
import {
  releaseHardSeek,
  releaseSampleSeek,
  tryAcquireHardSeek,
  tryAcquireSampleSeek
} from './seekGate'

const HARD_SEEK_COOLDOWN_MS = 1400
const SOFT_SYNC_SUPPRESS_MS = 1800
const SEEK_VERIFY_SECONDS = 0.4
const SAMPLE_SEEK_EPSILON = 0.1
/** Cap still-frame canvas so idle cards stay cheap to composite. */
const STILL_MAX_EDGE = 480

interface VideoSurfaceProps {
  povId: string
  src: string
  offset: number
  duration: number
  metadataReady: boolean
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  /** When false, release the decoder and show a still frame only. */
  armed: boolean
  /** Low-res JPEG from main process for idle grid cards. */
  posterUrl?: string | null
  onDuration: (duration: number) => void
  onError: () => void
}

function VideoSurfaceImpl({
  povId,
  src,
  offset,
  duration,
  metadataReady,
  playing,
  playbackRate,
  seekGeneration,
  armed,
  posterUrl = null,
  onDuration,
  onError
}: VideoSurfaceProps) {
  const masterTimeRef = useMasterTimeRef()
  const { settings } = usePreviewQuality()
  const armedCount = useArmedCount()
  const hostRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stillRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(true)
  const [hasStill, setHasStill] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  /** Briefly re-attach while paused so nudge / scrub-commit can refresh the still frame. */
  const [pausedSeekAttach, setPausedSeekAttach] = useState(false)
  const offsetRef = useRef(offset)
  const durationRef = useRef(duration)
  const metadataReadyRef = useRef(metadataReady)
  const playingRef = useRef(playing)
  const baseRateRef = useRef(playbackRate)
  const onDurationRef = useRef(onDuration)
  const onErrorRef = useRef(onError)
  const armedRef = useRef(armed)
  const seekingRef = useRef(false)
  const seekTokenRef = useRef(0)
  const hardSeekCooldownUntilRef = useRef(0)
  const softSyncSuppressUntilRef = useRef(0)
  const playRequestRef = useRef<Promise<void> | null>(null)
  const liveRef = useRef(false)
  const probedSrcRef = useRef<string | null>(null)
  const lastSeekGenerationRef = useRef(seekGeneration)
  offsetRef.current = offset
  durationRef.current = duration
  metadataReadyRef.current = metadataReady
  playingRef.current = playing
  baseRateRef.current = playbackRate
  onDurationRef.current = onDuration
  onErrorRef.current = onError
  armedRef.current = armed

  const sampled = settings.playbackMode === 'sampled'
  /**
   * Idle (paused) must not keep HTML5 decoders warm — that alone can pin high CPU
   * even with video.pause(). Only attach while playing, or briefly after a paused seek.
   */
  const attachMedia = armed && visible && (playing || pausedSeekAttach)
  const live = attachMedia && !sampled && playing
  liveRef.current = live

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setVisible(Boolean(entry?.isIntersecting))
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.05 }
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Pause → drop decoder immediately. Paused seeks briefly re-attach, then drop again.
  useEffect(() => {
    if (playing) {
      setPausedSeekAttach(false)
      lastSeekGenerationRef.current = seekGeneration
      return
    }
    if (!armed || !visible) {
      setPausedSeekAttach(false)
      lastSeekGenerationRef.current = seekGeneration
      return
    }
    if (seekGeneration === lastSeekGenerationRef.current) return
    lastSeekGenerationRef.current = seekGeneration
    setPausedSeekAttach(true)
    const timer = window.setTimeout(() => setPausedSeekAttach(false), 2000)
    return () => window.clearTimeout(timer)
  }, [playing, armed, visible, seekGeneration])

  // Attach / release the media element. Idle cards must not keep HW decoders warm.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!attachMedia) {
      captureStill(video, stillRef.current, () => setHasStill(true))
      releaseMedia(video)
      setMediaReady(false)
      playRequestRef.current = null
      seekingRef.current = false
      return
    }

    if (video.dataset.mediaSrc !== src) {
      video.dataset.mediaSrc = src
      video.src = src
      // Prefer metadata while doing a paused still refresh; auto only for live play.
      video.preload = playing ? 'auto' : 'metadata'
      video.load()
      setMediaReady(false)
    }
  }, [attachMedia, src, playing])

  // Duration comes from main-process probe on import (mp4 moov / ffmpeg).
  // Do not open Chromium demuxers here — that fights disk IO on multi‑GB POV files
  // and is why cards stayed on 读取中. Playing still reports duration via onLoadedMetadata.
  useEffect(() => {
    if (metadataReady) probedSrcRef.current = src
  }, [metadataReady, src])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !attachMedia || !mediaReady) return

    const nextStatus = povPlaybackStatus(
      masterTimeRef.current,
      offsetRef.current,
      durationRef.current,
      metadataReadyRef.current
    )
    if (nextStatus !== 'active') {
      seekingRef.current = false
      video.pause()
      return
    }

    const expected = Math.max(0, expectedVideoTime(masterTimeRef.current, offsetRef.current))
    softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
    video.pause()
    video.playbackRate = baseRateRef.current
    void seekAndVerify(video, expected, seekingRef, seekTokenRef, hardSeekCooldownUntilRef).then((ok) => {
      if (!ok || !armedRef.current) {
        if (!playingRef.current) setPausedSeekAttach(false)
        return
      }
      video.playbackRate = baseRateRef.current
      softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
      captureStill(video, stillRef.current, () => setHasStill(true))
      if (!sampled && playingRef.current && liveRef.current) requestPlay(video, playRequestRef)
      // Paused seek only needed the still — drop the decoder again.
      if (!playingRef.current) setPausedSeekAttach(false)
    })
  }, [seekGeneration, attachMedia, mediaReady, masterTimeRef, sampled])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !attachMedia) return
    softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
    if (!seekingRef.current) video.playbackRate = playbackRate
  }, [playbackRate, attachMedia])

  useEffect(() => {
    if (!sampled || !attachMedia) return
    const video = videoRef.current
    if (!video || !mediaReady) return

    video.pause()
    playRequestRef.current = null

    if (!playing) return

    let closed = false
    let timer = 0
    let safetyTimer = 0
    const interval = 1000 / Math.max(3, settings.maxFps)
    const stagger = Math.abs(hashString(povId)) % Math.max(1, Math.floor(interval))

    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(run, delay)
    }

    const run = () => {
      if (closed) return
      const nextStatus = povPlaybackStatus(
        masterTimeRef.current,
        offsetRef.current,
        durationRef.current,
        metadataReadyRef.current
      )
      if (nextStatus !== 'active' || seekingRef.current || video.seeking) {
        schedule(interval)
        return
      }

      const expected = Math.max(0, expectedVideoTime(masterTimeRef.current, offsetRef.current))
      if (Math.abs(video.currentTime - expected) <= SAMPLE_SEEK_EPSILON) {
        schedule(interval)
        return
      }

      if (!tryAcquireSampleSeek(povId)) {
        schedule(Math.max(40, interval / 2))
        return
      }

      let released = false
      const release = () => {
        if (released) return
        released = true
        window.clearTimeout(safetyTimer)
        releaseSampleSeek(povId)
      }

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        release()
        recordSampleSeek()
        if (!closed) schedule(interval)
      }
      const onError = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        release()
        if (!closed) schedule(interval)
      }

      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      try {
        video.currentTime = expected
      } catch {
        release()
        schedule(interval)
        return
      }
      safetyTimer = window.setTimeout(() => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        release()
        if (!closed) schedule(interval)
      }, 900)
    }

    schedule(stagger)
    return () => {
      closed = true
      window.clearTimeout(timer)
      window.clearTimeout(safetyTimer)
      releaseSampleSeek(povId)
      video.pause()
    }
  }, [sampled, settings.maxFps, playing, attachMedia, mediaReady, masterTimeRef, povId])

  useEffect(() => {
    if (sampled || !attachMedia) return
    const video = videoRef.current
    if (!video || !mediaReady) return
    if (!playing || !live) {
      video.pause()
      playRequestRef.current = null
      return
    }
    if (seekingRef.current || video.seeking) return
    requestPlay(video, playRequestRef)
  }, [sampled, playing, live, attachMedia, mediaReady])

  useEffect(() => {
    if (sampled || !attachMedia) return
    const video = videoRef.current
    if (!video || !mediaReady) return

    if (!playing || !live) {
      video.pause()
      playRequestRef.current = null
      video.playbackRate = baseRateRef.current
      return
    }

    let frame = 0
    let lastSoftCheck = 0
    const hardThreshold = hardSeekThresholdSeconds(armedCount)
    const tick = (stamp: number) => {
      const nextStatus = povPlaybackStatus(
        masterTimeRef.current,
        offsetRef.current,
        durationRef.current,
        metadataReadyRef.current
      )

      if (nextStatus !== 'active') {
        if (!video.paused) video.pause()
      } else if (seekingRef.current || video.seeking) {
        if (!video.paused) video.pause()
      } else {
        const expected = Math.max(0, expectedVideoTime(masterTimeRef.current, offsetRef.current))
        const drift = Math.abs(video.currentTime - expected)
        const now = performance.now()

        if (drift > hardThreshold) {
          const canHardSeek =
            now >= hardSeekCooldownUntilRef.current && tryAcquireHardSeek(povId)
          if (canHardSeek) {
            softSyncSuppressUntilRef.current = now + SOFT_SYNC_SUPPRESS_MS
            void seekAndVerify(video, expected, seekingRef, seekTokenRef, hardSeekCooldownUntilRef)
              .then((ok) => {
                releaseHardSeek(povId)
                if (!ok || !playingRef.current || !armedRef.current) return
                video.playbackRate = baseRateRef.current
                softSyncSuppressUntilRef.current = performance.now() + SOFT_SYNC_SUPPRESS_MS
                requestPlay(video, playRequestRef)
              })
              .catch(() => {
                releaseHardSeek(povId)
              })
          } else {
            // Another card is seeking, or we are in cooldown: keep playing.
            // Pausing here was the main cause of "one smooth, one stuck".
            if (video.playbackRate !== baseRateRef.current) {
              video.playbackRate = baseRateRef.current
            }
            requestPlay(video, playRequestRef)
          }
        } else if (stamp - lastSoftCheck > 300) {
          lastSoftCheck = stamp
          const action = syncAction(video.currentTime, expected)
          const softAllowed = now >= softSyncSuppressUntilRef.current
          if (softAllowed && action === 'soft') {
            video.playbackRate = softPlaybackRate(baseRateRef.current, video.currentTime, expected)
          } else if (video.playbackRate !== baseRateRef.current) {
            video.playbackRate = baseRateRef.current
          }
          requestPlay(video, playRequestRef)
        } else {
          requestPlay(video, playRequestRef)
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      releaseHardSeek(povId)
      video.pause()
      playRequestRef.current = null
    }
  }, [sampled, playing, live, attachMedia, mediaReady, masterTimeRef, armedCount, povId])

  return (
    <div ref={hostRef} className="video-host">
      <video
        ref={videoRef}
        className={attachMedia ? 'video-surface' : 'video-surface video-surface-detached'}
        muted
        playsInline
        preload="none"
        tabIndex={-1}
        disablePictureInPicture
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration
          if (Number.isFinite(nextDuration)) onDurationRef.current(nextDuration)
          probedSrcRef.current = src
          setMediaReady(true)
        }}
        onLoadedData={(event) => {
          captureStill(event.currentTarget, stillRef.current, () => setHasStill(true))
          setMediaReady(true)
        }}
        onError={() => onErrorRef.current()}
      />
      {!attachMedia && posterUrl && !hasStill ? (
        <img className="video-still video-poster" src={posterUrl} alt="" draggable={false} />
      ) : null}
      <canvas
        ref={stillRef}
        className={`video-still${attachMedia || (!hasStill && posterUrl) ? ' video-still-hidden' : ''}${hasStill ? '' : ' is-empty'}`}
        aria-hidden={attachMedia}
      />
      {!attachMedia ? (
        <p className="decode-badge">
          {armed && !playing ? '暂停·静止帧' : hasStill || posterUrl ? '预览帧' : '等待预览…'}
        </p>
      ) : null}
      {sampled && attachMedia && playing ? (
        <p className="decode-badge decode-badge-quality">{settings.maxFps}fps 采样</p>
      ) : null}
    </div>
  )
}

function releaseMedia(video: HTMLVideoElement): void {
  video.pause()
  if (!video.getAttribute('src') && !video.dataset.mediaSrc) return
  video.removeAttribute('src')
  delete video.dataset.mediaSrc
  video.load()
}

function captureStill(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null,
  onPainted?: () => void
): void {
  if (!canvas || video.readyState < 2) return
  const width = video.videoWidth || 0
  const height = video.videoHeight || 0
  if (width <= 0 || height <= 0) return
  const longest = Math.max(width, height)
  const scale = longest > STILL_MAX_EDGE ? STILL_MAX_EDGE / longest : 1
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }
  const context = canvas.getContext('2d')
  if (!context) return
  try {
    context.drawImage(video, 0, 0, targetW, targetH)
    onPainted?.()
  } catch {
    // decode not ready / tainted — ignore
  }
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return hash
}

function requestPlay(
  video: HTMLVideoElement,
  playRequestRef: { current: Promise<void> | null }
): void {
  if (!video.paused || playRequestRef.current) return
  const request = video
    .play()
    .then(() => {
      recordContinuousPlay()
    })
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
        if (ok) {
          hardSeekCooldownUntilRef.current = performance.now() + HARD_SEEK_COOLDOWN_MS
          recordHardSeek()
        }
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
    prev.povId === next.povId &&
    prev.src === next.src &&
    prev.offset === next.offset &&
    prev.duration === next.duration &&
    prev.metadataReady === next.metadataReady &&
    prev.playing === next.playing &&
    prev.playbackRate === next.playbackRate &&
    prev.seekGeneration === next.seekGeneration &&
    prev.armed === next.armed &&
    prev.posterUrl === next.posterUrl
  )
})
