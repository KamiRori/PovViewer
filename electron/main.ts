import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { extname, join } from 'node:path'
import { IpcChannel } from './channels'
import { MediaRegistry } from './mediaRegistry'
import { registerMediaProtocol } from './mediaProtocol'

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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Minecraft POV Viewer',
    backgroundColor: '#12141a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
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
  app.quit()
})
