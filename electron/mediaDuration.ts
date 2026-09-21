import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/** Parse `Duration: HH:MM:SS.ms` from ffmpeg banner stderr. */
export function parseFfmpegDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(Number.isFinite)) return null
  const total = hours * 3600 + minutes * 60 + seconds
  return total >= 0 ? total : null
}

export interface MediaDurationResult {
  filePath: string
  duration: number | null
  error?: string
}

/**
 * Read container duration via bundled ffmpeg (header only — does not decode the file).
 * Much faster than Chromium <video> metadata for long OBS recordings.
 */
export function probeFileDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!ffmpegPath) {
      resolve(null)
      return
    }

    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // already exited
      }
      resolve(value)
    }

    const child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath], {
      windowsHide: true
    })
    let stderr = ''
    const timer = setTimeout(() => {
      finish(parseFfmpegDuration(stderr))
    }, 15_000)

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      // Duration usually appears early; stop as soon as we see it.
      if (/Duration:\s*\d+:\d+:\d+/.test(stderr)) {
        finish(parseFfmpegDuration(stderr))
      }
    })
    child.on('error', () => finish(null))
    child.on('close', () => finish(parseFfmpegDuration(stderr)))
  })
}

export async function probeFileDurations(
  paths: readonly string[],
  concurrency = 4
): Promise<MediaDurationResult[]> {
  const results: MediaDurationResult[] = new Array(paths.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = next
      next += 1
      if (index >= paths.length) return
      const filePath = paths[index]
      try {
        const duration = await probeFileDuration(filePath)
        results[index] = { filePath, duration }
      } catch (error) {
        results[index] = {
          filePath,
          duration: null,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, paths.length || 1)) }, () =>
    worker()
  )
  await Promise.all(workers)
  return results
}
