import { useEffect, useState } from 'react'
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
  onRemove,
  onDuration
}: PovCardProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [unplayable, setUnplayable] = useState(false)
  const [draft, setDraft] = useState(pov.playerName)
  const fileName = fileNameFromPath(pov.filePath)
  const status = povPlaybackStatus(masterTime, pov.offset, pov.duration, pov.metadataReady)
  const videoTime = expectedVideoTime(masterTime, pov.offset)

  useEffect(() => {
    setDraft(pov.playerName)
  }, [pov.playerName])

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

  let statusLabel = '—'
  if (unplayable) statusLabel = '无法播放'
  else if (status === 'pending') statusLabel = '读取中'
  else if (status === 'not_started') statusLabel = 'NOT STARTED'
  else if (status === 'ended') statusLabel = 'ENDED'
  else statusLabel = formatDuration(videoTime)

  return (
    <article className="pov-card">
      <div className="pov-frame">
        {unplayable ? (
          <p className="pov-placeholder">无法直接播放</p>
        ) : mediaUrl ? (
          <>
            <VideoSurface
              src={mediaUrl}
              offset={pov.offset}
              duration={pov.duration}
              metadataReady={pov.metadataReady}
              playing={playing}
              playbackRate={playbackRate}
              seekGeneration={seekGeneration}
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
      <button type="button" className="remove" onClick={() => onRemove(pov.id)}>
        移除
      </button>
    </article>
  )
}
