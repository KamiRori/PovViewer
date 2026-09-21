import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannel } from './channels'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.webm'])

function hasVideoExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return VIDEO_EXTENSIONS.has(lower.slice(dot))
}

const povApi = {
  selectVideoFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannel.selectVideoFiles),
  toMediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke(IpcChannel.toMediaUrl, filePath),
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
  }
}

if (!process.contextIsolated) {
  throw new Error('contextIsolation must stay enabled')
}

contextBridge.exposeInMainWorld('povApi', povApi)
