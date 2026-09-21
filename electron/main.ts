import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { access, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { IpcChannel } from './channels'
import { collectDebugSnapshot, setLatestFeatureReport } from './debugMetrics'
import { DEBUG_METRICS_PUSH, type FeaturePerfReport } from './debugTypes'
import { probeFileDurations } from './mediaDuration'
import { MediaRegistry } from './mediaRegistry'
import { registerMediaProtocol } from './mediaProtocol'
import { PosterService } from './posterService'
import { ProxyService } from './proxyService'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.webm'])

function isVideoPath(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(filePath).toLowerCase())
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pov',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const mediaRegistry = new MediaRegistry()
const posterService = new PosterService()
const proxyService = new ProxyService()
let mainWindow: BrowserWindow | null = null
let debugWindow: BrowserWindow | null = null
let debugPushTimer: NodeJS.Timeout | null = null

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Minecraft POV Viewer',
    backgroundColor: '#12141a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  mainWindow = window
  return window
}

function stopDebugPush(): void {
  if (debugPushTimer) {
    clearInterval(debugPushTimer)
    debugPushTimer = null
  }
}

function startDebugPush(target: BrowserWindow): void {
  stopDebugPush()
  const push = async () => {
    if (target.isDestroyed()) {
      stopDebugPush()
      return
    }
    try {
      const snapshot = await collectDebugSnapshot()
      target.webContents.send(DEBUG_METRICS_PUSH, snapshot)
    } catch (error) {
      console.warn('[debug] snapshot failed', error)
    }
  }
  void push()
  debugPushTimer = setInterval(() => {
    void push()
  }, 500)
}

function openGpuDebugWindow(): void {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus()
    startDebugPush(debugWindow)
    return
  }

  const window = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    show: false,
    title: 'GPU / 功能占用调试',
    backgroundColor: '#101218',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/debug.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/debug.html'))
  }

  window.on('closed', () => {
    if (debugWindow === window) debugWindow = null
    stopDebugPush()
  })

  debugWindow = window
  startDebugPush(window)
}

function isFeaturePerfReport(value: unknown): value is FeaturePerfReport {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.ts === 'number' && typeof row.playbackMode === 'string'
}

function registerIpc(): void {
  ipcMain.handle(IpcChannel.selectVideoFiles, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import POV',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm'] }]
    })
    if (result.canceled) return []
    const paths = result.filePaths.map((filePath) => mediaRegistry.register(filePath).absolutePath)
    console.log(`[media] registered ${paths.length} file(s)`)
    return paths
  })

  ipcMain.handle(IpcChannel.selectJsonFile, async (_event, title: unknown) => {
    const result = await dialog.showOpenDialog({
      title: typeof title === 'string' && title.trim() ? title : 'Open JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannel.readTextFile, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('invalid path')
    }
    return readFile(filePath, 'utf8')
  })

  ipcMain.handle(IpcChannel.writeTextFile, async (_event, filePath: unknown, text: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('invalid path')
    }
    if (typeof text !== 'string') {
      throw new Error('invalid text')
    }
    await writeFile(filePath, text, 'utf8')
    return true
  })

  ipcMain.handle(IpcChannel.pathExists, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') return false
    try {
      await access(filePath, fsConstants.F_OK)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(IpcChannel.saveJsonFile, async (_event, defaultName: unknown) => {
    const result = await dialog.showSaveDialog({
      title: 'Save Project',
      defaultPath: typeof defaultName === 'string' && defaultName.trim() ? defaultName : 'project.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle(IpcChannel.selectReplacementFile, async (_event, currentPath: unknown) => {
    const hint =
      typeof currentPath === 'string' && currentPath.trim() ? basename(currentPath) : undefined
    const result = await dialog.showOpenDialog({
      title: 'Locate File',
      properties: ['openFile'],
      defaultPath: typeof currentPath === 'string' ? currentPath : undefined,
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm'] }],
      message: hint ? `Locate replacement for ${hint}` : undefined
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    if (!filePath || !isVideoPath(filePath)) return null
    return mediaRegistry.register(filePath).absolutePath
  })

  ipcMain.handle(IpcChannel.registerPaths, (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return []
    const registered: string[] = []
    for (const entry of paths) {
      if (typeof entry !== 'string' || entry.trim() === '') continue
      if (!isVideoPath(entry)) continue
      registered.push(mediaRegistry.register(entry).absolutePath)
    }
    console.log(`[media] registered ${registered.length} dropped file(s)`)
    return registered
  })

  ipcMain.handle(IpcChannel.toMediaUrl, (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('invalid path')
    }
    const url = mediaRegistry.urlFor(filePath)
    if (!url) {
      console.warn('[media] toMediaUrl rejected unregistered path')
      throw new Error('path is not registered')
    }
    return url
  })

  ipcMain.handle(IpcChannel.probeMediaDurations, async (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return []
    const list = paths.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    // Caller often probes one path at a time for progressive UI; keep concurrency low when batched.
    return probeFileDurations(list, Math.min(2, Math.max(1, list.length)))
  })

  ipcMain.handle(IpcChannel.ensurePoster, async (_event, filePath: unknown, atSeconds: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('invalid path')
    }
    const at = typeof atSeconds === 'number' && Number.isFinite(atSeconds) ? atSeconds : 1
    const status = await posterService.ensurePoster(filePath, at)
    if (status.status === 'ready' && status.posterPath) {
      mediaRegistry.register(status.posterPath)
    }
    return {
      filePath: status.filePath,
      posterPath: status.posterPath,
      status: status.status,
      dataUrl: status.dataUrl,
      url: status.posterPath ? mediaRegistry.urlFor(status.posterPath) : null,
      error: status.error
    }
  })

  ipcMain.handle(IpcChannel.openGpuDebug, () => {
    openGpuDebugWindow()
    return true
  })

  ipcMain.on(IpcChannel.reportFeaturePerf, (_event, payload: unknown) => {
    if (!isFeaturePerfReport(payload)) return
    setLatestFeatureReport(payload)
  })

  ipcMain.handle(IpcChannel.getDebugSnapshot, async () => collectDebugSnapshot())

  ipcMain.handle(IpcChannel.ensurePreviewProxy, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('invalid path')
    }
    const status = await proxyService.ensurePreview(filePath)
    if (status.status === 'ready' && status.proxyPath) {
      mediaRegistry.register(status.proxyPath)
    }
    return status
  })

  ipcMain.handle(IpcChannel.getPreviewProxyStatus, (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') return null
    return proxyService.getStatus(filePath, 'preview')
  })

  ipcMain.handle(IpcChannel.ensurePreviewProxies, async (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return []
    const jobs = paths
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .map(async (entry) => {
        const status = await proxyService.ensurePreview(entry)
        if (status.status === 'ready' && status.proxyPath) {
          mediaRegistry.register(status.proxyPath)
        }
        return status
      })
    return Promise.all(jobs)
  })
}

app.whenReady().then(() => {
  registerMediaProtocol(mediaRegistry)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDebugPush()
  app.quit()
})
