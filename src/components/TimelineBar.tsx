import { PLAYBACK_RATES, type PlaybackRate } from '../timeline/playbackMath'
import { formatMasterTime } from '../timeline/timeFormat'
import type { TimelineRange } from '../timeline/range'

interface TimelineBarProps {
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
}

export function TimelineBar({
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
  onResync
}: TimelineBarProps) {
  const span = Math.max(range.duration, 0.001)

  return (
    <footer className="timeline-bar">
      <div className="timeline-clock">
        <button type="button" className="primary" disabled={disabled} onClick={onToggle}>
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <span className="timeline-time">{formatMasterTime(masterTime)}</span>
      </div>

      <input
        className="timeline-slider"
        type="range"
        min={range.start}
        max={range.end}
        step={0.001}
        value={masterTime}
        disabled={disabled}
        aria-label="Master Timeline"
        onChange={(event) => onScrub(Number(event.target.value))}
        onPointerUp={onCommitScrub}
        onPointerCancel={onCommitScrub}
        onKeyUp={onCommitScrub}
        onBlur={onCommitScrub}
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
          Speed
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
          {formatMasterTime(range.start)} – {formatMasterTime(range.end)}
          <span className="visually-hidden">{span}</span>
        </span>
      </div>
    </footer>
  )
}
