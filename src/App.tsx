import { useEffect, useRef, useState } from 'react'
import { PovGrid } from './components/PovGrid'
import { TimelineBar } from './components/TimelineBar'
import { Toolbar } from './components/Toolbar'
import { FeaturePerfReporter } from './player/FeaturePerfReporter'
import { useProject } from './project/store'
import { parseSyncJson } from './sync/parseSync'
import { usePlayback } from './timeline/store'
import { dataTransferHasFiles, pathsFromDroppedFiles } from './utils/dropFiles'

export function App() {
  const {
    state,
    importFiles,
    rename,
    remove,
    setColumns,
    setDuration,
    setDurationsByPath,
    setOffset,
    applySyncResults,
    clearSyncReport
  } = useProject()
  const playback = usePlayback()
  const { toggle, resync } = playback
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
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

  async function applyFastDurations(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    let ready = 0
    let failed = 0
    setHint(`正在读取时长 0/${paths.length}…`)
    try {
      // One file at a time so each card leaves「读取中」as soon as its moov/ffmpeg probe finishes.
      for (let index = 0; index < paths.length; index += 1) {
        const filePath = paths[index]
        setHint(`正在读取时长 ${index + 1}/${paths.length}…`)
        const results = await window.povApi.probeMediaDurations([filePath])
        const entry = results[0]
        if (entry?.duration !== null && entry?.duration !== undefined && Number.isFinite(entry.duration)) {
          setDurationsByPath([{ filePath: entry.filePath, duration: entry.duration }])
          ready += 1
        } else {
          failed += 1
          console.warn('[media] duration probe missed', filePath, entry?.error, entry?.method)
        }
      }
      setHint(
        failed > 0
          ? `时长就绪 ${ready}/${paths.length}（${failed} 个失败，可点选播放时再试）`
          : `时长就绪 ${ready}/${paths.length}`
      )
    } catch (error) {
      console.error('[media] probe durations failed', error)
      setHint('读取时长失败')
    }
  }

  async function onImportPov(): Promise<void> {
    setBusy(true)
    setHint(null)
    try {
      const paths = await window.povApi.selectVideoFiles()
      if (paths.length === 0) return
      importFiles(paths)
      await applyFastDurations(paths)
    } finally {
      setBusy(false)
    }
  }

  async function onImportSync(): Promise<void> {
    setBusy(true)
    setHint(null)
    clearSyncReport()
    try {
      const filePath = await window.povApi.selectJsonFile('Import Sync')
      if (!filePath) return
      const text = await window.povApi.readTextFile(filePath)
      const parsed = parseSyncJson(text)
      if (!parsed.ok) {
        setHint(parsed.error)
        return
      }
      applySyncResults(parsed.results)
      resync()
      setHint(`已应用 ${parsed.results.length} 条同步数据`)
    } catch (error) {
      console.error('[sync] import failed', error)
      setHint('导入 sync.json 失败')
    } finally {
      setBusy(false)
    }
  }

  async function onDropFiles(fileList: FileList | null): Promise<void> {
    dragDepthRef.current = 0
    setDragging(false)
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    setHint(null)
    try {
      const paths = await pathsFromDroppedFiles(fileList)
      if (paths.length > 0) {
        importFiles(paths)
        await applyFastDurations(paths)
      } else {
        setHint('未能导入拖入的文件。请使用 .mp4 / .mkv / .mov / .webm，或改用 Import POV。')
      }
    } catch (error) {
      console.error('[drop] import failed', error)
      setHint('拖拽导入失败，请改用 Import POV。')
    } finally {
      setBusy(false)
    }
  }

  function onOffsetChange(id: string, offset: number): void {
    setOffset(id, offset)
    resync()
  }

  const unmatched =
    state.lastSyncUnmatched.length > 0
      ? `未匹配：${state.lastSyncUnmatched.join(', ')}`
      : null

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
          busy={busy}
          onImportPov={() => {
            void onImportPov()
          }}
          onImportSync={() => {
            void onImportSync()
          }}
          onColumns={setColumns}
          onOpenGpuDebug={() => {
            void window.povApi.openGpuDebug()
          }}
        />
      </header>
      <FeaturePerfReporter playing={playback.state.playing} />
      <main>
        {hint || unmatched ? (
          <div className="banner-row">
            {hint ? <p className="drop-hint drop-hint-inline">{hint}</p> : null}
            {unmatched ? (
              <p className="sync-unmatched">
                {unmatched}
                <button type="button" className="text-button" onClick={clearSyncReport}>
                  关闭
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        {visible.length === 0 ? (
          <section className="empty">
            <h2>还没有 POV</h2>
            <p>点击 Import POV，或把视频文件拖进窗口。导入后可用 Import Sync 应用 sync.json。</p>
          </section>
        ) : (
          <PovGrid
            povs={visible}
            columns={state.columns}
            masterTime={playback.state.masterTime}
            playing={playback.state.playing}
            playbackRate={playback.state.playbackRate}
            seekGeneration={playback.state.seekGeneration}
            onRename={rename}
            onOffset={onOffsetChange}
            onRemove={remove}
            onDuration={setDuration}
          />
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
