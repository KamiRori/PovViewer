import { useEffect, useRef, useState } from 'react'
import { PovGrid } from './components/PovGrid'
import { TimelineBar } from './components/TimelineBar'
import { Toolbar } from './components/Toolbar'
import { FeaturePerfReporter } from './player/FeaturePerfReporter'
import { usePlaybackArmActions } from './player/playbackArm'
import { useViewUi } from './player/viewUi'
import { parseProjectJson, projectToJson } from './project/projectFile'
import { useProject } from './project/store'
import { parseSyncJson } from './sync/parseSync'
import { usePlayback } from './timeline/store'
import { dataTransferHasFiles, pathsFromDroppedFiles } from './utils/dropFiles'
import { fileNameFromPath } from './utils/playerName'

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
    soloAudio,
    applySyncResults,
    clearSyncReport,
    loadProject,
    setProjectPath,
    setMissing,
    relocate
  } = useProject()
  const playback = usePlayback()
  const view = useViewUi()
  const { forget: forgetArm, clearAll: clearArms } = usePlaybackArmActions()
  const { toggle, resync } = playback
  const [busy, setBusy] = useState(false)
  const [proxyBusy, setProxyBusy] = useState(false)
  const [proxyEpoch, setProxyEpoch] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const dragDepthRef = useRef(0)
  const visible = state.povs.filter((pov) => pov.enabled)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
        return
      }

      if (event.key === 'Escape' && view.mode === 'focus') {
        event.preventDefault()
        view.exitFocus()
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        const targetId = view.mode === 'focus' ? view.focusId : view.activeId
        if (!targetId) return
        if (view.soloId === targetId) view.setSolo(null)
        else {
          view.setSolo(targetId)
          soloAudio(targetId)
        }
        return
      }

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (view.mode === 'focus' && view.focusId) {
          const node = document.querySelector('.pov-card.is-focus-main')
          if (node instanceof HTMLElement) {
            void (document.fullscreenElement ? document.exitFullscreen() : node.requestFullscreen())
          }
          return
        }
        if (view.activeId) view.enterFocus(view.activeId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [soloAudio, toggle, view])

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

  useEffect(() => {
    if (view.focusId && !state.povs.some((pov) => pov.id === view.focusId)) {
      view.exitFocus()
    }
  }, [state.povs, view.focusId, view.exitFocus])

  async function applyFastDurations(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    setHint(`正在读取时长（${paths.length}）…`)
    try {
      // Parallel moov/ffmpeg duration probes — do not wait on poster/proxy encodes.
      const results = await window.povApi.probeMediaDurations(paths)
      const ready = results
        .filter((entry) => entry.duration !== null && Number.isFinite(entry.duration))
        .map((entry) => ({ filePath: entry.filePath, duration: entry.duration as number }))
      if (ready.length > 0) setDurationsByPath(ready)
      for (const entry of ready) {
        void window.povApi.ensurePoster(entry.filePath, 1)
      }
      const failed = paths.length - ready.length
      setHint(
        failed > 0
          ? `时长就绪 ${ready.length}/${paths.length}（${failed} 失败）。长视频请点「生成预览代理」后再流畅网格播放。`
          : `时长就绪 ${ready.length}/${paths.length}。长视频网格流畅播放请点「生成预览代理」。`
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

  async function onSaveProject(): Promise<void> {
    setBusy(true)
    setHint(null)
    try {
      let target = state.projectPath
      if (!target) {
        target = await window.povApi.saveJsonFile('project.json')
        if (!target) return
      }
      await window.povApi.writeTextFile(target, projectToJson(state.povs))
      setProjectPath(target)
      setHint(`已保存 ${fileNameFromPath(target)}`)
    } catch (error) {
      console.error('[project] save failed', error)
      setHint('保存项目失败')
    } finally {
      setBusy(false)
    }
  }

  async function onOpenProject(): Promise<void> {
    setBusy(true)
    setHint(null)
    clearSyncReport()
    try {
      const filePath = await window.povApi.selectJsonFile('Open Project')
      if (!filePath) return
      const text = await window.povApi.readTextFile(filePath)
      const parsed = parseProjectJson(text)
      if (!parsed.ok) {
        setHint(parsed.error)
        return
      }

      const paths = parsed.runtime.map((pov) => pov.filePath)
      await window.povApi.registerPaths(paths)

      const withMissing = await Promise.all(
        parsed.runtime.map(async (pov) => ({
          ...pov,
          missing: !(await window.povApi.pathExists(pov.filePath))
        }))
      )

      loadProject(withMissing, filePath)
      clearArms()
      view.exitFocus()
      view.setActiveId(null)
      view.setSolo(null)
      resync()
      const missingCount = withMissing.filter((pov) => pov.missing).length
      setHint(
        missingCount > 0
          ? `已打开项目（${missingCount} 个 Missing File）`
          : `已打开 ${fileNameFromPath(filePath)}`
      )
    } catch (error) {
      console.error('[project] open failed', error)
      setHint('打开项目失败')
    } finally {
      setBusy(false)
    }
  }

  async function onLocateFile(id: string): Promise<void> {
    const pov = state.povs.find((entry) => entry.id === id)
    if (!pov) return
    setBusy(true)
    setHint(null)
    try {
      const nextPath = await window.povApi.selectReplacementFile(pov.filePath)
      if (!nextPath) return
      await window.povApi.registerPaths([nextPath])
      relocate(id, nextPath)
      setMissing(id, false)
      resync()
      setHint(`已重新定位 ${fileNameFromPath(nextPath)}`)
    } catch (error) {
      console.error('[project] locate failed', error)
      setHint('Locate File 失败')
    } finally {
      setBusy(false)
    }
  }

  async function onGenerateProxies(): Promise<void> {
    const paths = state.povs.filter((pov) => !pov.missing).map((pov) => pov.filePath)
    if (paths.length === 0) return
    setProxyBusy(true)
    setHint(`正在生成网格预览代理（0/${paths.length}）…`)
    try {
      const results = await window.povApi.ensurePreviewProxies(paths)
      const ready = results.filter((entry) => entry.status === 'ready').length
      const failed = results.filter((entry) => entry.status === 'error' || entry.status === 'missing')
        .length
      setHint(
        failed > 0
          ? `预览代理：${ready} 就绪，${failed} 失败（写入应用缓存，未改源文件）`
          : `预览代理已就绪：${ready} 个（网格将自动改用低分辨率预览）`
      )
      setProxyEpoch((value) => value + 1)
    } catch (error) {
      console.error('[proxy] ensure failed', error)
      setHint('生成预览代理失败')
    } finally {
      setProxyBusy(false)
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

  function onRemove(id: string): void {
    if (view.focusId === id) view.exitFocus()
    if (view.activeId === id) view.setActiveId(null)
    if (view.soloId === id) view.setSolo(null)
    forgetArm(id)
    remove(id)
  }

  const unmatched =
    state.lastSyncUnmatched.length > 0
      ? `未匹配：${state.lastSyncUnmatched.join(', ')}`
      : null

  return (
    <div
      className={`app${dragging ? ' app-dragging' : ''}${view.mode === 'focus' ? ' app-focus' : ''}`}
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
          query={view.query}
          projectPath={state.projectPath}
          proxyBusy={proxyBusy}
          onImportPov={() => {
            void onImportPov()
          }}
          onImportSync={() => {
            void onImportSync()
          }}
          onSaveProject={() => {
            void onSaveProject()
          }}
          onOpenProject={() => {
            void onOpenProject()
          }}
          onGenerateProxies={() => {
            void onGenerateProxies()
          }}
          onColumns={setColumns}
          onOpenGpuDebug={() => {
            void window.povApi.openGpuDebug()
          }}
          onQuery={view.setQuery}
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
            <p>点击 Import POV，或把视频文件拖进窗口。也可用 Open Project 打开 project.json。</p>
          </section>
        ) : (
          <PovGrid
            povs={visible}
            columns={state.columns}
            masterTime={playback.state.masterTime}
            playing={playback.state.playing}
            playbackRate={playback.state.playbackRate}
            seekGeneration={playback.state.seekGeneration}
            proxyEpoch={proxyEpoch}
            onRename={rename}
            onOffset={onOffsetChange}
            onRemove={onRemove}
            onDuration={setDuration}
            onSoloAudio={soloAudio}
            onLocate={(id) => {
              void onLocateFile(id)
            }}
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
