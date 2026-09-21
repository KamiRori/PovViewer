import { spawn, type ChildProcess } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import {
  asciiWorkRoot,
  materializeAsciiInput,
  withAsciiOutput
} from './asciiPath'
import { getFfmpegBinary } from './ffmpegBin'

export interface ExportClipRequest {
  sourcePath: string
  outputPath: string
  videoStart: number
  videoEnd: number
}

export class ExportCancelledError extends Error {
  constructor() {
    super('EXPORT_CANCELLED')
    this.name = 'ExportCancelledError'
  }
}

let cancelled = false
let activeChild: ChildProcess | null = null

export function resetExportCancellation(): void {
  cancelled = false
}

export function cancelExport(): void {
  cancelled = true
  const child = activeChild
  activeChild = null
  if (!child || child.killed) return
  try {
    child.kill()
  } catch {
    // process may have already exited
  }
}

export function isExportCancelled(): boolean {
  return cancelled
}

function assertNotCancelled(): void {
  if (cancelled) throw new ExportCancelledError()
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    assertNotCancelled()
    console.log(`[ffmpeg-export] ${bin} ${args.join(' ')}`)
    const child = spawn(bin, args, { windowsHide: true })
    activeChild = child
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000)
    })
    child.on('error', (error) => {
      if (activeChild === child) activeChild = null
      reject(cancelled ? new ExportCancelledError() : error)
    })
    child.on('close', (code) => {
      if (activeChild === child) activeChild = null
      if (cancelled) {
        reject(new ExportCancelledError())
        return
      }
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg 退出码 ${code}: ${stderr.trim() || '无输出'}`))
    })
  })
}

function copyCutArgs(input: string, output: string, start: number, duration: number): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    start.toFixed(3),
    '-i',
    input,
    '-t',
    duration.toFixed(3),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    output
  ]
}

function reencodeCutArgs(input: string, output: string, start: number, duration: number): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    start.toFixed(3),
    '-i',
    input,
    '-t',
    duration.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output
  ]
}

/** Cut one clip from source media into outputPath (mp4). Tries stream-copy, then re-encode. */
export async function exportVideoClip(request: ExportClipRequest): Promise<void> {
  assertNotCancelled()

  const duration = request.videoEnd - request.videoStart
  if (!(duration > 0) || !Number.isFinite(duration)) {
    throw new Error('无效的导出时长')
  }
  if (!(request.videoStart >= 0) || !Number.isFinite(request.videoStart)) {
    throw new Error('无效的导出起点')
  }

  const bin = await getFfmpegBinary()
  assertNotCancelled()
  const workRoot = asciiWorkRoot(request.outputPath)
  const inputAlias = await materializeAsciiInput(request.sourcePath, workRoot)

  try {
    assertNotCancelled()
    await withAsciiOutput(request.outputPath, workRoot, async (asciiOut) => {
      try {
        await runFfmpeg(
          bin,
          copyCutArgs(inputAlias.path, asciiOut, request.videoStart, duration)
        )
      } catch (copyError) {
        if (copyError instanceof ExportCancelledError || cancelled) {
          throw copyError instanceof ExportCancelledError
            ? copyError
            : new ExportCancelledError()
        }
        console.warn('[export] stream copy failed, re-encoding', copyError)
        await unlink(asciiOut).catch(() => undefined)
        assertNotCancelled()
        await runFfmpeg(
          bin,
          reencodeCutArgs(inputAlias.path, asciiOut, request.videoStart, duration)
        )
      }
    })
  } finally {
    await inputAlias.cleanup()
  }
}
