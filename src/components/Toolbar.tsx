import { COLUMN_OPTIONS, type ColumnCount } from '../project/types'

interface ToolbarProps {
  columns: ColumnCount
  count: number
  busy: boolean
  query: string
  projectPath: string | null
  proxyBusy: boolean
  onImportPov: () => void
  onImportSync: () => void
  onSaveProject: () => void
  onOpenProject: () => void
  onGenerateProxies: () => void
  onColumns: (columns: ColumnCount) => void
  onOpenGpuDebug: () => void
  onQuery: (query: string) => void
}

export function Toolbar({
  columns,
  count,
  busy,
  query,
  projectPath,
  proxyBusy,
  onImportPov,
  onImportSync,
  onSaveProject,
  onOpenProject,
  onGenerateProxies,
  onColumns,
  onOpenGpuDebug,
  onQuery
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="primary" onClick={onImportPov} disabled={busy}>
        Import POV
      </button>
      <button type="button" onClick={onImportSync} disabled={busy}>
        Import Sync
      </button>
      <button type="button" onClick={onOpenProject} disabled={busy}>
        Open Project
      </button>
      <button
        type="button"
        onClick={onSaveProject}
        disabled={busy}
        title={projectPath ?? '另存为 project.json'}
      >
        Save Project
      </button>
      <button
        type="button"
        onClick={onGenerateProxies}
        disabled={busy || proxyBusy || count === 0}
        title="用内置 FFmpeg 生成约 320×180 / 15fps 网格预览代理（写入应用缓存，不改源文件）"
      >
        {proxyBusy ? '生成代理中…' : '生成预览代理'}
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
      <label className="search">
        <span className="visually-hidden">搜索玩家</span>
        <input
          value={query}
          placeholder="搜索玩家"
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <p className="count">{count} POV</p>
    </div>
  )
}
