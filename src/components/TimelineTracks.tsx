import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type UIEvent } from 'react'
import { useArmedLookup } from '../player/playbackArm'
import { useViewUi } from '../player/viewUi'
import type { POVRuntime } from '../project/types'
import type { TimelineRange } from '../timeline/range'
import { formatMasterTime } from '../timeline/timeFormat'
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
}

function rulerMarks(range: TimelineRange): number[] {
  const span = Math.max(range.duration, 0.001)
  const steps = span <= 30 ? 6 : span <= 180 ? 8 : 10
  const marks: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    marks.push(range.start + (span * i) / steps)
  }
  return marks
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
  onSelect
}: TimelineTracksProps) {
  const tracksRef = useRef<HTMLDivElement>(null)
  const labelsScrollRef = useRef<HTMLDivElement>(null)
  const tracksScrollRef = useRef<HTMLDivElement>(null)
  const syncingScrollRef = useRef(false)
  const draggingRef = useRef(false)
  const isArmed = useArmedLookup()
  const view = useViewUi()
  const empty = range.duration <= 0 || povs.length === 0
  const headPct = empty ? 0 : Math.min(100, Math.max(0, playheadPercent(masterTime, range)))
  const marks = empty ? [] : rulerMarks(range)

  function isShowing(id: string): boolean {
    if (isArmed(id)) return true
    return view.mode === 'focus' && view.focusId === id
  }

  const scrubFromClientX = useCallback(
    (clientX: number) => {
      const node = tracksRef.current
      if (!node || empty) return
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0) return
      onScrub(timeFromRatio((clientX - rect.left) / rect.width, range))
    },
    [empty, onScrub, range]
  )

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || empty || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubFromClientX(event.clientX)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!draggingRef.current) return
    scrubFromClientX(event.clientX)
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onCommitScrub()
  }

  function syncScroll(source: 'labels' | 'tracks', event: UIEvent<HTMLDivElement>): void {
    if (syncingScrollRef.current) return
    const other = source === 'labels' ? tracksScrollRef.current : labelsScrollRef.current
    if (!other) return
    syncingScrollRef.current = true
    other.scrollTop = event.currentTarget.scrollTop
    syncingScrollRef.current = false
  }

  return (
    <section className={`timeline-tracks${disabled || empty ? ' is-disabled' : ''}`} aria-label="全部卡片时间轴">
      <div className="timeline-tracks-header">
        <span className="timeline-tracks-title">卡片时间轴</span>
        <span className="timeline-zoom-hint">复合条：拖中间平移 · 拉两端缩放 · 点空白定位</span>
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
                  <button
                    key={pov.id}
                    type="button"
                    className={`timeline-lane-label${pov.id === activeId ? ' is-active' : ''}${
                      isShowing(pov.id) ? '' : ' is-idle'
                    }`}
                    title={pov.filePath}
                    onClick={() => onSelect(pov.id)}
                  >
                    {pov.playerName}
                  </button>
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
              onScrub={onScrub}
              onCommitScrub={onCommitScrub}
            />
          </div>

          {empty ? (
            <p className="timeline-tracks-empty">导入并读取到时长后，将在此显示每张卡片的时间段</p>
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
              >
                <div className="timeline-ruler-scale" aria-hidden>
                  {marks.map((mark, index) => {
                    const pct = playheadPercent(mark, range)
                    const edge =
                      index === 0 ? ' is-start' : index === marks.length - 1 ? ' is-end' : ''
                    return (
                      <span
                        key={`${mark}-${index}`}
                        className={`timeline-ruler-mark${edge}`}
                        style={{ left: `${pct}%` }}
                      >
                        {formatMasterTime(mark)}
                      </span>
                    )
                  })}
                </div>

                <div className="timeline-playhead" style={{ left: `${headPct}%` }} aria-hidden>
                  <span className="timeline-playhead-cap" />
                </div>

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
                    >
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
    </section>
  )
}
