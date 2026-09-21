import { spawn } from 'node:child_process'
import {
  asciiWorkRoot,
  materializeAsciiInput,
  withAsciiOutput
} from './asciiPath'
import { getFfmpegBinary } from './ffmpegBin'
import { probeFileDuration } from './mediaDuration'

export interface ProxySegment {
  start: number
  duration: number
}

/**
 * How many CPU slots this encode job may use (threads).
 * Divide cores across jobs that are already running.
 */
export function resolveJobParallelism(
  cpuCount: number,
  runningJobs: number,
  _queuedJobs = 0
): number {
  const cpus = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 4
  const running = Math.max(1, Math.floor(runningJobs))
  return Math.max(1, Math.min(16, Math.floor(cpus / running)))
}

/**
 * Kept for tests / future segment modes. Current encode path uses a single
 * multi-threaded pass for reliability on Windows Unicode paths.
 */
export function planProxySegments(
  durationSec: number,
  parallel: number,
  options?: { thresholdSec?: number; minSegmentSec?: number }
): ProxySegment[] {
  const thresholdSec = options?.thresholdSec ?? 90
  const minSegmentSec = options?.minSegmentSec ?? 45
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) {
    return [{ start: 0, duration: 0 }]
  }
  if (parallel <= 1 || durationSec < thresholdSec) {
    return [{ start: 0, duration: durationSec }]
  }
  const maxByLength = Math.max(1, Math.floor(durationSec / minSegmentSec))
  const count = Math.max(2, Math.min(16, parallel, maxByLength))
  const seg = durationSec / count
  return Array.from({ length: count }, (_, i) => {
    const start = i * seg
    const duration = i === count - 1 ? Math.max(0, durationSec - start) : seg
    return { start, duration }
  })
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[ffmpeg] ${bin} ${args.join(' ')}`)
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg 退出码 ${code}: ${stderr.trim() || '无输出'}`))
    })
  })
}

const PREVIEW_VF =
  'fps=15,scale=320:180:flags=fast_bilinear:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black'

function singlePassArgs(input: string, output: string, threads: number): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    // Software decode only — `-hwaccel auto` can hang on some Windows GPU stacks.
    '-threads',
    String(Math.max(1, threads)),
    '-i',
    input,
    '-an',
    '-vf',
    PREVIEW_VF,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'fastdecode',
    '-profile:v',
    'baseline',
    '-level',
    '3.0',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-bf',
    '0',
    '-g',
    '15',
    '-threads',
    String(Math.max(1, threads)),
    '-movflags',
    '+faststart',
    output
  ]
}

async function assertProxyDecodable(bin: string, filePath: string): Promise<void> {
  await runFfmpeg(bin, [
    '-hide_banner',
    '-nostdin',
    '-v',
    'error',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'null',
    '-'
  ])
}

/**
 * Encode a grid preview proxy.
 * All FFmpeg I/O is forced through ASCII paths so Windows installs under
 * folders like `D:\桌面\...` still produce files (then copied to the real proxies dir).
 */
export async function encodePreviewProxyFast(
  binOrNull: string | null,
  input: string,
  output: string,
  parallel = 1
): Promise<{ segments: number; threads: number; duration: number | null }> {
  const slots = Math.max(1, Math.min(16, Math.floor(parallel)))
  const bin = binOrNull && binOrNull.trim() !== '' ? binOrNull : await getFfmpegBinary()
  const workRoot = asciiWorkRoot(output)

  // Duration is informational only now (single-pass encode). Prefer moov; don't block forever.
  let duration: number | null = null
  try {
    const probed = await Promise.race([
      probeFileDuration(input),
      new Promise<{ duration: null }>((resolve) => {
        setTimeout(() => resolve({ duration: null }), 20_000)
      })
    ])
    duration = probed.duration
  } catch {
    duration = null
  }

  const inputAlias = await materializeAsciiInput(input, workRoot)
  try {
    console.log(`[proxy] encode ${input} → ${output} (ffmpegIn=${inputAlias.path}, threads=${slots})`)
    await withAsciiOutput(output, workRoot, async (asciiOut) => {
      await runFfmpeg(bin, singlePassArgs(inputAlias.path, asciiOut, slots))
      await assertProxyDecodable(bin, asciiOut)
    })
  } finally {
    await inputAlias.cleanup()
  }

  return { segments: 1, threads: slots, duration }
}
