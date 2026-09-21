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
}

export interface PovApi {
  selectVideoFiles: () => Promise<string[]>
  selectJsonFile: (title: string) => Promise<string | null>
  readTextFile: (filePath: string) => Promise<string>
  toMediaUrl: (filePath: string) => Promise<string>
  probeMediaDurations: (paths: string[]) => Promise<MediaDurationDto[]>
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
