import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  MARKER_COLORS,
  MARKER_COLOR_LABELS,
  type MarkerFilter
} from '../project/markerColor'
import { COLUMN_OPTIONS, type ColumnCount } from '../project/types'

interface ToolbarProps {
  columns: ColumnCount
  count: number
  busy: boolean
  query: string
  markerFilter: MarkerFilter
  projectPath: string | null
  proxyBusy: boolean
  exportBusy: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onImportPov: () => void
  onImportSync: () => void
  onSaveProject: () => void
  onOpenProject: () => void
  onGenerateProxies: () => void
  onExportSelections: () => void
  onColumns: (columns: ColumnCount) => void
  onOpenGpuDebug: () => void
  onQuery: (query: string) => void
  onMarkerFilter: (filter: MarkerFilter) => void
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
  title,
  shortcut
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  shortcut?: string
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
      <span className="menu-item-label">{children}</span>
      {shortcut ? <span className="menu-item-shortcut">{shortcut}</span> : null}
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

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

export function Toolbar({
  columns,
  count,
  busy,
  query,
  markerFilter,
  projectPath,
  proxyBusy,
  exportBusy,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImportPov,
  onImportSync,
  onSaveProject,
  onOpenProject,
  onGenerateProxies,
  onExportSelections,
  onColumns,
  onOpenGpuDebug,
  onQuery,
  onMarkerFilter
}: ToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filterOpen) return
    function onPointerDown(event: PointerEvent): void {
      const node = searchRef.current
      if (!node) return
      if (event.target instanceof Node && !node.contains(event.target)) {
        setFilterOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setFilterOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [filterOpen])

  const filterLabel =
    markerFilter === null
      ? null
      : markerFilter === 'none'
        ? '无标记'
        : MARKER_COLOR_LABELS[markerFilter]

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
            导入项目
          </MenuItem>
          <div className="menu-sep" role="separator" />
          <MenuItem
            disabled={busy}
            shortcut={`${mod}O`}
            onClick={() => {
              onOpenProject()
            }}
          >
            打开项目
          </MenuItem>
          <MenuItem
            disabled={busy}
            shortcut={`${mod}S`}
            title={
              projectPath
                ? `${projectPath}（有改动时约每 30 秒自动保存）`
                : '另存为 project.json'
            }
            onClick={() => {
              onSaveProject()
            }}
          >
            保存项目
          </MenuItem>
          <div className="menu-sep" role="separator" />
          <MenuItem
            disabled={busy || exportBusy || count === 0}
            title="按各 POV 时间轴上的导出选区裁剪源视频，导出为 mp4 片段"
            onClick={() => {
              onExportSelections()
            }}
          >
            {exportBusy ? '导出视频中…' : '导出选区视频'}
          </MenuItem>
        </MenuGroup>

        <MenuGroup label="编辑">
          <MenuItem
            disabled={!canUndo}
            shortcut={`${mod}Z`}
            onClick={() => {
              onUndo()
            }}
          >
            撤销
          </MenuItem>
          <MenuItem
            disabled={!canRedo}
            shortcut={isMac ? '⇧⌘Z' : 'Ctrl+Y'}
            title={isMac ? undefined : '也可使用 Ctrl+Shift+Z'}
            onClick={() => {
              onRedo()
            }}
          >
            重做
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

      <div className={`search${filterOpen ? ' is-open' : ''}`} ref={searchRef}>
        <label className="search-field">
          <span className="visually-hidden">搜索玩家</span>
          <input
            value={query}
            placeholder="搜索玩家"
            spellCheck={false}
            title="点击展开颜色筛选；输入可按玩家名搜索"
            onFocus={() => setFilterOpen(true)}
            onClick={() => setFilterOpen(true)}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        {filterLabel ? (
          <button
            type="button"
            className={`search-filter-chip${
              markerFilter && markerFilter !== 'none' ? ` marker-${markerFilter}` : ''
            }`}
            title="清除颜色筛选"
            onClick={() => onMarkerFilter(null)}
          >
            {filterLabel}
            <span aria-hidden>×</span>
          </button>
        ) : null}
        {filterOpen ? (
          <div className="search-filter-panel" role="listbox" aria-label="按颜色标记筛选">
            <div className="search-filter-swatches">
              {MARKER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`search-filter-swatch marker-${color}${
                    markerFilter === color ? ' is-active' : ''
                  }`}
                  role="option"
                  aria-selected={markerFilter === color}
                  title={
                    markerFilter === color
                      ? `取消「${MARKER_COLOR_LABELS[color]}」筛选`
                      : `筛选「${MARKER_COLOR_LABELS[color]}」`
                  }
                  aria-label={MARKER_COLOR_LABELS[color]}
                  onClick={() =>
                    onMarkerFilter(markerFilter === color ? null : color)
                  }
                />
              ))}
            </div>
            <div className="search-filter-actions">
              <button
                type="button"
                className={`search-filter-option${markerFilter === null ? ' is-active' : ''}`}
                role="option"
                aria-selected={markerFilter === null}
                onClick={() => onMarkerFilter(null)}
              >
                全部
              </button>
              <button
                type="button"
                className={`search-filter-option${markerFilter === 'none' ? ' is-active' : ''}`}
                role="option"
                aria-selected={markerFilter === 'none'}
                title={markerFilter === 'none' ? '取消「无标记」筛选' : '仅显示无标记'}
                onClick={() => onMarkerFilter(markerFilter === 'none' ? null : 'none')}
              >
                无标记
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="count">{count} 个 POV</p>
    </div>
  )
}
