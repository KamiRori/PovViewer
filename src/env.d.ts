/// <reference types="vite/client" />

export interface PovApi {
  selectVideoFiles: () => Promise<string[]>
  toMediaUrl: (filePath: string) => Promise<string>
  getPathForFile: (file: File) => string
  registerPaths: (paths: string[]) => Promise<string[]>
}

declare global {
  interface Window {
    povApi: PovApi
  }
}
