export interface ProxyStatusDto {
  kind: 'preview'
  status: 'ready' | 'pending' | 'error' | 'missing'
  sourcePath: string
  proxyPath: string | null
  error?: string
}

export interface FeaturePerfReport {
  ts: number
  playbackMode: 'continuous' | 'sampled'
  preset: string
  maxFps: number
  playing: boolean
  armedCount: number
  sampleSeeksPerSec: number
  continuousPlayCallsPerSec: number
  hardSeeksPerSec: number
  note: string
}

export interface ProcessMetricRow {
  pid: number
  type: string
  name: string
  cpuPercent: number
  memoryMb: number
}

export interface DebugSnapshot {
  ts: number
  limitation: string
  gpuFeatureStatus: Record<string, string>
  gpuDevices: string[]
  processes: ProcessMetricRow[]
  feature: FeaturePerfReport | null
}

export interface MediaDurationDto {
  filePath: string
  duration: number | null
  error?: string
  method?: 'mp4-moov' | 'ffmpeg' | 'none'
}

export interface PosterDto {
  filePath: string
  posterPath: string | null
  status: string
  url: string | null
  dataUrl: string | null
  error?: string
}

export interface PovApi {
  selectVideoFiles: () => Promise<string[]>
  selectJsonFile: (title: string) => Promise<string | null>
  saveJsonFile: (defaultName: string) => Promise<string | null>
  readTextFile: (filePath: string) => Promise<string>
  writeTextFile: (filePath: string, text: string) => Promise<boolean>
  pathExists: (filePath: string) => Promise<boolean>
  selectReplacementFile: (currentPath: string) => Promise<string | null>
  selectExportDirectory: () => Promise<string | null>
  beginExportVideoClips: () => Promise<boolean>
  exportVideoClip: (request: {
    sourcePath: string
    outputDir: string
    outputName: string
    videoStart: number
    videoEnd: number
  }) => Promise<{ outputPath: string; cancelled: boolean }>
  cancelExportVideoClip: () => Promise<boolean>
  ensurePreviewProxy: (filePath: string) => Promise<ProxyStatusDto>
  getPreviewProxyStatus: (filePath: string) => Promise<ProxyStatusDto | null>
  ensurePreviewProxies: (paths: string[]) => Promise<ProxyStatusDto[]>
  onProxyProgress: (
    listener: (payload: {
      completed: number
      total: number
      sourcePath: string
      status: string
      cacheDir?: string
      error?: string
    }) => void
  ) => () => void
  getProxyCacheDir: () => Promise<string>
  toMediaUrl: (filePath: string) => Promise<string>
  probeMediaDurations: (paths: string[]) => Promise<MediaDurationDto[]>
  ensurePoster: (filePath: string, atSeconds?: number) => Promise<PosterDto>
  getPathForFile: (file: File) => string
  registerPaths: (paths: string[]) => Promise<string[]>
  openGpuDebug: () => Promise<boolean>
  reportFeaturePerf: (report: FeaturePerfReport) => void
  getDebugSnapshot: () => Promise<DebugSnapshot>
  onDebugSnapshot: (listener: (snapshot: DebugSnapshot) => void) => () => void
}

declare global {
  interface Window {
    povApi: PovApi
  }
}

export {}
