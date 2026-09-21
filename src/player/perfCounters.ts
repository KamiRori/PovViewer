type CounterKey = 'sampleSeek' | 'continuousPlay' | 'hardSeek'

const counts: Record<CounterKey, number> = {
  sampleSeek: 0,
  continuousPlay: 0,
  hardSeek: 0
}

let lastDrainAt = performance.now()

export function recordSampleSeek(): void {
  counts.sampleSeek += 1
}

export function recordContinuousPlay(): void {
  counts.continuousPlay += 1
}

export function recordHardSeek(): void {
  counts.hardSeek += 1
}

export function drainPerfRates(): {
  sampleSeeksPerSec: number
  continuousPlayCallsPerSec: number
  hardSeeksPerSec: number
} {
  const now = performance.now()
  const elapsedSec = Math.max(0.001, (now - lastDrainAt) / 1000)
  const rates = {
    sampleSeeksPerSec: Number((counts.sampleSeek / elapsedSec).toFixed(2)),
    continuousPlayCallsPerSec: Number((counts.continuousPlay / elapsedSec).toFixed(2)),
    hardSeeksPerSec: Number((counts.hardSeek / elapsedSec).toFixed(2))
  }
  counts.sampleSeek = 0
  counts.continuousPlay = 0
  counts.hardSeek = 0
  lastDrainAt = now
  return rates
}
