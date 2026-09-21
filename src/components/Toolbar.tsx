import { COLUMN_OPTIONS, type ColumnCount } from '../project/types'

interface ToolbarProps {
  columns: ColumnCount
  count: number
  importing: boolean
  onImport: () => void
  onColumns: (columns: ColumnCount) => void
}

export function Toolbar({ columns, count, importing, onImport, onColumns }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="primary" onClick={onImport} disabled={importing}>
        Import POV
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
