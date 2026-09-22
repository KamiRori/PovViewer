import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useArmedLookup } from '../player/playbackArm'
import type { POVRuntime } from '../project/types'
import type { TimelineRange } from '../timeline/range'
import { formatMasterTime } from '../timeline/timeFormat'
import { buildRulerTicks } from '../timeline/rulerTicks'
import { playheadPercent, timeFromRatio, trackSegmentLayout } from '../timeline/trackLayout'
import {
  clampViewport,
  panViewport,
  resizeViewportEdge,
  type TimelineViewport,
  viewportWindowPercent
} from '../timeline/viewport'

interface TimelineZoomBarProps {
  povs: readonly POVRuntime[]
  masterTime: number
  fullRange: TimelineRange
  viewport: TimelineViewport
  disabled: boolean
  onViewportChange: (viewport: TimelineViewport) => void
  onScrub: (time: number) => void
  onCommitScrub: () => void
}

type DragMode = 'pan' | 'start' | 'end' | 'seek'

const CLICK_MOVE_PX = 4

export function TimelineZoomBar({
  povs,
  masterTime,
  fullRange,
  viewport,
  disabled,
  onViewportChange,
  onScrub,
  onCommitScrub
}: TimelineZoomBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    pointerId: number
    originX: number
    originViewport: TimelineViewport
    originTime: number
    moved: boolean
  } | null>(null)
  const isArmed = useArmedLookup()
  const empty = fullRange.duration <= 0
  const windowPct = empty
    ? { leftPct: 0, widthPct: 100 }
    : viewportWindowPercent(viewport, fullRange)
  const headPct = empty ? 0 : Math.min(100, Math.max(0, playheadPercent(masterTime, fullRange)))
  /** Full-span window cannot pan; keep handles only so seeking the playhead stays easy. */
  const isFullView =
    !empty && viewport.end - viewport.start >= Math.max(fullRange.duration, 0.001) * 0.985
  const tickPlan = empty ? null : buildRulerTicks(fullRange, 6)

  function timeAtClientX(clientX: number): number {
    const node = trackRef.current
    if (!node || empty) return masterTime
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0) return masterTime
    return timeFromRatio((clientX - rect.left) / rect.width, fullRange)
  }

  function resolveMode(target: EventTarget | null): DragMode {
    if (!(target instanceof Element)) return 'seek'
    if (target.closest('.timeline-zoom-handle.is-start')) return 'start'
    if (target.closest('.timeline-zoom-handle.is-end')) return 'end'
    if (target.closest('.timeline-zoom-playhead')) return 'seek'
    if (target.closest('.timeline-zoom-window')) return isFullView ? 'seek' : 'pan'
    return 'seek'
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || empty || event.button !== 0) return
    event.preventDefault()
    const mode = resolveMode(event.target)
    const time = timeAtClientX(event.clientX)
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originViewport: viewport,
      originTime: time,
      moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (mode === 'seek') onScrub(time)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const time = timeAtClientX(event.clientX)

    if (drag.mode === 'seek') {
      onScrub(time)
      return
    }
    if (drag.mode === 'start') {
      onViewportChange(resizeViewportEdge(drag.originViewport, 'start', time, fullRange))
      return
    }
    if (drag.mode === 'end') {
      onViewportChange(resizeViewportEdge(drag.originViewport, 'end', time, fullRange))
      return
    }

    const dx = Math.abs(event.clientX - drag.originX)
    if (!drag.moved && dx < CLICK_MOVE_PX) return
    drag.moved = true

    const node = trackRef.current
    if (!node) return
    const width = node.getBoundingClientRect().width
    if (width <= 0) return
    const deltaSeconds =
      ((event.clientX - drag.originX) / width) * Math.max(fullRange.duration, 0.001)
    onViewportChange(panViewport(drag.originViewport, deltaSeconds, fullRange))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.mode === 'seek') {
      onCommitScrub()
      return
    }
    // Click on the zoom window (no drag) → jump playhead.
    if (drag.mode === 'pan' && !drag.moved) {
      onScrub(drag.originTime)
      onCommitScrub()
    }
  }

  return (
    <div
      className={`timeline-zoom-track${disabled || empty ? ' is-disabled' : ''}`}
      ref={trackRef}
      role="slider"
      aria-label="时间轴总览与缩放"
      aria-valuemin={fullRange.start}
      aria-valuemax={fullRange.end}
      aria-valuenow={masterTime}
      title={
        isFullView
          ? '左键拖动定位播放头 · 拉两端缩放'
          : '左键点击定位 · 拖中间平移 · 拉两端缩放 · 拖播放头定位'
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="timeline-zoom-lanes" aria-hidden>
        {povs.map((pov) => {
          const ready = pov.metadataReady && Number.isFinite(pov.duration) && pov.duration > 0
          if (!ready) return null
          const layout = trackSegmentLayout(pov.offset, pov.duration, fullRange)
          const showing = isArmed(pov.id)
          return (
            <div
              key={pov.id}
              className={`timeline-zoom-segment${showing ? '' : ' is-idle'}`}
              style={{ left: `${layout.leftPct}%`, width: `${Math.max(layout.widthPct, 0.2)}%` }}
            />
          )
        })}
      </div>

      <div className="timeline-zoom-ticks" aria-hidden>
        {tickPlan?.ticks.map((tick, index) => (
          <span
            key={`zoom-tick-${tick.time}-${index}`}
            className={`timeline-zoom-tick${tick.major ? ' is-major' : ''}`}
            style={{ left: `${playheadPercent(tick.time, fullRange)}%` }}
          />
        ))}
      </div>

      <div className="timeline-zoom-exports" aria-hidden>
        {/* Later POVs first so earlier tracks paint on top when ranges overlap. */}
        {[...povs].reverse().flatMap((pov) =>
          pov.exportRanges.map((selection) => {
            const leftPct =
              ((selection.start - fullRange.start) / Math.max(fullRange.duration, 0.001)) * 100
            const widthPct =
              ((selection.end - selection.start) / Math.max(fullRange.duration, 0.001)) * 100
            return (
              <div
                key={`${pov.id}:${selection.id}`}
                className={`timeline-zoom-export${
                  pov.markerColor ? ` marker-${pov.markerColor}` : ' marker-default'
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0)}%`
                }}
              />
            )
          })
        )}
      </div>

      <div
        className={`timeline-zoom-window${isFullView ? ' is-full' : ''}`}
        style={{ left: `${windowPct.leftPct}%`, width: `${windowPct.widthPct}%` }}
        title={
          isFullView
            ? `${formatMasterTime(viewport.start)} – ${formatMasterTime(viewport.end)}（拖两端缩放）`
            : `${formatMasterTime(viewport.start)} – ${formatMasterTime(viewport.end)}`
        }
      >
        <span className="timeline-zoom-handle is-start" title="拖动缩放起点" />
        <span className="timeline-zoom-handle is-end" title="拖动缩放终点" />
      </div>

      <div
        className="timeline-zoom-playhead"
        style={{ left: `${headPct}%` }}
        title={`播放头 ${formatMasterTime(masterTime)}`}
      >
        <span className="timeline-zoom-playhead-cap" aria-hidden />
      </div>
    </div>
  )
}

export function TimelineZoomResetButton({
  disabled,
  fullRange,
  onViewportChange
}: {
  disabled: boolean
  fullRange: TimelineRange
  onViewportChange: (viewport: TimelineViewport) => void
}) {
  return (
    <button
      type="button"
      className="timeline-zoom-reset"
      disabled={disabled || fullRange.duration <= 0}
      title="恢复显示全部时间范围"
      onClick={() => onViewportChange(clampViewport(fullRange.start, fullRange.end, fullRange))}
    >
      适应全部
    </button>
  )
}
