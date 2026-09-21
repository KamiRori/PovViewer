import { useEffect, useState, type MouseEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { usePlaybackArm } from '../player/playbackArm'
import { VideoSurface } from '../player/VideoSurface'
import type { POVRuntime } from '../project/types'
import {
  expectedVideoTime,
  povPlaybackStatus,
  type PlaybackRate
} from '../timeline/playbackMath'
import { formatDuration } from '../utils/formatDuration'
import { fileNameFromPath } from '../utils/playerName'

interface PovCardProps {
  pov: POVRuntime
  masterTime: number
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  onRename: (id: string, playerName: string) => void
  onOffset: (id: string, offset: number) => void
  onRemove: (id: string) => void
  onDuration: (id: string, duration: number) => void
}

export function PovCard({
  pov,
  masterTime,
  playing,
  playbackRate,
  seekGeneration,
  onRename,
  onOffset,
  onRemove,
  onDuration
}: PovCardProps) {
  const { armed, toggle } = usePlaybackArm(pov.id)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [unplayable, setUnplayable] = useState(false)
  const [draft, setDraft] = useState(pov.playerName)
  const [offsetDraft, setOffsetDraft] = useState(String(pov.offset))
  const fileName = fileNameFromPath(pov.filePath)
  const status = povPlaybackStatus(masterTime, pov.offset, pov.duration, pov.metadataReady)
  const videoTime = expectedVideoTime(masterTime, pov.offset)

  useEffect(() => {
    setDraft(pov.playerName)
  }, [pov.playerName])

  useEffect(() => {
    setOffsetDraft(String(pov.offset))
  }, [pov.offset])

  useEffect(() => {
    let cancelled = false
    setUnplayable(false)
    setMediaUrl(null)
    window.povApi
      .toMediaUrl(pov.filePath)
      .then((url) => {
        if (!cancelled) setMediaUrl(url)
      })
      .catch(() => {
        if (!cancelled) setUnplayable(true)
      })
    return () => {
      cancelled = true
    }
  }, [pov.filePath])

  // Grid idle cards must not open a Chromium decoder; pull a cheap JPEG poster instead.
  useEffect(() => {
    let cancelled = false
    const atRaw = expectedVideoTime(masterTime, pov.offset)
    const at =
      pov.duration > 0
        ? Math.min(Math.max(0.5, atRaw), Math.max(0.5, pov.duration - 0.05))
        : Math.max(0.5, atRaw > 0 ? atRaw : 1)
    void window.povApi
      .ensurePoster(pov.filePath, at)
      .then((poster) => {
        if (cancelled) return
        const next = poster.dataUrl || poster.url
        if (poster.status === 'ready' && next) setPosterUrl(next)
        else if (poster.error) console.warn('[poster]', poster.error)
      })
      .catch((error) => {
        console.warn('[poster] ensure failed', pov.filePath, error)
      })
    return () => {
      cancelled = true
    }
    // masterTime is read when seekGeneration changes (scrub/nudge), not every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [pov.filePath, pov.duration, pov.offset, seekGeneration])

  let statusLabel = '—'
  if (unplayable) statusLabel = '无法播放'
  else if (status === 'pending') statusLabel = '读取中'
  else if (status === 'not_started') statusLabel = 'NOT STARTED'
  else if (status === 'ended') statusLabel = 'ENDED'
  else statusLabel = formatDuration(videoTime)

  function commitOffset(): void {
    const next = Number(offsetDraft)
    if (!Number.isFinite(next)) {
      setOffsetDraft(String(pov.offset))
      return
    }
    if (next !== pov.offset) onOffset(pov.id, next)
  }

  function onCardActivate(event: MouseEvent<HTMLElement>): void {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('input, button, select, textarea, label, a')) return
    toggle()
  }

  function onCardKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target as HTMLElement | null
    if (target && target !== event.currentTarget) return
    event.preventDefault()
    toggle()
  }

  return (
    <article
      className={`pov-card${armed ? ' is-armed' : ''}`}
      data-armed={armed ? 'true' : 'false'}
      role="button"
      aria-pressed={armed}
      title={armed ? '点击取消参与（将卸载解码器）' : '点击参与播放（挂载解码器）'}
      tabIndex={0}
      onClick={onCardActivate}
      onKeyDown={onCardKeyDown}
    >
      <div className="pov-frame">
        {unplayable ? (
          <p className="pov-placeholder">无法直接播放</p>
        ) : mediaUrl ? (
          <>
            <VideoSurface
              povId={pov.id}
              src={mediaUrl}
              offset={pov.offset}
              duration={pov.duration}
              metadataReady={pov.metadataReady}
              playing={playing}
              playbackRate={playbackRate}
              seekGeneration={seekGeneration}
              armed={armed}
              posterUrl={posterUrl}
              onDuration={(nextDuration) => onDuration(pov.id, nextDuration)}
              onError={() => setUnplayable(true)}
            />
            {status === 'not_started' || status === 'ended' ? (
              <p className="pov-overlay">{status === 'not_started' ? 'NOT STARTED' : 'ENDED'}</p>
            ) : null}
          </>
        ) : (
          <p className="pov-placeholder">正在读取</p>
        )}
      </div>
      <label className="pov-name">
        <span className="visually-hidden">玩家名称</span>
        <input
          className="name-input"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = draft.trim()
            if (!next) {
              setDraft(pov.playerName)
              return
            }
            onRename(pov.id, next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </label>
      <div className="pov-meta">
        <span className="file-name" title={pov.filePath}>
          {fileName}
        </span>
        <span className="pov-status">{statusLabel}</span>
      </div>
      <label className="offset-row">
        <span>offset</span>
        <input
          className="offset-input"
          value={offsetDraft}
          inputMode="decimal"
          spellCheck={false}
          onChange={(event) => setOffsetDraft(event.target.value)}
          onBlur={commitOffset}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span>s</span>
      </label>
      <button type="button" className="remove" onClick={() => onRemove(pov.id)}>
        移除
      </button>
    </article>
  )
}
