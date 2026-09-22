import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useArmedCount } from '../player/playbackArm'
import {
  LIVE_DECODER_OPTIONS,
  useDecodeBudget,
  useLiveDecodeStats
} from '../player/decodeBudget'
import { useViewUi } from '../player/viewUi'
import { type PreviewQualityPreset, usePreviewQuality } from '../player/previewQuality'
import { matchesPovQuery } from '../project/markerColor'
import type { POVRuntime } from '../project/types'
import { PLAYBACK_RATES, type PlaybackRate } from '../timeline/playbackMath'
import { formatMasterTime } from '../timeline/timeFormat'
import type { TimelineRange } from '../timeline/range'
import type { TimelineSelection } from '../timeline/selection'
import {
  clampViewport,
  fullViewport,
  panViewport,
  type TimelineViewport,
  viewportToRange,
  viewportsEqual
} from '../timeline/viewport'
import { TimelineTracks } from './TimelineTracks'

const PANEL_HEIGHT_KEY = 'pov-viewer.timeline-panel-height'
const PANEL_HEIGHT_MIN = 180
const PANEL_HEIGHT_DEFAULT = 280

function maxPanelHeight(): number {
  if (typeof window === 'undefined') return 640
  return Math.max(PANEL_HEIGHT_MIN, Math.floor(window.innerHeight * 0.72))
}

function clampPanelHeight(value: number): number {
  return Math.min(maxPanelHeight(), Math.max(PANEL_HEIGHT_MIN, Math.round(value)))
}

function readStoredPanelHeight(): number {
  try {
    const raw = window.localStorage.getItem(PANEL_HEIGHT_KEY)
    if (!raw) return PANEL_HEIGHT_DEFAULT
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return PANEL_HEIGHT_DEFAULT
    return clampPanelHeight(parsed)
  } catch {
    return PANEL_HEIGHT_DEFAULT
  }
}

interface TimelineBarProps {
  povs: readonly POVRuntime[]
  masterTime: number
  range: TimelineRange
  playing: boolean
  playbackRate: PlaybackRate
  disabled: boolean
  onToggle: () => void
  onNudge: (delta: number) => void
  onScrub: (time: number) => void
  onCommitScrub: () => void
  onRate: (rate: PlaybackRate) => void
  onResync: () => void
  onAddExportRange: (id: string, range: TimelineSelection) => void
  onUpdateExportRange: (id: string, selectionId: string, range: TimelineSelection) => void
  onRemoveExportRange: (id: string, selectionId: string) => void
  onSetExportRangeLocked: (id: string, selectionId: string, locked: boolean) => void
  onReorder: (fromId: string, toId: string) => void
}

export function TimelineBar({
  povs,
  masterTime,
  range,
  playing,
  playbackRate,
  disabled,
  onToggle,
  onNudge,
  onScrub,
  onCommitScrub,
  onRate,
  onResync,
  onAddExportRange,
  onUpdateExportRange,
  onRemoveExportRange,
  onSetExportRangeLocked,
  onReorder
}: TimelineBarProps) {
  const span = Math.max(range.duration, 0.001)
  const preview = usePreviewQuality()
  const armedCount = useArmedCount()
  const budget = useDecodeBudget()
  const liveStats = useLiveDecodeStats()
  const view = useViewUi()
  const filteredPovs = povs.filter((pov) =>
    matchesPovQuery(
      { playerName: pov.playerName, markerColor: pov.markerColor },
      view.query,
      view.markerFilter
    )
  )
  const filterActive = view.query.trim() !== '' || view.markerFilter !== null
  const [panelHeight, setPanelHeight] = useState(PANEL_HEIGHT_DEFAULT)
  const [viewport, setViewport] = useState<TimelineViewport>(() => fullViewport(range))
  const resizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const rangeKeyRef = useRef(`${range.start}:${range.end}`)
  const viewportInteractRef = useRef(false)

  useEffect(() => {
    setPanelHeight(readStoredPanelHeight())
  }, [])

  useEffect(() => {
    function onResize(): void {
      setPanelHeight((current) => clampPanelHeight(current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const key = `${range.start}:${range.end}`
    const rangeChanged = rangeKeyRef.current !== key
    if (!rangeChanged && range.duration > 0) return
    // Don't yank the overview window back to "fit all" while the user is dragging it.
    if (viewportInteractRef.current && rangeChanged) {
      rangeKeyRef.current = key
      setViewport((current) => clampViewport(current.start, current.end, range))
      return
    }
    rangeKeyRef.current = key
    setViewport((current) => {
      if (range.duration <= 0) return fullViewport(range)
      if (rangeChanged) return fullViewport(range)
      return clampViewport(current.start, current.end, range)
    })
  }, [range])

  const persistHeight = useCallback((height: number) => {
    try {
      window.localStorage.setItem(PANEL_HEIGHT_KEY, String(height))
    } catch {
      // ignore quota / private mode
    }
  }, [])

  const onViewportChange = useCallback((next: TimelineViewport) => {
    // Soft edge clamp only (preserve span). Never re-apply minSpan here — that path
    // treats float-shrunk width as "too small" and snaps the window to full.start,
    // which is exactly the overview whole-window pan twitch.
    const clamped = panViewport(next, 0, range)
    setViewport((current) => (viewportsEqual(current, clamped) ? current : clamped))
  }, [range])

  const onViewportInteract = useCallback((active: boolean) => {
    viewportInteractRef.current = active
  }, [])

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelHeight
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = clampPanelHeight(drag.startHeight + (drag.startY - event.clientY))
    setPanelHeight(next)
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPanelHeight((current) => {
      const next = clampPanelHeight(current)
      persistHeight(next)
      return next
    })
  }

  const clampedViewport =
    range.duration > 0 ? clampViewport(viewport.start, viewport.end, range) : fullViewport(range)
  const viewRange = viewportToRange(clampedViewport)

  return (
    <footer className="timeline-bar" style={{ height: panelHeight }}>
      <div
        className="timeline-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="拖动调整底部时间轴高度"
        aria-valuemin={PANEL_HEIGHT_MIN}
        aria-valuemax={maxPanelHeight()}
        aria-valuenow={panelHeight}
        title="拖动调整高度"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <span className="timeline-resize-grip" aria-hidden />
      </div>

      <div className="timeline-clock">
        <button type="button" className="primary" disabled={disabled} onClick={onToggle}>
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <span className="timeline-time">{formatMasterTime(masterTime)}</span>
      </div>

      <TimelineTracks
        povs={filteredPovs}
        masterTime={masterTime}
        range={viewRange}
        fullRange={range}
        viewport={clampedViewport}
        disabled={disabled}
        activeId={view.activeId}
        emptyHint={
          filterActive && filteredPovs.length === 0 && povs.length > 0
            ? '当前筛选没有匹配的时间轴'
            : undefined
        }
        onViewportChange={onViewportChange}
        onScrub={onScrub}
        onCommitScrub={onCommitScrub}
        onSelect={(id) => {
          view.setActiveId(id)
        }}
        onAddExportRange={onAddExportRange}
        onUpdateExportRange={onUpdateExportRange}
        onRemoveExportRange={onRemoveExportRange}
        onSetExportRangeLocked={onSetExportRangeLocked}
        onReorder={onReorder}
        onViewportInteract={onViewportInteract}
      />

      <div className="timeline-controls">
        <button type="button" disabled={disabled} onClick={() => onNudge(-10)}>
          ◀ −10s
        </button>
        <button type="button" disabled={disabled} onClick={onToggle}>
          {playing ? '暂停' : '播放'}
        </button>
        <button type="button" disabled={disabled} onClick={() => onNudge(10)}>
          +10s ▶
        </button>
        <label className="speed">
          倍速
          <select
            value={playbackRate}
            disabled={disabled}
            onChange={(event) => onRate(Number(event.target.value) as PlaybackRate)}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(1)}x
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="resync"
          disabled={disabled}
          title="将所有 POV 重新对齐到当前主时间，并重置播放校正状态"
          onClick={onResync}
        >
          重新同步
        </button>
        <span className="timeline-span">
          {formatMasterTime(viewRange.start)} – {formatMasterTime(viewRange.end)}
          <span className="visually-hidden">{span}</span>
        </span>
      </div>

      <div className="preview-settings">
        <label
          className="speed"
          title="均为连续播放。低画质放宽同步校正。用卡片上的「展示中/未展示」控制是否参与解码；双击进入焦点。"
        >
          预览画质
          <select
            value={preview.settings.preset}
            onChange={(event) => preview.setPreset(event.target.value as PreviewQualityPreset)}
          >
            <option value="high">高（紧密同步）</option>
            <option value="medium">中（较少校正）</option>
            <option value="low">低（最少校正）</option>
          </select>
        </label>
        <label
          className="speed"
          title="播放时同时保持连续解码的上限。超出预算的展示卡片显示静止帧并排队。"
        >
          同时解码
          <select
            value={budget.maxLive}
            onChange={(event) => budget.setMaxLive(Number(event.target.value))}
          >
            {LIVE_DECODER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} 路
              </option>
            ))}
          </select>
        </label>
        <span
          className="decode-stats"
          title="解码 = 当前占用的连续解码槽；展示 = 已点「展示中」的卡片数"
        >
          解码 {liveStats.live}/{liveStats.max} · 展示 {armedCount}
        </span>
        <span className="preview-hint">拖动排序 · 单击选中 · 双击焦点</span>
      </div>
    </footer>
  )
}
