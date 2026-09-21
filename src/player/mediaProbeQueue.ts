/**
 * Serialize HTML5 metadata probes so importing N POVs does not open N demuxers at once.
 * Chromium stalls / errors when dozens of <video preload=metadata> start together.
 */

export interface MetadataProbeResult {
  duration: number
}

type ProbeTask = {
  src: string
  signal: AbortSignal
  resolve: (result: MetadataProbeResult | null) => void
}

const queue: ProbeTask[] = []
let active = 0
/** Keep at 1: Minecraft POV files are often large; parallel metadata still spikes CPU. */
const MAX_CONCURRENT = 1
const PROBE_TIMEOUT_MS = 20_000

export function enqueueMetadataProbe(
  src: string,
  signal: AbortSignal
): Promise<MetadataProbeResult | null> {
  if (signal.aborted) return Promise.resolve(null)

  return new Promise((resolve) => {
    const task: ProbeTask = { src, signal, resolve }
    const onAbort = () => {
      const index = queue.indexOf(task)
      if (index >= 0) {
        queue.splice(index, 1)
        resolve(null)
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    queue.push(task)
    pump()
  })
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift()
    if (!task) return
    if (task.signal.aborted) {
      task.resolve(null)
      continue
    }
    active += 1
    void runProbe(task).finally(() => {
      active -= 1
      pump()
    })
  }
}

function runProbe(task: ProbeTask): Promise<void> {
  return new Promise((resolveDone) => {
    if (task.signal.aborted) {
      task.resolve(null)
      resolveDone()
      return
    }

    const probe = document.createElement('video')
    probe.muted = true
    probe.playsInline = true
    probe.preload = 'metadata'

    let settled = false
    const finish = (result: MetadataProbeResult | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      probe.removeEventListener('loadedmetadata', onMeta)
      probe.removeEventListener('error', onError)
      task.signal.removeEventListener('abort', onAbort)
      probe.removeAttribute('src')
      try {
        probe.load()
      } catch {
        // ignore
      }
      task.resolve(result)
      resolveDone()
    }

    const onMeta = () => {
      const duration = probe.duration
      if (Number.isFinite(duration) && duration >= 0) {
        finish({ duration })
        return
      }
      finish(null)
    }

    const onError = () => finish(null)
    const onAbort = () => finish(null)

    const timeout = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS)

    task.signal.addEventListener('abort', onAbort)
    probe.addEventListener('loadedmetadata', onMeta)
    probe.addEventListener('error', onError)
    probe.src = task.src
  })
}
