import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type UIEvent } from 'react'
import { useArmedLookup } from '../player/playbackArm'
import { useViewUi } from '../player/viewUi'
import {
  dataTransferHasPovId,
  readPovDragId,
  setPovDragData
} from '../project/povDrag'
import type { POVRuntime } from '../project/types'
import type { TimelineRange } from '../timeline/range'
import {
  clampSelection,
  collectSelectionSnapTargets,
  constrainSelectionNoOverlap,
  isTimeInsideSelection,
  moveSelectionNoOverlap,
  selectionSpan,
  selectionWindowPercent,
  snapMovedSelection,
  snapTime,
  type ExportSelection,
  type TimelineSelection
} from '../timeline/selection'
import { formatMasterTime } from '../timeline/timeFormat'
import { buildRulerTicks, formatRulerTickLabel } from '../timeline/rulerTicks'
import { playheadPercent, timeFromRatio, trackSegmentLayout } from '../timeline/trackLayout'
import type { TimelineViewport } from '../timeline/viewport'
import { TimelineZoomBar, TimelineZoomResetButton } from './TimelineZoomBar'

interface TimelineTracksProps {
  povs: readonly POVRuntime[]
  masterTime: number
  /** Visible horizontal window (zoomed). */
  range: TimelineRange
  fullRange: TimelineRange
  viewport: TimelineViewport
  disabled: boolean
  activeId: string | null
  onViewportChange: (viewport: TimelineViewport) => void
  onScrub: (time: number) => void
  onCommitScrub: () => void
  onSelect: (id: string) => void
  onAddExportRange: (id: string, range: TimelineSelection) => void
  onUpdateExportRange: (id: string, selectionId: string, range: TimelineSelection) => void
  onRemoveExportRange: (id: string, selectionId: string) => void
  onSetExportRangeLocked: (id: string, selectionId: string, locked: boolean) => void
  onReorder: (fromId: string, toId: string) => void
  onViewportInteract?: (active: boolean) => void
  /** Override empty-state copy (e.g. when search/color filter hides all tracks). */
  emptyHint?: string
}

type DragMode = 'scrub' | 'edge-start' | 'edge-end' | 'move'

type ContextMenuState =
  | { kind: 'track'; x: number; y: number; povId: string; time: number }
  | { kind: 'selection'; x: number; y: number; povId: string; selectionId: string }

function clampMenuPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const pad = 8
  const maxX = Math.max(pad, window.innerWidth - width - pad)
  const maxY = Math.max(pad, window.innerHeight - height - pad)
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y))
  }
}

/** Pixel threshold converted to master-timeline seconds for the visible window. */
const SELECTION_SNAP_PX = 8

function snapThresholdForWidth(width: number, visibleDuration: number): number {
  if (!(width > 0)) return 0.25
  return (SELECTION_SNAP_PX / width) * Math.max(visibleDuration, 0.001)
}

export function TimelineTracks({
  povs,
  masterTime,
  range,
  fullRange,
  viewport,
  disabled,
  activeId,
  onViewportChange,
  onScrub,
  onCommitScrub,
  onSelect,
  onAddExportRange,
  onUpdateExportRange,
  onRemoveExportRange,
  onSetExportRangeLocked,
  onReorder,
  onViewportInteract,
  emptyHint
}: TimelineTracksProps) {
  const tracksRef = useRef<HTMLDivElement>(null)
  const labelsScrollRef = useRef<HTMLDivElement>(null)
  const tracksScrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const syncingScrollRef = useRef(false)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    mode: DragMode
    pointerId: number
    povId: string
    selectionId: string
    originX: number
    originSelection: ExportSelection
  } | null>(null)
  const isArmed = useArmedLookup()
  const view = useViewUi()
  const empty = range.duration <= 0 || povs.length === 0
  const headPct = empty ? null : playheadPercent(masterTime, range)
  const playheadInView = headPct != null && headPct >= -1 && headPct <= 101
  const tickPlan = empty ? null : buildRulerTicks(range, 8)
  const activePov = activeId ? povs.find((pov) => pov.id === activeId) ?? null : null

  function isShowing(id: string): boolean {
    if (isArmed(id)) return true
    return view.mode === 'focus' && view.focusId === id
  }

  const timeAtClientX = useCallback(
    (clientX: number): number => {
      const node = tracksRef.current
      if (!node || empty) return masterTime
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0) return masterTime
      return timeFromRatio((clientX - rect.left) / rect.width, range)
    },
    [empty, masterTime, range]
  )

  function resolvePovId(target: EventTarget | null): string | null {
    if (target instanceof Element) {
      const node = target.closest('[data-pov-id]')
      const id = node?.getAttribute('data-pov-id')
      if (id) return id
    }
    return activeId
  }

  function resolveSelectionId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null
    const node = target.closest('[data-selection-id]')
    return node?.getAttribute('data-selection-id') ?? null
  }

  /** Prefer the lane under the pointer; fall back to the active track. */
  function resolvePovIdAtClientY(clientY: number): string | null {
    const root = tracksRef.current
    if (root) {
      const lanes = root.querySelectorAll<HTMLElement>('.timeline-lane-track[data-pov-id]')
      for (const lane of lanes) {
        const rect = lane.getBoundingClientRect()
        if (clientY >= rect.top && clientY < rect.bottom) {
          return lane.getAttribute('data-pov-id')
        }
      }
    }
    return activeId
  }

  function snapExtrasForPov(pov: POVRuntime): number[] {
    const extras = [masterTime, fullRange.start, fullRange.end]
    if (pov.metadataReady && pov.duration > 0) {
      extras.push(pov.offset, pov.offset + pov.duration)
    }
    return extras
  }

  function resolveMode(target: EventTarget | null): DragMode | null {
    if (!(target instanceof Element)) return null
    if (target.closest('.timeline-playhead')) return 'scrub'
    if (target.closest('.timeline-selection-handle.is-start')) return 'edge-start'
    if (target.closest('.timeline-selection-handle.is-end')) return 'edge-end'
    if (target.closest('.timeline-selection')) return 'move'
    return null
  }

  function closeContextMenu(): void {
    setContextMenu(null)
  }

  useEffect(() => {
    if (!contextMenu) return
    const frame = requestAnimationFrame(() => {
      const node = menuRef.current
      if (!node) {
        setMenuPos({ x: contextMenu.x, y: contextMenu.y })
        return
      }
      const rect = node.getBoundingClientRect()
      setMenuPos(clampMenuPosition(contextMenu.x, contextMenu.y, rect.width, rect.height))
    })
    return () => cancelAnimationFrame(frame)
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeContextMenu()
    }
    function onPointerDown(event: PointerEvent): void {
      const node = menuRef.current
      if (node && event.target instanceof Node && node.contains(event.target)) return
      closeContextMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [contextMenu])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || empty || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button') || target?.closest('.timeline-context-menu')) return
    closeContextMenu()

    const mode = resolveMode(event.target)
    const time = timeAtClientX(event.clientX)

    // Playhead drag, or left-click empty track/ruler → jump / scrub.
    if (mode === 'scrub' || mode === null) {
      const povId = resolvePovId(event.target)
      if (povId) onSelect(povId)
      dragRef.current = {
        mode: 'scrub',
        pointerId: event.pointerId,
        povId: povId ?? activeId ?? '',
        selectionId: '',
        originX: event.clientX,
        originSelection: { id: '', start: time, end: time }
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      onScrub(time)
      return
    }

    const povId = resolvePovId(event.target)
    if (!povId) return
    onSelect(povId)

    const selectionId = resolveSelectionId(event.target)
    if (!selectionId) return
    const pov = povs.find((entry) => entry.id === povId)
    const selection = pov?.exportRanges.find((entry) => entry.id === selectionId)
    if (!selection || selection.locked) return

    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      povId,
      selectionId,
      originX: event.clientX,
      originSelection: selection
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const time = timeAtClientX(event.clientX)

    if (drag.mode === 'scrub') {
      onScrub(time)
      return
    }

    if (drag.mode === 'edge-start') {
      const pov = povs.find((entry) => entry.id === drag.povId)
      if (!pov) return
      const width = tracksRef.current?.getBoundingClientRect().width ?? 0
      const threshold = snapThresholdForWidth(width, range.duration)
      const targets = collectSelectionSnapTargets(
        pov.exportRanges,
        drag.selectionId,
        snapExtrasForPov(pov)
      )
      const snapped = snapTime(time, targets, threshold)
      onUpdateExportRange(
        drag.povId,
        drag.selectionId,
        constrainSelectionNoOverlap(
          { start: snapped, end: drag.originSelection.end },
          drag.originSelection,
          pov.exportRanges,
          drag.selectionId,
          fullRange
        )
      )
      return
    }

    if (drag.mode === 'edge-end') {
      const pov = povs.find((entry) => entry.id === drag.povId)
      if (!pov) return
      const width = tracksRef.current?.getBoundingClientRect().width ?? 0
      const threshold = snapThresholdForWidth(width, range.duration)
      const targets = collectSelectionSnapTargets(
        pov.exportRanges,
        drag.selectionId,
        snapExtrasForPov(pov)
      )
      const snapped = snapTime(time, targets, threshold)
      onUpdateExportRange(
        drag.povId,
        drag.selectionId,
        constrainSelectionNoOverlap(
          { start: drag.originSelection.start, end: snapped },
          drag.originSelection,
          pov.exportRanges,
          drag.selectionId,
          fullRange
        )
      )
      return
    }

    if (drag.mode === 'move') {
      const node = tracksRef.current
      if (!node) return
      const width = node.getBoundingClientRect().width
      if (width <= 0) return
      const pov = povs.find((entry) => entry.id === drag.povId)
      if (!pov) return
      const delta =
        ((event.clientX - drag.originX) / width) * Math.max(range.duration, 0.001)
      const moved = moveSelectionNoOverlap(
        drag.originSelection,
        delta,
        pov.exportRanges,
        fullRange
      )
      const threshold = snapThresholdForWidth(width, range.duration)
      const targets = collectSelectionSnapTargets(
        pov.exportRanges,
        drag.selectionId,
        snapExtrasForPov(pov)
      )
      const snapped = snapMovedSelection(moved, targets, threshold)
      onUpdateExportRange(
        drag.povId,
        drag.selectionId,
        constrainSelectionNoOverlap(
          snapped,
          drag.originSelection,
          pov.exportRanges,
          drag.selectionId,
          fullRange
        )
      )
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.mode === 'scrub') onCommitScrub()
  }

  function onTrackContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    if (disabled || empty) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.timeline-selection')) return

    const onPlayhead = Boolean(target?.closest('.timeline-playhead'))
    const povId = onPlayhead
      ? resolvePovIdAtClientY(event.clientY)
      : resolvePovId(event.target)
    if (!povId) return

    event.preventDefault()
    event.stopPropagation()
    onSelect(povId)
    setContextMenu({
      kind: 'track',
      x: event.clientX,
      y: event.clientY,
      povId,
      time: onPlayhead ? masterTime : timeAtClientX(event.clientX)
    })
  }

  function onSelectionContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
    povId: string,
    selectionId: string
  ): void {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(povId)
    setContextMenu({
      kind: 'selection',
      x: event.clientX,
      y: event.clientY,
      povId,
      selectionId
    })
  }

  function syncScroll(source: 'labels' | 'tracks', event: UIEvent<HTMLDivElement>): void {
    if (syncingScrollRef.current) return
    const other = source === 'labels' ? tracksScrollRef.current : labelsScrollRef.current
    if (!other) return
    syncingScrollRef.current = true
    other.scrollTop = event.currentTarget.scrollTop
    syncingScrollRef.current = false
  }

  const selectionCount = activePov?.exportRanges.length ?? 0
  const selectionHint =
    selectionCount > 0
      ? `${activePov!.playerName} 已有 ${selectionCount} 个导出区间 · 右键区间可锁定/移除`
      : activeId
        ? '左键点击/拖播放头定位 · 右键轨道创建导出区间 · 同轴不可重叠'
        : '左键定位时间 · 选中卡片后右键轨道可创建导出区间'

  const menuPov =
    contextMenu?.kind === 'track'
      ? povs.find((pov) => pov.id === contextMenu.povId) ?? null
      : contextMenu?.kind === 'selection'
        ? povs.find((pov) => pov.id === contextMenu.povId) ?? null
        : null
  const menuSelection =
    contextMenu?.kind === 'selection'
      ? menuPov?.exportRanges.find((entry) => entry.id === contextMenu.selectionId) ?? null
      : null
  const canCreateAtMenu =
    contextMenu?.kind === 'track' && menuPov
      ? !isTimeInsideSelection(contextMenu.time, menuPov.exportRanges)
      : false

  return (
    <section className={`timeline-tracks${disabled || empty ? ' is-disabled' : ''}`} aria-label="全部卡片时间轴">
      <div className="timeline-tracks-header">
        <span className="timeline-tracks-title">卡片时间轴</span>
        <span className="timeline-zoom-hint">{selectionHint}</span>
        <TimelineZoomResetButton
          disabled={disabled}
          fullRange={fullRange}
          onViewportChange={onViewportChange}
        />
      </div>

      <div className="timeline-tracks-shell">
        <div className="timeline-shell-labels">
          <div className="timeline-zoom-label" title="全片总览与水平缩放">
            总览
          </div>
          {empty ? (
            <div className="timeline-lane-labels-scroll" />
          ) : (
            <div
              className="timeline-lane-labels-scroll"
              ref={labelsScrollRef}
              onScroll={(event) => syncScroll('labels', event)}
            >
              <div className="timeline-lane-labels">
                <div className="timeline-lane-label-spacer" aria-hidden />
                {povs.map((pov) => (
                  <div
                    key={pov.id}
                    role="button"
                    tabIndex={0}
                    className={`timeline-lane-label${pov.id === activeId ? ' is-active' : ''}${
                      isShowing(pov.id) ? '' : ' is-idle'
                    }${draggingId === pov.id ? ' is-dragging' : ''}${
                      dragOverId === pov.id ? ' is-drag-over' : ''
                    }`}
                    title={`${pov.playerName} · 拖动调整排序`}
                    draggable={!disabled}
                    onClick={() => onSelect(pov.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelect(pov.id)
                      }
                    }}
                    onDragStart={(event: ReactDragEvent<HTMLDivElement>) => {
                      if (disabled) {
                        event.preventDefault()
                        return
                      }
                      setPovDragData(event.dataTransfer, pov.id)
                      setDraggingId(pov.id)
                      setDragOverId(null)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverId(null)
                    }}
                    onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
                      if (disabled || !dataTransferHasPovId(event.dataTransfer)) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      if (draggingId !== pov.id) setDragOverId(pov.id)
                    }}
                    onDragLeave={(event: ReactDragEvent<HTMLDivElement>) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                      setDragOverId((current) => (current === pov.id ? null : current))
                    }}
                    onDrop={(event: ReactDragEvent<HTMLDivElement>) => {
                      if (disabled || !dataTransferHasPovId(event.dataTransfer)) return
                      event.preventDefault()
                      setDragOverId(null)
                      const fromId = readPovDragId(event.dataTransfer)
                      if (!fromId || fromId === pov.id) return
                      onReorder(fromId, pov.id)
                    }}
                  >
                    {pov.playerName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="timeline-shell-tracks">
          <div className="timeline-zoom-row">
            <TimelineZoomBar
              povs={povs}
              masterTime={masterTime}
              fullRange={fullRange}
              viewport={viewport}
              disabled={disabled}
              onViewportChange={onViewportChange}
              onViewportInteract={onViewportInteract}
              onScrub={onScrub}
              onCommitScrub={onCommitScrub}
            />
          </div>

          {empty ? (
            <p className="timeline-tracks-empty">
              {emptyHint ?? '导入并读取到时长后，将在此显示每张卡片的时间段'}
            </p>
          ) : (
            <div
              className="timeline-lanes-scroll"
              ref={tracksScrollRef}
              onScroll={(event) => syncScroll('tracks', event)}
            >
              <div
                className="timeline-lane-tracks"
                ref={tracksRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onContextMenu={onTrackContextMenu}
              >
                <div className="timeline-ruler-scale" aria-hidden>
                  {tickPlan?.ticks.map((tick, index) => {
                    const pct = playheadPercent(tick.time, range)
                    const nearStart = pct <= 1
                    const nearEnd = pct >= 99
                    const edge = nearStart ? ' is-start' : nearEnd ? ' is-end' : ''
                    return (
                      <span
                        key={`ruler-${tick.time}-${index}`}
                        className={`timeline-ruler-mark${tick.major ? ' is-major' : ' is-minor'}${edge}`}
                        style={{ left: `${pct}%` }}
                      >
                        {tick.major ? (
                          <span className="timeline-ruler-label">
                            {formatRulerTickLabel(tick.time, tickPlan.majorStep)}
                          </span>
                        ) : null}
                      </span>
                    )
                  })}
                </div>

                <div className="timeline-tick-grid" aria-hidden>
                  {tickPlan?.ticks.map((tick, index) => (
                    <span
                      key={`grid-${tick.time}-${index}`}
                      className={`timeline-tick-line${tick.major ? ' is-major' : ''}`}
                      style={{ left: `${playheadPercent(tick.time, range)}%` }}
                    />
                  ))}
                </div>

                {playheadInView ? (
                  <div
                    className="timeline-playhead"
                    style={{ left: `${headPct}%` }}
                    title={`播放头 ${formatMasterTime(masterTime)}（左键拖拽或点击轨道定位 · 右键创建选区）`}
                  >
                    <span className="timeline-playhead-cap" aria-hidden />
                  </div>
                ) : null}

                {povs.map((pov) => {
                  const ready = pov.metadataReady && Number.isFinite(pov.duration) && pov.duration > 0
                  const layout = ready
                    ? trackSegmentLayout(pov.offset, pov.duration, range)
                    : { leftPct: 0, widthPct: 0, startPct: 0 }
                  const showing = isShowing(pov.id)
                  return (
                    <div
                      key={pov.id}
                      className={`timeline-lane-track${pov.id === activeId ? ' is-active' : ''}${
                        pov.missing ? ' is-missing' : ''
                      }${showing ? ' is-showing' : ' is-idle'}`}
                      data-pov-id={pov.id}
                    >
                      {pov.exportRanges.map((selection) => {
                        const selPct = selectionWindowPercent(selection, range)
                        const locked = Boolean(selection.locked)
                        return (
                          <div
                            key={selection.id}
                            className={`timeline-selection${
                              selectionSpan(selection) <= 0 ? ' is-zero' : ''
                            }${locked ? ' is-locked' : ''}${
                              pov.id === activeId ? ' is-focused' : ''
                            }${
                              pov.markerColor ? ` marker-${pov.markerColor}` : ' marker-default'
                            }`}
                            data-pov-id={pov.id}
                            data-selection-id={selection.id}
                            data-marker={pov.markerColor ?? 'default'}
                            style={{
                              left: `${selPct.leftPct}%`,
                              width: `${selPct.widthPct}%`
                            }}
                            title={
                              locked
                                ? `${pov.playerName} 导出区间（已锁定） ${formatMasterTime(selection.start)} – ${formatMasterTime(selection.end)}`
                                : `${pov.playerName} 导出区间 ${formatMasterTime(selection.start)} – ${formatMasterTime(selection.end)}`
                            }
                            onContextMenu={(event) =>
                              onSelectionContextMenu(event, pov.id, selection.id)
                            }
                          >
                            <span className="timeline-selection-cap is-start" aria-hidden />
                            <span className="timeline-selection-cap is-end" aria-hidden />
                            {!locked ? (
                              <>
                                <span
                                  className="timeline-selection-handle is-start"
                                  data-pov-id={pov.id}
                                  data-selection-id={selection.id}
                                  title="拖动修改入点"
                                />
                                <span
                                  className="timeline-selection-handle is-end"
                                  data-pov-id={pov.id}
                                  data-selection-id={selection.id}
                                  title="拖动修改出点"
                                />
                              </>
                            ) : (
                              <span className="timeline-selection-lock" aria-hidden title="已锁定" />
                            )}
                          </div>
                        )
                      })}
                      {ready ? (
                        <>
                          <div
                            className={`timeline-segment${showing ? '' : ' is-idle'}`}
                            style={{
                              left: `${layout.leftPct}%`,
                              width: `${Math.max(layout.widthPct, 0.15)}%`
                            }}
                            title={`${pov.playerName} · 起点 ${formatMasterTime(pov.offset)} · 时长 ${formatMasterTime(pov.duration)}${showing ? '' : ' · 未展示'}`}
                          />
                          {layout.startPct >= -2 && layout.startPct <= 102 ? (
                            <span
                              className={`timeline-start-time${layout.startPct > 72 ? ' is-endish' : ''}${
                                showing ? '' : ' is-idle'
                              }`}
                              style={{ left: `${layout.startPct}%` }}
                              title={`起始 ${formatMasterTime(pov.offset)}`}
                            >
                              {formatMasterTime(pov.offset)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="timeline-lane-pending">
                          {pov.missing ? '文件缺失' : '读取时长中…'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu ? (
        <div
          ref={menuRef}
          className="timeline-context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          role="menu"
        >
          {contextMenu.kind === 'track' ? (
            <button
              type="button"
              className="timeline-context-menu-item"
              role="menuitem"
              disabled={!canCreateAtMenu}
              title={canCreateAtMenu ? undefined : '此处已有导出区间，不能重叠创建'}
              onClick={() => {
                if (!canCreateAtMenu) return
                const time = clampSelection(
                  { start: contextMenu.time, end: contextMenu.time },
                  fullRange
                )
                onAddExportRange(contextMenu.povId, time)
                closeContextMenu()
              }}
            >
              创建导出区间
            </button>
          ) : (
            <>
              <button
                type="button"
                className="timeline-context-menu-item"
                role="menuitem"
                onClick={() => {
                  onSetExportRangeLocked(
                    contextMenu.povId,
                    contextMenu.selectionId,
                    !menuSelection?.locked
                  )
                  closeContextMenu()
                }}
              >
                {menuSelection?.locked ? '解锁选区' : '锁定选区'}
              </button>
              <button
                type="button"
                className="timeline-context-menu-item is-danger"
                role="menuitem"
                disabled={Boolean(menuSelection?.locked)}
                title={
                  menuSelection?.locked ? '请先解锁后再移除' : undefined
                }
                onClick={() => {
                  if (menuSelection?.locked) return
                  onRemoveExportRange(contextMenu.povId, contextMenu.selectionId)
                  closeContextMenu()
                }}
              >
                移除导出区间
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
