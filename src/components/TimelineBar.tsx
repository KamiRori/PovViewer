import { useArmedCount } from '../player/playbackArm'
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
          title="中/低为采样预览：仅已选中的卡片按主时钟低频 seek。高为连续播放。点击卡片切换是否参与播放。"
        >
          预览画质
          <select
            value={preview.settings.preset}
            onChange={(event) => preview.setPreset(event.target.value as PreviewQualityPreset)}
          >
            <option value="high">高（连续播放）</option>
            <option value="medium">中（采样预览）</option>
            <option value="low">低（更稀采样）</option>
          </select>
        </label>
        <span className="decode-stats" title="点击视角卡片可切换是否参与播放；描边表示已选中">
          参与播放 {armedCount}
        </span>
        <label
          className="speed"
          title="采样模式下每秒向主时钟对齐的次数。越低越省 GPU，画面越跳。"
        >
          采样帧率
          <select
            value={preview.settings.maxFps}
            disabled={preview.settings.playbackMode !== 'sampled'}
            onChange={(event) => preview.setMaxFps(Number(event.target.value))}
          >
            {uniqueSorted([3, 5, 8, 10, 12, 15, preview.settings.maxFps]).map((fps) => (
              <option key={fps} value={fps}>
                {fps}fps
              </option>
            ))}
          </select>
        </label>
        <span className="preview-hint">仅描边卡片挂载解码器；其余为静态帧</span>
      </div>
    </footer>
  )
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}
