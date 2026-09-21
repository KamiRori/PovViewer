import { useEffect, useRef, useState } from 'react'
import { ExportProgressDialog } from './components/ExportProgressDialog'
import { PovGrid } from './components/PovGrid'
import { TimelineBar } from './components/TimelineBar'
import { Toolbar } from './components/Toolbar'
import { planExportClips } from './export/planExport'
import { FeaturePerfReporter } from './player/FeaturePerfReporter'
import { usePlaybackArmActions } from './player/playbackArm'
import { useViewUi } from './player/viewUi'
import { parseProjectJson, projectToJson } from './project/projectFile'
import { useProject } from './project/store'
import { parseSyncJson } from './sync/parseSync'
import { usePlayback } from './timeline/store'
import { dataTransferHasFiles, pathsFromDroppedFiles } from './utils/dropFiles'
import { fileNameFromPath } from './utils/playerName'
import type { PlaybackSource } from './project/types'

type ExportPhase = 'running' | 'confirm-cancel' | 'done' | 'aborted'

interface ExportUiState {
  open: boolean
  total: number
  completed: number
  currentName: string
  outputDir: string
  ok: number
  failed: number
  phase: ExportPhase
}

export function App() {
  const {
    state,
    canUndo,
    canRedo,
    undo,
    redo,
    importFiles,
    rename,
    remove,
    setColumns,
    setDuration,
    setDurationsByPath,
    setOffset,
    setPlaybackSource,
    setMuted,
    setMarkerColor,
    addExportRange,
    updateExportRange,
    removeExportRange,
    reorder,
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
  const [exportBusy, setExportBusy] = useState(false)
  const [exportUi, setExportUi] = useState<ExportUiState>({
    open: false,
    total: 0,
    completed: 0,
    currentName: '',
    outputDir: '',
    ok: 0,
    failed: 0,
    phase: 'running'
  })
  const exportAbortRef = useRef(false)
  const [proxyEpoch, setProxyEpoch] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const dragDepthRef = useRef(0)
  const visible = state.povs.filter((pov) => pov.enabled)

  useEffect(() => {
    return window.povApi.onProxyProgress(({ completed, total, cacheDir, status, error }) => {
      const where = cacheDir ? ` → ${cacheDir}` : ''
      const detail = status === 'error' && error ? `（失败：${error.slice(0, 80)}）` : ''
      setHint(`正在生成网格预览代理（${completed}/${total}）${where}${detail}`)
    })
  }, [])

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
      const filePath = await window.povApi.selectJsonFile('打开项目')
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
      resync()
      const missingCount = withMissing.filter((pov) => pov.missing).length
      setHint(
        missingCount > 0
          ? `已打开项目（${missingCount} 个文件缺失）`
          : `已打开 ${fileNameFromPath(filePath)}`
      )
    } catch (error) {
      console.error('[project] open failed', error)
      setHint('打开项目失败')
    } finally {
      setBusy(false)
    }
  }

  const saveProjectRef = useRef(onSaveProject)
  const openProjectRef = useRef(onOpenProject)
  saveProjectRef.current = onSaveProject
  openProjectRef.current = onOpenProject

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 's') {
        event.preventDefault()
        if (!busy) void saveProjectRef.current()
        return
      }

      if (mod && key === 'o') {
        event.preventDefault()
        if (!busy) void openProjectRef.current()
        return
      }

      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }

      if ((mod && key === 'z' && event.shiftKey) || (mod && key === 'y')) {
        event.preventDefault()
        redo()
        return
      }

      if (typing) return

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
        const mutedTarget = state.povs.find((pov) => pov.id === targetId)
        if (!mutedTarget) return
        setMuted(targetId, !mutedTarget.muted)
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
  }, [busy, redo, setMuted, state.povs, toggle, undo, view])

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
      setHint('定位文件失败')
    } finally {
      setBusy(false)
    }
  }

  async function onGenerateProxies(): Promise<void> {
    const paths = state.povs.filter((pov) => !pov.missing).map((pov) => pov.filePath)
    if (paths.length === 0) return
    setProxyBusy(true)
    let cacheDir = ''
    try {
      cacheDir = await window.povApi.getProxyCacheDir()
    } catch {
      cacheDir = ''
    }
    setHint(
      cacheDir
        ? `正在生成网格预览代理（0/${paths.length}）→ ${cacheDir}`
        : `正在生成网格预览代理（0/${paths.length}）…`
    )
    try {
      const results = await window.povApi.ensurePreviewProxies(paths)
      const ready = results.filter((entry) => entry.status === 'ready').length
      const failed = results.filter((entry) => entry.status === 'error' || entry.status === 'missing')
      const firstError = failed.find((entry) => entry.error)?.error
      setHint(
        failed.length > 0
          ? `预览代理：${ready} 就绪，${failed.length} 失败${firstError ? `（${firstError.slice(0, 120)}）` : ''}${cacheDir ? ` @ ${cacheDir}` : ''}`
          : `预览代理已就绪：${ready} 个${cacheDir ? ` @ ${cacheDir}` : ''}`
      )
      setProxyEpoch((value) => value + 1)
    } catch (error) {
      console.error('[proxy] ensure failed', error)
      setHint(`生成预览代理失败${error instanceof Error ? `：${error.message}` : ''}`)
    } finally {
      setProxyBusy(false)
    }
  }

  async function onExportSelections(): Promise<void> {
    const plans = planExportClips(state.povs)
    if (plans.length === 0) {
      setHint('没有可导出的选区。请先在时间轴上为 POV 创建导出选区。')
      return
    }

    let outputDir: string | null
    try {
      outputDir = await window.povApi.selectExportDirectory()
    } catch (error) {
      console.error('[export] select directory failed', error)
      setHint('选择导出目录失败')
      return
    }
    if (!outputDir) return

    playback.pause()
    exportAbortRef.current = false
    setExportBusy(true)
    setHint(null)
    setExportUi({
      open: true,
      total: plans.length,
      completed: 0,
      currentName: plans[0]?.outputName ?? '',
      outputDir,
      ok: 0,
      failed: 0,
      phase: 'running'
    })

    let ok = 0
    let failed = 0
    let aborted = false

    try {
      await window.povApi.beginExportVideoClips()
      for (const [index, plan] of plans.entries()) {
        if (exportAbortRef.current) {
          aborted = true
          break
        }
        setExportUi((prev) => ({
          ...prev,
          currentName: plan.outputName,
          completed: index,
          ok,
          failed,
          phase: prev.phase === 'confirm-cancel' ? 'confirm-cancel' : 'running'
        }))
        try {
          const result = await window.povApi.exportVideoClip({
            sourcePath: plan.sourcePath,
            outputDir,
            outputName: plan.outputName,
            videoStart: plan.videoStart,
            videoEnd: plan.videoEnd
          })
          if (result.cancelled || exportAbortRef.current) {
            aborted = true
            break
          }
          ok += 1
        } catch (error) {
          if (exportAbortRef.current) {
            aborted = true
            break
          }
          console.error('[export] clip failed', plan.outputName, error)
          failed += 1
        }
        setExportUi((prev) => ({
          ...prev,
          completed: index + 1,
          ok,
          failed,
          phase: prev.phase === 'confirm-cancel' ? 'confirm-cancel' : 'running'
        }))
      }
    } catch (error) {
      console.error('[export] failed', error)
      setExportBusy(false)
      setExportUi((prev) => ({ ...prev, open: false, phase: 'done', currentName: '' }))
      setHint(`导出失败${error instanceof Error ? `：${error.message}` : ''}`)
      return
    }

    setExportBusy(false)
    setExportUi((prev) => ({
      ...prev,
      open: false,
      completed: aborted ? prev.completed : plans.length,
      ok,
      failed,
      phase: aborted ? 'aborted' : 'done',
      currentName: ''
    }))
    if (aborted) {
      setHint(
        `导出已终止：成功 ${ok}${failed > 0 ? `，失败 ${failed}` : ''} → ${outputDir}`
      )
    } else if (failed === 0) {
      setHint(`导出完成：${ok} 个片段 → ${outputDir}`)
    } else {
      setHint(`导出结束：${ok} 成功，${failed} 失败 → ${outputDir}`)
    }
  }

  function onExportRequestClose(): void {
    setExportUi((prev) =>
      prev.phase === 'running' || prev.phase === 'confirm-cancel'
        ? { ...prev, phase: 'confirm-cancel' }
        : prev
    )
  }

  function onExportDismissConfirm(): void {
    setExportUi((prev) =>
      prev.phase === 'confirm-cancel' ? { ...prev, phase: 'running' } : prev
    )
  }

  async function onExportConfirmCancel(): Promise<void> {
    exportAbortRef.current = true
    setExportUi((prev) => ({
      ...prev,
      phase: 'running',
      currentName: '正在终止…'
    }))
    try {
      await window.povApi.cancelExportVideoClip()
    } catch (error) {
      console.error('[export] cancel failed', error)
    }
  }

  function onExportDismiss(): void {
    setExportUi((prev) => ({ ...prev, open: false }))
  }

  async function onImportSync(): Promise<void> {
    setBusy(true)
    setHint(null)
    clearSyncReport()
    try {
      const filePath = await window.povApi.selectJsonFile('导入项目')
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
      setHint('导入项目失败')
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
        setHint('未能导入拖入的文件。请使用 .mp4 / .mkv / .mov / .webm，或改用「文件 → 导入 POV」。')
      }
    } catch (error) {
      console.error('[drop] import failed', error)
      setHint('拖拽导入失败，请改用「文件 → 导入 POV」。')
    } finally {
      setBusy(false)
    }
  }

  function onOffsetChange(id: string, offset: number): void {
    setOffset(id, offset)
    resync()
  }

  function onPlaybackSourceChange(id: string, playbackSource: PlaybackSource): void {
    setPlaybackSource(id, playbackSource)
  }

  function onRemove(id: string): void {
    if (view.focusId === id) view.exitFocus()
    if (view.activeId === id) view.setActiveId(null)
    forgetArm(id)
    remove(id)
  }

  function onToggleMute(id: string): void {
    const pov = state.povs.find((entry) => entry.id === id)
    if (!pov) return
    setMuted(id, !pov.muted)
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
          markerFilter={view.markerFilter}
          projectPath={state.projectPath}
          proxyBusy={proxyBusy}
          exportBusy={exportBusy}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
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
          onExportSelections={() => {
            void onExportSelections()
          }}
          onColumns={setColumns}
          onOpenGpuDebug={() => {
            void window.povApi.openGpuDebug()
          }}
          onQuery={view.setQuery}
          onMarkerFilter={view.setMarkerFilter}
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
            <p>点击「文件 → 导入 POV」，或把视频文件拖进窗口。也可用「打开项目」加载 project.json。</p>
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
            onPlaybackSource={onPlaybackSourceChange}
            onRemove={onRemove}
            onDuration={setDuration}
            onToggleMute={onToggleMute}
            onLocate={(id) => {
              void onLocateFile(id)
            }}
            onReorder={reorder}
            onMarkerColor={setMarkerColor}
          />
        )}
      </main>
      <TimelineBar
        povs={visible}
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
        onAddExportRange={addExportRange}
        onUpdateExportRange={updateExportRange}
        onRemoveExportRange={removeExportRange}
        onReorder={reorder}
      />
      {dragging ? <div className="drop-overlay">松开以导入视频</div> : null}
      <ExportProgressDialog
        open={exportUi.open}
        total={exportUi.total}
        completed={exportUi.completed}
        currentName={exportUi.currentName}
        outputDir={exportUi.outputDir}
        ok={exportUi.ok}
        failed={exportUi.failed}
        phase={exportUi.phase}
        onRequestClose={onExportRequestClose}
        onConfirmCancel={() => {
          void onExportConfirmCancel()
        }}
        onDismissConfirm={onExportDismissConfirm}
        onDismiss={onExportDismiss}
      />
    </div>
  )
}
