import { useArmedCount } from '../player/playbackArm'
import {
  LIVE_DECODER_OPTIONS,
  useDecodeBudget,
  useLiveDecodeStats
} from '../player/decodeBudget'
import { type PreviewQualityPreset, usePreviewQuality } from '../player/previewQuality'
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
  const preview = usePreviewQuality()
  const armedCount = useArmedCount()
  const budget = useDecodeBudget()
  const liveStats = useLiveDecodeStats()

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

      <div className="preview-settings">
        <label
          className="speed"
          title="均为连续播放。低画质放宽同步校正。单击卡片切换是否参与（挂载解码器）；双击进入 Focus。"
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
          title="播放时同时保持连续解码的上限。超出预算的参与卡片显示静止帧并排队。"
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
          title="解码 = 当前占用的连续解码槽；参与 = 已点选加入播放的卡片数"
        >
          解码 {liveStats.live}/{liveStats.max} · 参与 {armedCount}
        </span>
        <span className="preview-hint">单击高亮并参与 · 双击 Focus</span>
      </div>
    </footer>
  )
}
