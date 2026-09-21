import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent
} from 'react'
import { shouldMutePov } from '../player/audioPolicy'
import { usePlaybackArm } from '../player/playbackArm'
import { VideoSurface } from '../player/VideoSurface'
import { useViewUi } from '../player/viewUi'
import type { PlaybackSource, POVRuntime } from '../project/types'
import {
  expectedVideoTime,
  povPlaybackStatus,
  type PlaybackRate
} from '../timeline/playbackMath'
import { formatDuration } from '../utils/formatDuration'
import { fileNameFromPath } from '../utils/playerName'

const CLICK_DELAY_MS = 220

interface PovCardProps {
  pov: POVRuntime
  masterTime: number
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  proxyEpoch?: number
  variant?: 'grid' | 'focus-main' | 'focus-rail'
  onRename: (id: string, playerName: string) => void
  onOffset: (id: string, offset: number) => void
  onPlaybackSource: (id: string, playbackSource: PlaybackSource) => void
  onRemove: (id: string) => void
  onDuration: (id: string, duration: number) => void
  onSoloAudio: (id: string) => void
  onLocate: (id: string) => void
}

async function resolveOriginalUrl(filePath: string): Promise<string> {
  return window.povApi.toMediaUrl(filePath)
}

async function resolveProxyUrl(filePath: string): Promise<string | null> {
  const cached = await window.povApi.getPreviewProxyStatus(filePath)
  if (cached?.status === 'ready' && cached.proxyPath) {
    return window.povApi.toMediaUrl(cached.proxyPath)
  }
  return null
}

export function PovCard({
  pov,
  masterTime,
  playing,
  playbackRate,
  seekGeneration,
  proxyEpoch = 0,
  variant = 'grid',
  onRename,
  onOffset,
  onPlaybackSource,
  onRemove,
  onDuration,
  onSoloAudio,
  onLocate
}: PovCardProps) {
  const view = useViewUi()
  const { armed, setArmed } = usePlaybackArm(pov.id)
  const hostRef = useRef<HTMLElement>(null)
  const clickTimerRef = useRef(0)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const mediaUrlRef = useRef<string | null>(null)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [unplayable, setUnplayable] = useState(false)
  const [proxyMissing, setProxyMissing] = useState(false)
  const [draft, setDraft] = useState(pov.playerName)
  const [offsetDraft, setOffsetDraft] = useState(String(pov.offset))
  const fileName = fileNameFromPath(pov.filePath)
  const status = povPlaybackStatus(masterTime, pov.offset, pov.duration, pov.metadataReady)
  const videoTime = expectedVideoTime(masterTime, pov.offset)
  const effectiveArmed = variant === 'focus-main' || variant === 'focus-rail' ? true : armed
  const muted = shouldMutePov({
    mode: view.mode,
    povId: pov.id,
    focusId: view.focusId,
    soloId: view.soloId
  })

  useEffect(() => {
    setDraft(pov.playerName)
  }, [pov.playerName])

  useEffect(() => {
    setOffsetDraft(String(pov.offset))
  }, [pov.offset])

  useEffect(() => {
    mediaUrlRef.current = mediaUrl
  }, [mediaUrl])

  useEffect(() => {
    if (pov.missing) {
      setMediaUrl(null)
      setProxyMissing(false)
      return
    }
    let cancelled = false
    setUnplayable(false)
    setProxyMissing(false)
    setMediaUrl(null)

    async function resolveSrc(): Promise<void> {
      try {
        if (pov.playbackSource === 'proxy') {
          const proxyUrl = await resolveProxyUrl(pov.filePath)
          if (cancelled) return
          if (proxyUrl) {
            setUnplayable(false)
            setProxyMissing(false)
            setMediaUrl(proxyUrl)
            return
          }
          setProxyMissing(true)
          setMediaUrl(null)
          return
        }

        const original = await resolveOriginalUrl(pov.filePath)
        if (!cancelled) {
          setProxyMissing(false)
          setMediaUrl(original)
        }
      } catch {
        if (cancelled) return
        // Preferred source failed: try the other one once.
        try {
          if (pov.playbackSource === 'original') {
            const proxyUrl = await resolveProxyUrl(pov.filePath)
            if (cancelled) return
            if (proxyUrl) {
              setUnplayable(false)
              setProxyMissing(false)
              setMediaUrl(proxyUrl)
              return
            }
          } else {
            const original = await resolveOriginalUrl(pov.filePath)
            if (!cancelled) {
              setProxyMissing(false)
              setMediaUrl(original)
              return
            }
          }
        } catch {
          // fall through
        }
        if (!cancelled) setUnplayable(true)
      }
    }

    void resolveSrc()
    return () => {
      cancelled = true
    }
  }, [pov.filePath, pov.missing, pov.playbackSource, proxyEpoch])

  // Idle grid / rail: one cheap JPEG poster per file (fixed t≈1s). Do not refresh on scrub.
  useEffect(() => {
    if (pov.missing) {
      setPosterUrl(null)
      return
    }
    let cancelled = false
    void window.povApi
      .ensurePoster(pov.filePath, 1)
      .then((poster) => {
        if (cancelled) return
        const next = poster.dataUrl || poster.url
        if (poster.status === 'ready' && next) setPosterUrl(next)
      })
      .catch((error) => {
        console.warn('[poster] ensure failed', pov.filePath, error)
      })
    return () => {
      cancelled = true
    }
  }, [pov.filePath, pov.missing])

  useEffect(() => {
    if (variant !== 'focus-main') return
    setArmed(true)
  }, [variant, setArmed])

  useEffect(() => {
    return () => window.clearTimeout(clickTimerRef.current)
  }, [])

  let statusLabel = '—'
  if (pov.missing) statusLabel = '文件缺失'
  else if (proxyMissing) statusLabel = '代理未生成'
  else if (unplayable) statusLabel = '无法播放'
  else if (status === 'pending') statusLabel = '读取中'
  else if (status === 'not_started') statusLabel = '未开始'
  else if (status === 'ended') statusLabel = '已结束'
  else statusLabel = formatDuration(videoTime)

  function commitOffset(): void {
    const next = Number(offsetDraft)
    if (!Number.isFinite(next)) {
      setOffsetDraft(String(pov.offset))
      return
    }
    if (next !== pov.offset) onOffset(pov.id, next)
  }

  function onCardClick(event: MouseEvent<HTMLElement>): void {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('input, button, select, textarea, label, a')) return

    if (variant === 'focus-rail') {
      view.enterFocus(pov.id)
      return
    }
    if (variant !== 'grid') return

    window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      // Highlight + join in one click; click again on the same card to leave.
      if (view.activeId === pov.id && armed) {
        setArmed(false)
        view.setActiveId(null)
        return
      }
      view.setActiveId(pov.id)
      setArmed(true)
    }, CLICK_DELAY_MS)
  }

  function onCardDoubleClick(event: MouseEvent<HTMLElement>): void {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('input, button, select, textarea, label, a')) return
    event.preventDefault()
    window.clearTimeout(clickTimerRef.current)
    view.setActiveId(pov.id)
    view.enterFocus(pov.id)
  }

  function onCardKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement | null
      if (target && target !== event.currentTarget) return
      event.preventDefault()
      view.enterFocus(pov.id)
      return
    }
    if (event.key === ' ' && variant === 'grid') {
      const target = event.target as HTMLElement | null
      if (target && target !== event.currentTarget) return
      event.preventDefault()
      event.stopPropagation()
      if (view.activeId === pov.id && armed) {
        setArmed(false)
        view.setActiveId(null)
        return
      }
      view.setActiveId(pov.id)
      setArmed(true)
    }
  }

  async function requestFullscreen(): Promise<void> {
    const node = hostRef.current
    if (!node) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await node.requestFullscreen()
    } catch {
      // fullscreen may be blocked
    }
  }

  const className = [
    'pov-card',
    effectiveArmed ? 'is-armed' : '',
    view.activeId === pov.id ? 'is-highlighted' : '',
    variant === 'focus-main' ? 'is-focus-main' : '',
    variant === 'focus-rail' ? 'is-focus-rail' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      ref={hostRef}
      className={className}
      data-armed={effectiveArmed ? 'true' : 'false'}
      data-highlighted={view.activeId === pov.id ? 'true' : 'false'}
      role="button"
      aria-pressed={effectiveArmed}
      title="单击高亮并参与 · 再点取消 · 双击进入焦点"
      tabIndex={0}
      onClick={onCardClick}
      onDoubleClick={onCardDoubleClick}
      onKeyDown={onCardKeyDown}
    >
      <div className="pov-frame">
        {pov.missing ? (
          <div className="pov-missing">
            <p className="pov-missing-title">文件缺失</p>
            <p className="pov-missing-name" title={pov.filePath}>
              {fileName}
            </p>
            <button type="button" onClick={() => onLocate(pov.id)}>
              定位文件
            </button>
          </div>
        ) : proxyMissing ? (
          <p className="pov-placeholder">代理未生成</p>
        ) : unplayable ? (
          <p className="pov-placeholder">无法播放</p>
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
              armed={effectiveArmed}
              muted={muted}
              variant={variant}
              posterUrl={posterUrl}
              onDuration={(nextDuration) => onDuration(pov.id, nextDuration)}
              onError={() => {
                void (async () => {
                  try {
                    if (pov.playbackSource === 'proxy') {
                      // Already on proxy — do not loop.
                      setUnplayable(true)
                      return
                    }
                    const proxyUrl = await resolveProxyUrl(pov.filePath)
                    if (proxyUrl && proxyUrl !== mediaUrlRef.current) {
                      setUnplayable(false)
                      setMediaUrl(proxyUrl)
                      return
                    }
                  } catch {
                    // fall through
                  }
                  setUnplayable(true)
                })()
              }}
            />
            {status === 'not_started' || status === 'ended' ? (
              <p className="pov-overlay">{status === 'not_started' ? '未开始' : '已结束'}</p>
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
      <div className="pov-controls">
        <div className="source-toggle" role="group" aria-label="片源">
          <button
            type="button"
            className={pov.playbackSource === 'proxy' ? 'is-active' : undefined}
            aria-pressed={pov.playbackSource === 'proxy'}
            title="代理预览"
            onClick={(event) => {
              event.stopPropagation()
              onPlaybackSource(pov.id, 'proxy')
            }}
          >
            代理
          </button>
          <button
            type="button"
            className={pov.playbackSource === 'original' ? 'is-active' : undefined}
            aria-pressed={pov.playbackSource === 'original'}
            title="原片"
            onClick={(event) => {
              event.stopPropagation()
              onPlaybackSource(pov.id, 'original')
            }}
          >
            原片
          </button>
        </div>
        <label className="offset-row">
          <span>偏移</span>
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
      </div>
      <div className="pov-actions">
        <button
          type="button"
          className={!muted ? 'audio is-on' : 'audio'}
          title={!muted ? '正在出声' : '设为唯一出声'}
          aria-pressed={!muted}
          onClick={() => {
            view.setActiveId(pov.id)
            if (view.mode === 'focus') {
              view.enterFocus(pov.id)
              return
            }
            if (view.soloId === pov.id) {
              view.setSolo(null)
            } else {
              view.setSolo(pov.id)
              onSoloAudio(pov.id)
            }
          }}
        >
          {!muted ? '🔊' : '🔇'}
        </button>
        {variant === 'focus-main' ? (
          <button type="button" onClick={() => void requestFullscreen()} title="全屏 (F)">
            全屏
          </button>
        ) : null}
        <button
          type="button"
          className="remove"
          onClick={() => {
            const ok = window.confirm(`确定移除「${pov.playerName}」？\n移除后可重新导入该文件。`)
            if (ok) onRemove(pov.id)
          }}
        >
          移除
        </button>
      </div>
    </article>
  )
}
