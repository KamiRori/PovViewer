import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
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

const MenuCloseContext = createContext<() => void>(() => undefined)

interface MenuGroupProps {
  label: string
  children: ReactNode
}

function MenuGroup({ label, children }: MenuGroupProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const node = rootRef.current
      if (!node) return
      if (event.target instanceof Node && !node.contains(event.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`menu-group${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="menu-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <MenuCloseContext.Provider value={close}>
          <div id={menuId} className="menu-panel" role="menu">
            {children}
          </div>
        </MenuCloseContext.Provider>
      ) : null}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled,
  title
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  const close = useContext(MenuCloseContext)
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={() => {
        onClick()
        close()
      }}
    >
      {children}
    </button>
  )
}

function MenuColumns({
  columns,
  onColumns
}: {
  columns: ColumnCount
  onColumns: (columns: ColumnCount) => void
}) {
  const close = useContext(MenuCloseContext)
  return (
    <>
      {COLUMN_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className="menu-column"
          aria-pressed={option === columns}
          onClick={() => {
            onColumns(option)
            close()
          }}
        >
          {option}
        </button>
      ))}
    </>
  )
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
      <nav className="menubar" aria-label="主菜单">
        <MenuGroup label="文件">
          <MenuItem
            disabled={busy}
            onClick={() => {
              onImportPov()
            }}
          >
            导入 POV
          </MenuItem>
          <MenuItem
            disabled={busy}
            onClick={() => {
              onImportSync()
            }}
          >
            导入同步
          </MenuItem>
          <div className="menu-sep" role="separator" />
          <MenuItem
            disabled={busy}
            onClick={() => {
              onOpenProject()
            }}
          >
            打开项目
          </MenuItem>
          <MenuItem
            disabled={busy}
            title={projectPath ?? '另存为 project.json'}
            onClick={() => {
              onSaveProject()
            }}
          >
            保存项目
          </MenuItem>
        </MenuGroup>

        <MenuGroup label="工具">
          <MenuItem
            disabled={busy || proxyBusy || count === 0}
            title="后台生成约 320×180 / 15fps 预览代理。多小时长视频建议先生成，网格播放更流畅（不改源文件）"
            onClick={() => {
              onGenerateProxies()
            }}
          >
            {proxyBusy ? '生成代理中…' : '生成预览代理'}
          </MenuItem>
          <MenuItem
            title="打开独立窗口查看进程与功能活动指标"
            onClick={() => {
              onOpenGpuDebug()
            }}
          >
            GPU 调试
          </MenuItem>
        </MenuGroup>

        <MenuGroup label="视图">
          <div className="menu-section-label">网格列数</div>
          <div className="menu-columns" role="group" aria-label="列数">
            <MenuColumns columns={columns} onColumns={onColumns} />
          </div>
        </MenuGroup>
      </nav>

      <label className="search">
        <span className="visually-hidden">搜索玩家</span>
        <input
          value={query}
          placeholder="搜索玩家"
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <p className="count">{count} 个 POV</p>
    </div>
  )
}
