import { spawn } from 'node:child_process'
import { asciiWorkRoot, materializeAsciiInput } from './asciiPath'
import { getFfmpegBinary } from './ffmpegBin'
import { isMp4LikePath, readMp4Duration } from './mp4Duration'

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
  method?: 'mp4-moov' | 'ffmpeg' | 'none'
}

function probeWithFfmpeg(filePath: string, bin: string): Promise<number | null> {
  return new Promise((resolve) => {
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

    // Large OBS files need bigger probe windows when moov/cues sit far from the start.
    const child = spawn(
      bin,
      [
        '-hide_banner',
        '-nostdin',
        '-probesize',
        '100M',
        '-analyzeduration',
        '100M',
        '-i',
        filePath
      ],
      { windowsHide: true }
    )
    let stderr = ''
    const timer = setTimeout(() => {
      finish(parseFfmpegDuration(stderr))
    }, 45_000)

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (/Duration:\s*\d+:\d+:\d+/.test(stderr)) {
        finish(parseFfmpegDuration(stderr))
      }
    })
    child.on('error', () => finish(null))
    child.on('close', () => finish(parseFfmpegDuration(stderr)))
  })
}

/**
 * Prefer direct MP4/MOV moov parse (works with Unicode Windows paths, multi‑GB files).
 * Fall back to bundled ffmpeg for mkv/webm or unreadable moov.
 */
export async function probeFileDuration(filePath: string): Promise<MediaDurationResult> {
  try {
    if (isMp4LikePath(filePath)) {
      const fromMoov = await readMp4Duration(filePath)
      if (fromMoov !== null) {
        return { filePath, duration: fromMoov, method: 'mp4-moov' }
      }
    }
  } catch (error) {
    // fall through to ffmpeg
    console.warn('[media] mp4 moov probe failed', filePath, error)
  }

  try {
    const bin = await getFfmpegBinary()
    const workRoot = asciiWorkRoot(filePath)
    const alias = await materializeAsciiInput(filePath, workRoot)
    try {
      const fromFfmpeg = await probeWithFfmpeg(alias.path, bin)
      if (fromFfmpeg !== null) {
        return { filePath, duration: fromFfmpeg, method: 'ffmpeg' }
      }
      return { filePath, duration: null, method: 'none', error: '未能解析时长' }
    } finally {
      await alias.cleanup()
    }
  } catch (error) {
    return {
      filePath,
      duration: null,
      method: 'none',
      error: error instanceof Error ? error.message : String(error)
    }
  }
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
      results[index] = await probeFileDuration(paths[index])
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, paths.length || 1)) }, () =>
    worker()
  )
  await Promise.all(workers)
  return results
}
