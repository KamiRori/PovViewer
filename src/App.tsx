import { useEffect, useRef, useState } from 'react'
import { PovGrid } from './components/PovGrid'
import { TimelineBar } from './components/TimelineBar'
import { Toolbar } from './components/Toolbar'
import { useProject } from './project/store'
import { usePlayback } from './timeline/store'
import { dataTransferHasFiles, pathsFromDroppedFiles } from './utils/dropFiles'

export function App() {
  const { state, importFiles, rename, remove, setColumns, setDuration } = useProject()
  const playback = usePlayback()
  const { toggle } = playback
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropHint, setDropHint] = useState<string | null>(null)
  const dragDepthRef = useRef(0)
  const visible = state.povs.filter((pov) => pov.enabled)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // Keep drops from being swallowed by Electron / the browser default navigation.
  useEffect(() => {
    const block = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return
      event.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  async function onImport(): Promise<void> {
    setImporting(true)
    setDropHint(null)
    try {
      const paths = await window.povApi.selectVideoFiles()
      if (paths.length > 0) importFiles(paths)
    } finally {
      setImporting(false)
    }
  }

  async function onDropFiles(fileList: FileList | null): Promise<void> {
    dragDepthRef.current = 0
    setDragging(false)
    if (!fileList || fileList.length === 0) return
    setImporting(true)
    setDropHint(null)
    try {
      const paths = await pathsFromDroppedFiles(fileList)
      if (paths.length > 0) {
        importFiles(paths)
      } else {
        setDropHint('未能导入拖入的文件。请使用 .mp4 / .mkv / .mov / .webm，或改用 Import POV。')
      }
    } catch (error) {
      console.error('[drop] import failed', error)
      setDropHint('拖拽导入失败，请改用 Import POV。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className={`app${dragging ? ' app-dragging' : ''}`}
      onDragEnter={(event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return
        event.preventDefault()
        dragDepthRef.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void onDropFiles(event.dataTransfer?.files ?? null)
      }}
    >
      <header className="topbar">
        <h1>Minecraft POV Viewer</h1>
        <Toolbar
          columns={state.columns}
          count={visible.length}
          importing={importing}
          onImport={() => {
            void onImport()
          }}
          onColumns={setColumns}
        />
      </header>
      <main>
        {visible.length === 0 ? (
          <section className="empty">
            <h2>还没有 POV</h2>
            <p>点击 Import POV，或把视频文件拖进窗口。</p>
            {dropHint ? <p className="drop-hint">{dropHint}</p> : null}
          </section>
        ) : (
          <>
            {dropHint ? <p className="drop-hint drop-hint-inline">{dropHint}</p> : null}
            <PovGrid
              povs={visible}
              columns={state.columns}
              masterTime={playback.state.masterTime}
              playing={playback.state.playing}
              playbackRate={playback.state.playbackRate}
              seekGeneration={playback.state.seekGeneration}
              onRename={rename}
              onRemove={remove}
              onDuration={setDuration}
            />
          </>
        )}
      </main>
      <TimelineBar
        masterTime={playback.state.masterTime}
        range={playback.range}
        playing={playback.state.playing}
        playbackRate={playback.state.playbackRate}
        disabled={playback.disabled}
        onToggle={playback.toggle}
        onNudge={playback.nudge}
        onScrub={playback.scrub}
        onCommitScrub={playback.commitScrub}
        onRate={playback.setRate}
        onResync={playback.resync}
      />
      {dragging ? <div className="drop-overlay">松开以导入视频</div> : null}
    </div>
  )
}
