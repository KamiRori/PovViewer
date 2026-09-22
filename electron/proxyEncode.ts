import { spawn } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  asciiWorkRoot,
  materializeAsciiInput,
  withAsciiOutput
} from './asciiPath'
import { probeFileDuration } from './mediaDuration'
import {
  disableHardwareEncoder,
  hwaccelInputArgs,
  isHardwareEncoder,
  resolveProxyEncodeToolchain,
  resolveSegmentConcurrency,
  videoEncoderArgs,
  withHardwareEncodeSlot,
  type ProxyHwAccel,
  type ProxyVideoEncoder
} from './proxyEncoder'

export interface ProxySegment {
  start: number
  duration: number
}

export interface ProxyEncodeProgress {
  fraction: number
  outTimeSec: number
}

/** Fallback only — primary path is single-pass like Format Factory. */
const FALLBACK_SEGMENT_SEC = 10 * 60

export function resolveJobParallelism(
  cpuCount: number,
  runningJobs: number,
  _queuedJobs = 0
): number {
  const cpus = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 4
  const running = Math.max(1, Math.floor(runningJobs))
  return Math.max(1, Math.min(16, Math.floor(cpus / running)))
}

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

export function planProxySegmentsByMaxLength(
  durationSec: number,
  maxSegmentSec = FALLBACK_SEGMENT_SEC
): ProxySegment[] {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) {
    return [{ start: 0, duration: 0 }]
  }
  if (durationSec <= maxSegmentSec) {
    return [{ start: 0, duration: durationSec }]
  }
  const count = Math.ceil(durationSec / maxSegmentSec)
  const seg = durationSec / count
  return Array.from({ length: count }, (_, i) => {
    const start = i * seg
    const duration = i === count - 1 ? Math.max(0, durationSec - start) : seg
    return { start, duration }
  })
}

export function isFfmpegCrashExit(code: number | null): boolean {
  if (code == null) return false
  const unsigned = code < 0 ? code >>> 0 : code
  return unsigned === 0xc0000005 || unsigned === 0xc00000fd
}

function sanitizeLogSnippet(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function formatFfmpegFailure(code: number | null, stderr: string): Error {
  const snippet = sanitizeLogSnippet(stderr) || 'no stderr'
  if (isFfmpegCrashExit(code)) {
    return new Error(`FFmpeg crashed (ACCESS_VIOLATION). (${snippet})`)
  }
  return new Error(`FFmpeg exit ${code}: ${snippet}`)
}

export function parseFfmpegOutTime(text: string): number | null {
  const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(Number.isFinite)) return null
  return hours * 3600 + minutes * 60 + seconds
}

const STALL_MS = 300_000

function runFfmpeg(
  bin: string,
  args: string[],
  onProgress?: (outTimeSec: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[ffmpeg] ${bin} ${args.join(' ')}`)
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    let lastProgressAt = Date.now()
    let killedForStall = false
    const stallTimer = setInterval(() => {
      if (Date.now() - lastProgressAt < STALL_MS) return
      console.warn('[ffmpeg] stall detected, killing process')
      killedForStall = true
      try {
        child.kill()
      } catch {
        // ignore
      }
    }, 5_000)

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      lastProgressAt = Date.now()
      stderr += text
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
      const outTime = parseFfmpegOutTime(text)
      if (outTime != null) onProgress?.(outTime)
    })
    child.on('error', (error) => {
      clearInterval(stallTimer)
      reject(error)
    })
    child.on('close', (code) => {
      clearInterval(stallTimer)
      if (code === 0) {
        resolve()
        return
      }
      if (killedForStall) {
        reject(new Error('FFmpeg stalled (no output for several minutes)'))
        return
      }
      reject(formatFfmpegFailure(code, stderr))
    })
  })
}

/** Fast proxy filter — scale first, then fps (cheaper than fps on full-res frames). */
const PREVIEW_VF = 'scale=320:-2:flags=fast_bilinear,fps=15,format=yuv420p'

function buildFullPassArgs(
  input: string,
  output: string,
  threads: number,
  encoder: ProxyVideoEncoder,
  hwaccel: ProxyHwAccel
): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...hwaccelInputArgs(hwaccel),
    '-fflags',
    '+genpts+igndts',
    '-threads',
    String(Math.max(1, threads)),
    '-i',
    input,
    '-an',
    '-vf',
    PREVIEW_VF,
    ...videoEncoderArgs(encoder),
    ...(encoder === 'libx264' ? ['-threads', String(Math.max(1, threads))] : []),
    '-movflags',
    '+faststart',
    output
  ]
}

function buildSegmentArgs(
  input: string,
  output: string,
  threads: number,
  encoder: ProxyVideoEncoder,
  segment: ProxySegment
): string[] {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-fflags',
    '+genpts+igndts',
    '-threads',
    String(Math.max(1, threads))
  ]
  if (segment.start > 0) args.push('-ss', segment.start.toFixed(3))
  args.push('-i', input)
  if (segment.duration > 0) args.push('-t', segment.duration.toFixed(3))
  args.push(
    '-an',
    '-vf',
    PREVIEW_VF,
    ...videoEncoderArgs(encoder),
    ...(encoder === 'libx264' ? ['-threads', String(Math.max(1, threads))] : []),
    '-movflags',
    '+faststart',
    output
  )
  return args
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

async function concatSegments(
  bin: string,
  segmentPaths: string[],
  output: string,
  workRoot: string
): Promise<void> {
  if (segmentPaths.length === 1) {
    await runFfmpeg(bin, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      segmentPaths[0]!,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      output
    ])
    return
  }

  await mkdir(workRoot, { recursive: true })
  const listPath = join(workRoot, `concat-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
  const body = segmentPaths
    .map((path) => `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n')
  await writeFile(listPath, body, 'utf8')
  try {
    await runFfmpeg(bin, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      output
    ])
  } finally {
    await unlink(listPath).catch(() => undefined)
  }
}

async function mapPool(count: number, concurrency: number, worker: (index: number) => Promise<void>): Promise<void> {
  let next = 0
  const slots = Math.max(1, Math.min(concurrency, count))
  await Promise.all(
    Array.from({ length: slots }, async () => {
      for (;;) {
        const index = next
        next += 1
        if (index >= count) return
        await worker(index)
      }
    })
  )
}

async function encodeCpuSegmentsParallel(
  bin: string,
  input: string,
  output: string,
  workRoot: string,
  segments: ProxySegment[],
  threads: number,
  workers: number,
  onProgress?: (progress: ProxyEncodeProgress) => void
): Promise<void> {
  await mkdir(workRoot, { recursive: true })
  const partPaths = segments.map((_, index) =>
    join(workRoot, `part-${index.toString().padStart(3, '0')}.mp4`)
  )
  const totalDuration = segments.reduce((sum, seg) => sum + Math.max(0, seg.duration), 0)
  const completedInSeg = new Float64Array(segments.length)

  const emit = (): void => {
    let absolute = 0
    for (let i = 0; i < segments.length; i += 1) absolute += completedInSeg[i] ?? 0
    const fraction = totalDuration > 0 ? Math.min(0.99, Math.max(0, absolute / totalDuration)) : 0
    onProgress?.({ fraction, outTimeSec: absolute })
  }

  try {
    for (const partPath of partPaths) await unlink(partPath).catch(() => undefined)

    await mapPool(segments.length, workers, async (index) => {
      const segment = segments[index]!
      const partPath = partPaths[index]!
      await runFfmpeg(
        bin,
        buildSegmentArgs(input, partPath, threads, 'libx264', segment),
        (localTime) => {
          completedInSeg[index] = Math.min(Math.max(0, segment.duration), Math.max(0, localTime))
          emit()
        }
      )
      completedInSeg[index] = Math.max(0, segment.duration)
      emit()
    })

    await concatSegments(bin, partPaths, output, workRoot)
  } finally {
    for (const partPath of partPaths) await unlink(partPath).catch(() => undefined)
  }
}

async function runSinglePass(
  bin: string,
  input: string,
  output: string,
  threads: number,
  encoder: ProxyVideoEncoder,
  hwaccel: ProxyHwAccel,
  duration: number | null,
  onProgress?: (progress: ProxyEncodeProgress) => void
): Promise<void> {
  const report = (outTimeSec: number): void => {
    if (!(duration != null && duration > 0)) {
      onProgress?.({ fraction: 0, outTimeSec })
      return
    }
    onProgress?.({
      fraction: Math.min(0.99, Math.max(0, outTimeSec / duration)),
      outTimeSec
    })
  }

  const execute = async (): Promise<void> => {
    await runFfmpeg(bin, buildFullPassArgs(input, output, threads, encoder, hwaccel), report)
  }

  if (isHardwareEncoder(encoder)) {
    await withHardwareEncodeSlot(execute)
  } else {
    await execute()
  }
}

/**
 * Encode a grid preview proxy.
 * Primary path: one FFmpeg pass (GPU decode+encode when available) — same model as Format Factory.
 * Fallback: parallel CPU segments only if the single pass crashes.
 */
export async function encodePreviewProxyFast(
  binOrNull: string | null,
  input: string,
  output: string,
  options?: {
    threads?: number
    cpuCount?: number
    runningJobs?: number
    onProgress?: (progress: ProxyEncodeProgress) => void
  }
): Promise<{
  segments: number
  threads: number
  duration: number | null
  encoder: ProxyVideoEncoder
  mode: 'single' | 'segmented-fallback'
}> {
  const onProgress = options?.onProgress
  const cpuCount = options?.cpuCount ?? 4
  const runningJobs = Math.max(1, options?.runningJobs ?? 1)
  const toolchain = await resolveProxyEncodeToolchain()
  const bin = binOrNull && binOrNull.trim() !== '' ? binOrNull : toolchain.bin
  const encoder =
    !binOrNull || binOrNull.trim() === '' || bin === toolchain.bin ? toolchain.encoder : 'libx264'
  const hwaccel =
    encoder === toolchain.encoder && bin === toolchain.bin ? toolchain.hwaccel : 'none'
  const requestedThreads = options?.threads ?? resolveJobParallelism(cpuCount, runningJobs)
  const slots = Math.max(
    1,
    Math.min(encoder === 'libx264' ? 16 : 4, Math.floor(requestedThreads))
  )
  const outputWorkRoot = asciiWorkRoot(output)
  const inputWorkRoot = asciiWorkRoot(input)

  let duration: number | null = null
  try {
    const probed = await Promise.race([
      probeFileDuration(input),
      new Promise<{ duration: null }>((resolve) => {
        setTimeout(() => resolve({ duration: null }), 8_000)
      })
    ])
    duration = probed.duration
  } catch {
    duration = null
  }

  const inputAlias = await materializeAsciiInput(input, inputWorkRoot)
  let usedEncoder = encoder
  let mode: 'single' | 'segmented-fallback' = 'single'
  let segmentCount = 1

  try {
    console.log(
      `[proxy] encode ${input} → ${output} (ffmpegIn=${inputAlias.path}, encoder=${encoder}, hwaccel=${hwaccel}, threads=${slots}, duration=${duration ?? '?'}, mode=single-pass)`
    )
    await withAsciiOutput(output, outputWorkRoot, async (asciiOut) => {
      try {
        await runSinglePass(
          bin,
          inputAlias.path,
          asciiOut,
          slots,
          encoder,
          hwaccel,
          duration,
          onProgress
        )
        await assertProxyDecodable(bin, asciiOut)
      } catch (singleError) {
        console.warn('[proxy] single-pass failed, falling back to parallel CPU segments', singleError)
        if (isHardwareEncoder(encoder)) {
          disableHardwareEncoder(singleError instanceof Error ? singleError.message : String(singleError))
        }
        await unlink(asciiOut).catch(() => undefined)
        usedEncoder = 'libx264'
        mode = 'segmented-fallback'
        const fallbackDuration = duration && duration > 0 ? duration : 3 * 60 * 60
        const segments = planProxySegmentsByMaxLength(fallbackDuration, FALLBACK_SEGMENT_SEC)
        segmentCount = segments.length
        const workers = resolveSegmentConcurrency(cpuCount, runningJobs, 'libx264')
        await encodeCpuSegmentsParallel(
          bin,
          inputAlias.path,
          asciiOut,
          outputWorkRoot,
          segments,
          Math.max(1, Math.min(4, slots)),
          workers,
          onProgress
        )
        await assertProxyDecodable(bin, asciiOut)
      }
    })
  } finally {
    await inputAlias.cleanup()
  }

  onProgress?.({ fraction: 1, outTimeSec: duration ?? 0 })
  return {
    segments: segmentCount,
    threads: slots,
    duration,
    encoder: usedEncoder,
    mode
  }
}
