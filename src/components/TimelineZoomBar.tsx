import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  onViewportInteract?: (active: boolean) => void
  onScrub: (time: number) => void
  onCommitScrub: () => void
}

type DragMode = 'pan' | 'start' | 'end' | 'seek'

const CLICK_MOVE_PX = 4

/** Pixel-follow visual for the overview window (immune to %-clamp flicker). */
interface DragVisual {
  leftPct: number
  widthPct: number
  /** Extra pixel shift from the frozen leftPct (pan only). */
  dx: number
}

export function TimelineZoomBar({
  povs,
  masterTime,
  fullRange,
  viewport,
  disabled,
  onViewportChange,
  onViewportInteract,
  onScrub,
  onCommitScrub
}: TimelineZoomBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef(viewport)
  const onViewportChangeRef = useRef(onViewportChange)
  const onViewportInteractRef = useRef(onViewportInteract)
  const onScrubRef = useRef(onScrub)
  const onCommitScrubRef = useRef(onCommitScrub)
  viewportRef.current = viewport
  onViewportChangeRef.current = onViewportChange
  onViewportInteractRef.current = onViewportInteract
  onScrubRef.current = onScrub
  onCommitScrubRef.current = onCommitScrub

  const dragRef = useRef<{
    mode: DragMode
    pointerId: number
    originX: number
    originViewport: TimelineViewport
    originTime: number
    originLeftPct: number
    originWidthPct: number
    trackLeft: number
    trackWidth: number
    full: TimelineRange
    moved: boolean
    fullView: boolean
  } | null>(null)
  const listenersRef = useRef<{
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
  } | null>(null)
  const liveViewportRef = useRef<TimelineViewport | null>(null)
  const [dragVisual, setDragVisual] = useState<DragVisual | null>(null)

  const isArmed = useArmedLookup()
  const empty = fullRange.duration <= 0
  const idlePct = empty
    ? { leftPct: 0, widthPct: 100 }
    : viewportWindowPercent(viewport, fullRange)
  const windowLeftPct = dragVisual?.leftPct ?? idlePct.leftPct
  const windowWidthPct = dragVisual?.widthPct ?? idlePct.widthPct
  const windowDx = dragVisual?.dx ?? 0
  const headPct = empty ? 0 : Math.min(100, Math.max(0, playheadPercent(masterTime, fullRange)))
  const labelViewport = liveViewportRef.current ?? viewport
  const isFullView =
    dragRef.current?.fullView ??
    (!empty && viewport.end - viewport.start >= Math.max(fullRange.duration, 0.001) * 0.985)
  const tickPlan = empty ? null : buildRulerTicks(fullRange, 6)

  function timeAtClientX(
    clientX: number,
    full: TimelineRange,
    trackLeft: number,
    trackWidth: number
  ): number {
    if (full.duration <= 0 || trackWidth <= 0) return full.start
    return timeFromRatio((clientX - trackLeft) / trackWidth, full)
  }

  function resolveMode(target: EventTarget | null, fullView: boolean): DragMode {
    if (!(target instanceof Element)) return 'seek'
    if (target.closest('.timeline-zoom-handle.is-start')) return 'start'
    if (target.closest('.timeline-zoom-handle.is-end')) return 'end'
    if (target.closest('.timeline-zoom-playhead')) return 'seek'
    if (target.closest('.timeline-zoom-window')) return fullView ? 'seek' : 'pan'
    return 'seek'
  }

  function detachListeners(node: HTMLDivElement): void {
    const listeners = listenersRef.current
    if (!listeners) return
    node.removeEventListener('pointermove', listeners.move)
    node.removeEventListener('pointerup', listeners.up)
    node.removeEventListener('pointercancel', listeners.up)
    listenersRef.current = null
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || empty || event.button !== 0) return
    event.preventDefault()
    const node = trackRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0) return

    detachListeners(node)

    const full = {
      start: fullRange.start,
      end: fullRange.end,
      duration: fullRange.duration
    }
    const current = viewportRef.current
    const fullView =
      full.duration > 0 &&
      current.end - current.start >= Math.max(full.duration, 0.001) * 0.985
    const mode = resolveMode(event.target, fullView)
    const originPct = viewportWindowPercent(current, full)
    const time = timeAtClientX(event.clientX, full, rect.left, rect.width)

    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originViewport: { start: current.start, end: current.end },
      originTime: time,
      originLeftPct: originPct.leftPct,
      originWidthPct: originPct.widthPct,
      trackLeft: rect.left,
      trackWidth: rect.width,
      full,
      moved: false,
      fullView
    }

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== ev.pointerId) return

      if (drag.mode === 'seek') {
        onScrubRef.current(
          timeAtClientX(ev.clientX, drag.full, drag.trackLeft, drag.trackWidth)
        )
        return
      }

      if (drag.mode === 'pan') {
        const dxPx = Math.abs(ev.clientX - drag.originX)
        if (!drag.moved && dxPx < CLICK_MOVE_PX) return
        drag.moved = true

        const deltaSeconds =
          ((ev.clientX - drag.originX) / drag.trackWidth) * Math.max(drag.full.duration, 0.001)
        const next = panViewport(drag.originViewport, deltaSeconds, drag.full)
        liveViewportRef.current = next
        onViewportChangeRef.current(next)
        const pct = viewportWindowPercent(next, drag.full)
        setDragVisual({ leftPct: pct.leftPct, widthPct: pct.widthPct, dx: 0 })
        return
      }

      const edge = drag.mode === 'start' ? 'start' : 'end'
      const time = timeAtClientX(ev.clientX, drag.full, drag.trackLeft, drag.trackWidth)
      const next = resizeViewportEdge(drag.originViewport, edge, time, drag.full)
      liveViewportRef.current = next
      onViewportChangeRef.current(next)
      const pct = viewportWindowPercent(next, drag.full)
      setDragVisual({ leftPct: pct.leftPct, widthPct: pct.widthPct, dx: 0 })
    }

    const onUp = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== ev.pointerId) return
      dragRef.current = null
      detachListeners(node)
      if (node.hasPointerCapture(ev.pointerId)) {
        node.releasePointerCapture(ev.pointerId)
      }
      node.classList.remove('is-viewport-dragging')
      onViewportInteractRef.current?.(false)

      if (drag.mode === 'seek') {
        onCommitScrubRef.current()
        liveViewportRef.current = null
        setDragVisual(null)
        return
      }

      if (drag.mode === 'pan' && !drag.moved) {
        liveViewportRef.current = null
        setDragVisual(null)
        onScrubRef.current(drag.originTime)
        onCommitScrubRef.current()
        return
      }

      const live = liveViewportRef.current
      if (live) onViewportChangeRef.current(live)
      liveViewportRef.current = null
      setDragVisual(null)
    }

    listenersRef.current = { move: onMove, up: onUp }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerup', onUp)
    node.addEventListener('pointercancel', onUp)

    if (mode === 'pan' || mode === 'start' || mode === 'end') {
      node.classList.add('is-viewport-dragging')
      onViewportInteractRef.current?.(true)
      liveViewportRef.current = { start: current.start, end: current.end }
      setDragVisual({
        leftPct: originPct.leftPct,
        widthPct: originPct.widthPct,
        dx: 0
      })
    }

    node.setPointerCapture(event.pointerId)
    if (mode === 'seek') onScrubRef.current(time)
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
                  selection.locked ? ' is-locked' : ''
                }${pov.markerColor ? ` marker-${pov.markerColor}` : ' marker-default'}`}
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
        style={{
          left: `${windowLeftPct}%`,
          width: `${windowWidthPct}%`,
          transform: windowDx !== 0 ? `translateX(${windowDx}px)` : undefined
        }}
        title={`${formatMasterTime(labelViewport.start)} – ${formatMasterTime(labelViewport.end)}${
          isFullView ? '（拖两端缩放）' : ''
        }`}
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
