import { execFile, spawn } from 'node:child_process'
import { getFfmpegBinary } from './ffmpegBin'

export type ProxyVideoEncoder = 'libx264' | 'h264_nvenc' | 'h264_amf' | 'h264_qsv'
export type ProxyHwAccel = 'none' | 'cuda' | 'd3d11va' | 'qsv'

export interface ProxyToolchain {
  bin: string
  encoder: ProxyVideoEncoder
  hwaccel: ProxyHwAccel
}

const HW_CANDIDATES: Array<{ encoder: ProxyVideoEncoder; hwaccel: ProxyHwAccel }> = [
  { encoder: 'h264_nvenc', hwaccel: 'cuda' },
  { encoder: 'h264_nvenc', hwaccel: 'none' },
  { encoder: 'h264_amf', hwaccel: 'd3d11va' },
  { encoder: 'h264_amf', hwaccel: 'none' },
  { encoder: 'h264_qsv', hwaccel: 'qsv' },
  { encoder: 'h264_qsv', hwaccel: 'none' }
]

let cachedChoice: Promise<ProxyToolchain> | null = null
let hardwareDisabled = false
let hardwareSlot: Promise<void> = Promise.resolve()

export function isHardwareEncoder(encoder: ProxyVideoEncoder): boolean {
  return encoder !== 'libx264'
}

export function disableHardwareEncoder(reason: string): void {
  if (hardwareDisabled) return
  hardwareDisabled = true
  cachedChoice = getFfmpegBinary().then((bin) => ({
    bin,
    encoder: 'libx264' as const,
    hwaccel: 'none' as const
  }))
  console.warn(`[proxy] hardware encoder disabled for this session: ${reason}`)
}

export async function withHardwareEncodeSlot<T>(task: () => Promise<T>): Promise<T> {
  const previous = hardwareSlot
  let release!: () => void
  hardwareSlot = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await task()
  } finally {
    release()
  }
}

function runOnce(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve({ code: null, stderr })
    }, timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: null, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stderr })
    })
  })
}

async function probeEncode(
  bin: string,
  encoder: ProxyVideoEncoder,
  hwaccel: ProxyHwAccel
): Promise<boolean> {
  const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const args = ['-hide_banner', '-nostdin', '-y']
  if (hwaccel === 'cuda') args.push('-hwaccel', 'cuda')
  if (hwaccel === 'd3d11va') args.push('-hwaccel', 'd3d11va')
  if (hwaccel === 'qsv') args.push('-hwaccel', 'qsv')
  args.push(
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=30:duration=0.4',
    '-an',
    '-vf',
    'scale=320:-2,fps=15,format=yuv420p',
    ...videoEncoderArgs(encoder),
    '-f',
    'null',
    nullSink
  )
  const result = await runOnce(bin, args, 15_000)
  return result.code === 0
}

async function findSystemFfmpeg(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((resolve) => {
    execFile(cmd, ['ffmpeg'], { windowsHide: true, timeout: 8_000 }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const line = String(stdout ?? '')
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0)
      resolve(line ?? null)
    })
  })
}

async function pickToolchain(bin: string): Promise<ProxyToolchain> {
  if (hardwareDisabled) {
    return { bin, encoder: 'libx264', hwaccel: 'none' }
  }
  for (const candidate of HW_CANDIDATES) {
    try {
      if (await probeEncode(bin, candidate.encoder, candidate.hwaccel)) {
        console.log(
          `[proxy] toolchain ok: encoder=${candidate.encoder} hwaccel=${candidate.hwaccel} @ ${bin}`
        )
        return { bin, encoder: candidate.encoder, hwaccel: candidate.hwaccel }
      }
    } catch (error) {
      console.warn(`[proxy] probe ${candidate.encoder}/${candidate.hwaccel} failed`, error)
    }
  }
  return { bin, encoder: 'libx264', hwaccel: 'none' }
}

/** Prefer GPU decode+encode like Format Factory; fall back to libx264. */
export function resolveProxyEncodeToolchain(): Promise<ProxyToolchain> {
  if (!cachedChoice) {
    cachedChoice = (async () => {
      const bundled = await getFfmpegBinary()
      const bundledChoice = await pickToolchain(bundled)
      if (bundledChoice.encoder !== 'libx264') return bundledChoice

      const system = await findSystemFfmpeg()
      if (system && system.toLowerCase() !== bundled.toLowerCase()) {
        const systemChoice = await pickToolchain(system)
        if (systemChoice.encoder !== 'libx264') {
          console.log(`[proxy] using system ffmpeg → ${system}`)
          return systemChoice
        }
      }

      console.log('[proxy] no working GPU toolchain; using libx264')
      return { bin: bundled, encoder: 'libx264', hwaccel: 'none' }
    })()
  }
  return cachedChoice.then((choice) =>
    hardwareDisabled ? { bin: choice.bin, encoder: 'libx264', hwaccel: 'none' } : choice
  )
}

export function videoEncoderArgs(encoder: ProxyVideoEncoder): string[] {
  switch (encoder) {
    case 'h264_nvenc':
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p1',
        '-rc',
        'vbr',
        '-cq',
        '32',
        '-b:v',
        '0',
        '-pix_fmt',
        'yuv420p',
        '-bf',
        '0',
        '-g',
        '15'
      ]
    case 'h264_amf':
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'speed',
        '-rc',
        'cqp',
        '-qp_i',
        '32',
        '-qp_p',
        '32',
        '-pix_fmt',
        'yuv420p',
        '-bf',
        '0',
        '-g',
        '15'
      ]
    case 'h264_qsv':
      return [
        '-c:v',
        'h264_qsv',
        '-preset',
        'veryfast',
        '-global_quality',
        '32',
        '-pix_fmt',
        'yuv420p',
        '-bf',
        '0',
        '-g',
        '15'
      ]
    default:
      return [
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
        '34',
        '-pix_fmt',
        'yuv420p',
        '-bf',
        '0',
        '-g',
        '15'
      ]
  }
}

/** Input hwaccel flags (Format Factory–style GPU decode when available). */
export function hwaccelInputArgs(hwaccel: ProxyHwAccel): string[] {
  if (hwaccel === 'cuda') return ['-hwaccel', 'cuda']
  if (hwaccel === 'd3d11va') return ['-hwaccel', 'd3d11va']
  if (hwaccel === 'qsv') return ['-hwaccel', 'qsv']
  return []
}

export function resolveSegmentConcurrency(
  cpuCount: number,
  runningFileJobs: number,
  encoder: ProxyVideoEncoder
): number {
  const cpus = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 4
  const running = Math.max(1, Math.floor(runningFileJobs))
  if (isHardwareEncoder(encoder)) return 1
  return Math.max(2, Math.min(8, Math.floor(cpus / running)))
}
