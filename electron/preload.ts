import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannel } from './channels'
import { DEBUG_METRICS_PUSH, type DebugSnapshot, type FeaturePerfReport } from './debugTypes'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.webm'])

function hasVideoExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return VIDEO_EXTENSIONS.has(lower.slice(dot))
}

const povApi = {
  selectVideoFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannel.selectVideoFiles),
  selectJsonFile: (title: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannel.selectJsonFile, title),
  readTextFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannel.readTextFile, filePath),
  toMediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke(IpcChannel.toMediaUrl, filePath),
  probeMediaDurations: (
    paths: string[]
  ): Promise<Array<{ filePath: string; duration: number | null; error?: string; method?: string }>> =>
    ipcRenderer.invoke(IpcChannel.probeMediaDurations, paths),
  /**
   * Must receive the original File from the drop event, one at a time.
   * Passing File[] across the bridge can strip Electron's path metadata.
   */
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch (error) {
      console.warn('[preload] getPathForFile failed', error)
      return ''
    }
  },
  registerPaths: (paths: string[]): Promise<string[]> => {
    const videos = paths.filter((filePath) => filePath && hasVideoExtension(filePath))
    if (videos.length === 0) return Promise.resolve([])
    return ipcRenderer.invoke(IpcChannel.registerPaths, videos)
  },
  openGpuDebug: (): Promise<boolean> => ipcRenderer.invoke(IpcChannel.openGpuDebug),
  reportFeaturePerf: (report: FeaturePerfReport): void => {
    ipcRenderer.send(IpcChannel.reportFeaturePerf, report)
  },
  getDebugSnapshot: (): Promise<DebugSnapshot> => ipcRenderer.invoke(IpcChannel.getDebugSnapshot),
  onDebugSnapshot: (listener: (snapshot: DebugSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DebugSnapshot): void => {
      listener(snapshot)
    }
    ipcRenderer.on(DEBUG_METRICS_PUSH, handler)
    return () => {
      ipcRenderer.removeListener(DEBUG_METRICS_PUSH, handler)
    }
  }
}

if (!process.contextIsolated) {
  throw new Error('contextIsolation must stay enabled')
}

contextBridge.exposeInMainWorld('povApi', povApi)
