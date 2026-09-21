import { app } from 'electron'
import type { DebugSnapshot, FeaturePerfReport, ProcessMetricRow } from './debugTypes'

let latestFeature: FeaturePerfReport | null = null

export function setLatestFeatureReport(report: FeaturePerfReport): void {
  latestFeature = report
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = String(entry)
  }
  return out
}

export async function collectDebugSnapshot(): Promise<DebugSnapshot> {
  const metrics = app.getAppMetrics()
  const processes: ProcessMetricRow[] = metrics.map((metric) => ({
    pid: metric.pid,
    type: metric.type,
    name: metric.name || metric.type,
    cpuPercent: Number(metric.cpu.percentCPUUsage.toFixed(1)),
    memoryMb: Number((metric.memory.workingSetSize / 1024).toFixed(1))
  }))

  let gpuDevices: string[] = []
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: Array<{ deviceString?: string; vendorId?: number; deviceId?: number }> }
    gpuDevices = (info.gpuDevice ?? []).map((device, index) => {
      const label = device.deviceString?.trim()
      if (label) return label
      return `GPU ${index}: vendor=${device.vendorId ?? '?'} device=${device.deviceId ?? '?'}`
    })
  } catch {
    gpuDevices = ['(无法读取 getGPUInfo)']
  }

  return {
    ts: Date.now(),
    limitation:
      'Electron 无法提供类似任务管理器的精确 GPU 占用百分比，也无法把 GPU 时间精确归到某一功能。下表是进程 CPU/内存 + GPU 特性状态，并结合渲染进程上报的功能活动速率，用于对比「采样 seek / 连续播放 / 参与路数」的相对代价。',
    gpuFeatureStatus: asRecord(app.getGPUFeatureStatus()),
    gpuDevices,
    processes,
    feature: latestFeature
  }
}
