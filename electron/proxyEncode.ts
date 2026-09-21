import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeFileDuration } from './mediaDuration'

export interface ProxySegment {
  start: number
  duration: number
}

/**
 * How many CPU slots this encode job may use (threads or segments).
 * Divide cores across jobs that are already running; queued work waits for a
 * free file-slot, so it should not shrink this job's parallelism.
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
 * Split a long timeline into parallel encode segments.
 * Short clips stay single-segment; long OBS takes use all offered parallelism.
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
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 6000) stderr = stderr.slice(-6000)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg 退出码 ${code}: ${stderr.trim() || '无输出'}`))
    })
  })
}

/** Shared ultrafast preview filter — drop to 15fps before scale. */
const PREVIEW_VF =
  'fps=15,scale=320:180:flags=fast_bilinear:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black'

function singlePassArgs(
  input: string,
  output: string,
  options: { threads: number; ss?: number; t?: number; elementaryH264?: boolean }
): string[] {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    // Prefer GPU decode when the platform binary supports it (d3d11va/cuda/qsv…).
    '-hwaccel',
    'auto',
    '-threads',
    String(Math.max(1, options.threads))
  ]
  // Input seek is much faster on multi‑hour OBS files (keyframe-accurate is enough for grid).
  if (options.ss != null && options.ss > 0.05) {
    args.push('-ss', options.ss.toFixed(3))
  }
  args.push('-i', input)
  if (options.t != null && options.t > 0) {
    args.push('-t', options.t.toFixed(3))
  }
  args.push(
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
    String(Math.max(1, options.threads))
  )
  if (options.elementaryH264) {
    // Annex-B elementary stream — safe to byte-concat across parallel segment jobs.
    args.push('-f', 'h264', output)
  } else {
    args.push('-movflags', '+faststart', output)
  }
  return args
}

async function encodeSingle(
  bin: string,
  input: string,
  output: string,
  threads: number
): Promise<void> {
  await runFfmpeg(bin, singlePassArgs(input, output, { threads }))
}

async function encodeSegmented(
  bin: string,
  input: string,
  output: string,
  segments: ProxySegment[],
  threadsPerSegment: number
): Promise<void> {
  const workDir = join(
    tmpdir(),
    `pov-proxy-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  await mkdir(workDir, { recursive: true })
  try {
    const parts: string[] = []
    await Promise.all(
      segments.map(async (segment, index) => {
        const partPath = join(workDir, `part-${index.toString().padStart(3, '0')}.h264`)
        parts[index] = partPath
        await runFfmpeg(
          bin,
          singlePassArgs(input, partPath, {
            threads: threadsPerSegment,
            ss: segment.start,
            t: segment.duration,
            elementaryH264: true
          })
        )
      })
    )

    const joinedPath = join(workDir, 'joined.h264')
    const buffers = await Promise.all(parts.map((part) => readFile(part)))
    await writeFile(joinedPath, Buffer.concat(buffers))

    // Must re-encode (not stream-copy): byte-concatenated annex-B + `-c copy`
    // produces odd timescales / mid-stream SPS that Chromium often rejects.
    // At 320×180 this second pass is cheap compared with decoding the OBS source.
    await runFfmpeg(bin, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-fflags',
      '+genpts',
      '-framerate',
      '15',
      '-i',
      joinedPath,
      '-an',
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
      '-movflags',
      '+faststart',
      output
    ])
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Fail closed if the mux looks empty / undecodable before we hand it to Chromium. */
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
 * Encode a grid preview proxy as fast as possible for this machine.
 * Long files are sliced and encoded in parallel when `parallel > 1`.
 */
export async function encodePreviewProxyFast(
  bin: string,
  input: string,
  output: string,
  parallel = 1
): Promise<{ segments: number; threads: number; duration: number | null }> {
  const slots = Math.max(1, Math.min(16, Math.floor(parallel)))
  const probed = await probeFileDuration(input)
  const duration = probed.duration
  const segments = planProxySegments(duration ?? 0, slots)

  if (segments.length <= 1) {
    await encodeSingle(bin, input, output, slots)
    await assertProxyDecodable(bin, output)
    return { segments: 1, threads: slots, duration }
  }

  const threadsPerSegment = Math.max(1, Math.floor(slots / segments.length))
  await encodeSegmented(bin, input, output, segments, threadsPerSegment)
  await assertProxyDecodable(bin, output)
  return { segments: segments.length, threads: threadsPerSegment, duration }
}
