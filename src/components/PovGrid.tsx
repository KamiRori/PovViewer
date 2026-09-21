import type { CSSProperties } from 'react'
import { useViewUi } from '../player/viewUi'
import { matchesPovQuery, type MarkerColor } from '../project/markerColor'
import type { ColumnCount, PlaybackSource, POVRuntime } from '../project/types'
import type { PlaybackRate } from '../timeline/playbackMath'
import { formatMasterTime } from '../timeline/timeFormat'
import { PovCard } from './PovCard'

interface PovGridProps {
  povs: POVRuntime[]
  columns: ColumnCount
  masterTime: number
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  /** Bumped after batch proxy generation so cards re-resolve media URLs. */
  proxyEpoch: number
  onRename: (id: string, playerName: string) => void
  onOffset: (id: string, offset: number) => void
  onPlaybackSource: (id: string, playbackSource: PlaybackSource) => void
  onRemove: (id: string) => void
  onDuration: (id: string, duration: number) => void
  onToggleMute: (id: string) => void
  onLocate: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
  onMarkerColor: (id: string, markerColor: MarkerColor | null) => void
}

export function PovGrid({
  povs,
  columns,
  masterTime,
  playing,
  playbackRate,
  seekGeneration,
  proxyEpoch,
  onRename,
  onOffset,
  onPlaybackSource,
  onRemove,
  onDuration,
  onToggleMute,
  onLocate,
  onReorder,
  onMarkerColor
}: PovGridProps) {
  const view = useViewUi()
  const filtered = povs.filter((pov) =>
    matchesPovQuery(
      { playerName: pov.playerName, markerColor: pov.markerColor },
      view.query,
      view.markerFilter
    )
  )

  if (view.mode === 'focus' && view.focusId) {
    const focused =
      filtered.find((pov) => pov.id === view.focusId) ?? povs.find((pov) => pov.id === view.focusId)
    const rail = filtered.filter((pov) => pov.id !== view.focusId)

    if (!focused) {
      return (
        <div className="focus-missing">
          <p>焦点目标不在当前筛选结果中。</p>
          <button type="button" className="focus-back" onClick={() => view.exitFocus()}>
            返回网格
          </button>
        </div>
      )
    }

    return (
      <div className="focus-layout">
        <div className="focus-main">
          <div className="focus-banner">
            <button type="button" onClick={() => view.exitFocus()}>
              返回网格
            </button>
            <strong>{focused.playerName}</strong>
            <span>{formatMasterTime(masterTime)}</span>
          </div>
          <PovCard
            pov={focused}
            masterTime={masterTime}
            playing={playing}
            playbackRate={playbackRate}
            seekGeneration={seekGeneration}
            proxyEpoch={proxyEpoch}
            variant="focus-main"
            onRename={onRename}
            onOffset={onOffset}
            onPlaybackSource={onPlaybackSource}
            onRemove={onRemove}
            onDuration={onDuration}
            onToggleMute={onToggleMute}
            onLocate={onLocate}
            onReorder={onReorder}
            onMarkerColor={onMarkerColor}
          />
        </div>
        <aside className="focus-rail" aria-label="其他 POV">
          {rail.map((pov) => (
            <PovCard
              key={pov.id}
              pov={pov}
              masterTime={masterTime}
              playing={playing}
              playbackRate={playbackRate}
              seekGeneration={seekGeneration}
              proxyEpoch={proxyEpoch}
              variant="focus-rail"
              onRename={onRename}
              onOffset={onOffset}
              onPlaybackSource={onPlaybackSource}
              onRemove={onRemove}
              onDuration={onDuration}
              onToggleMute={onToggleMute}
              onLocate={onLocate}
              onReorder={onReorder}
              onMarkerColor={onMarkerColor}
            />
          ))}
        </aside>
      </div>
    )
  }

  return (
    <div className="grid" style={{ '--columns': columns } as CSSProperties}>
      {filtered.map((pov) => (
        <PovCard
          key={pov.id}
          pov={pov}
          masterTime={masterTime}
          playing={playing}
          playbackRate={playbackRate}
          seekGeneration={seekGeneration}
          proxyEpoch={proxyEpoch}
          onRename={onRename}
          onOffset={onOffset}
          onPlaybackSource={onPlaybackSource}
          onRemove={onRemove}
          onDuration={onDuration}
          onToggleMute={onToggleMute}
          onLocate={onLocate}
          onReorder={onReorder}
          onMarkerColor={onMarkerColor}
        />
      ))}
      {filtered.length === 0 ? <p className="empty-filter">没有匹配的玩家名或颜色标记</p> : null}
    </div>
  )
}
