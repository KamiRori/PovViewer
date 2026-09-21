import type { CSSProperties } from 'react'
import { PovCard } from './PovCard'
import type { ColumnCount, POVRuntime } from '../project/types'
import type { PlaybackRate } from '../timeline/playbackMath'

interface PovGridProps {
  povs: POVRuntime[]
  columns: ColumnCount
  masterTime: number
  playing: boolean
  playbackRate: PlaybackRate
  seekGeneration: number
  onRename: (id: string, playerName: string) => void
  onRemove: (id: string) => void
  onDuration: (id: string, duration: number) => void
}

export function PovGrid({
  povs,
  columns,
  masterTime,
  playing,
  playbackRate,
  seekGeneration,
  onRename,
  onRemove,
  onDuration
}: PovGridProps) {
  return (
    <div className="grid" style={{ '--columns': columns } as CSSProperties}>
      {povs.map((pov) => (
        <PovCard
          key={pov.id}
          pov={pov}
          masterTime={masterTime}
          playing={playing}
          playbackRate={playbackRate}
          seekGeneration={seekGeneration}
          onRename={onRename}
          onRemove={onRemove}
          onDuration={onDuration}
        />
      ))}
    </div>
  )
}
