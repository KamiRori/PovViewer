export interface FeaturePerfReport {
  ts: number
  playbackMode: 'continuous' | 'sampled'
  preset: string
  maxFps: number
  playing: boolean
  armedCount: number
  /** Sampled seeks that actually changed currentTime in the last window. */
  sampleSeeksPerSec: number
  /** Continuous play() successes in the last window. */
  continuousPlayCallsPerSec: number
  /** Hard/verify seeks in the last window. */
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
  /** Electron cannot expose OS Task-Manager GPU %; this is process-level proxy data. */
  limitation: string
  gpuFeatureStatus: Record<string, string>
  gpuDevices: string[]
  processes: ProcessMetricRow[]
  feature: FeaturePerfReport | null
}

export const DEBUG_METRICS_PUSH = 'debug:metrics' as const
