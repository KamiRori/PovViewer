import { COLUMN_OPTIONS, type ColumnCount } from '../project/types'

interface ToolbarProps {
  columns: ColumnCount
  count: number
  busy: boolean
  onImportPov: () => void
  onImportSync: () => void
  onColumns: (columns: ColumnCount) => void
  onOpenGpuDebug: () => void
}

export function Toolbar({
  columns,
  count,
  busy,
  onImportPov,
  onImportSync,
  onColumns,
  onOpenGpuDebug
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="primary" onClick={onImportPov} disabled={busy}>
        Import POV
      </button>
      <button type="button" onClick={onImportSync} disabled={busy}>
        Import Sync
      </button>
      <button type="button" onClick={onOpenGpuDebug} title="打开独立窗口查看进程与功能活动指标">
        GPU 调试
      </button>
      <div className="columns" role="group" aria-label="列数">
        <span>列数</span>
        {COLUMN_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === columns}
            onClick={() => onColumns(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="count">{count} POV</p>
    </div>
  )
}
