import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import ffmpegPath from 'ffmpeg-static'
import { encodePreviewProxyFast } from './proxyEncode'

async function makeSource(path: string, seconds: number): Promise<void> {
  const bin = ffmpegPath
  if (!bin) throw new Error('no ffmpeg')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      bin,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=640x360:rate=30',
        '-t',
        String(seconds),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        path
      ],
      { windowsHide: true }
    )
    child.on('error', reject)
    child.on('close', (code: number | null) =>
      code === 0 ? resolve() : reject(new Error(`gen exit ${code}`))
    )
  })
}

describe('encodePreviewProxyFast', () => {
  it(
    'writes a playable proxy for short and longer clips',
    async () => {
      if (!ffmpegPath) return
      const dir = await mkdtemp(join(tmpdir(), 'pov-proxy-it-'))
      try {
        const shortSrc = join(dir, 'short.mp4')
        const shortOut = join(dir, 'short-proxy.mp4')
        await makeSource(shortSrc, 4)
        const short = await encodePreviewProxyFast(ffmpegPath, shortSrc, shortOut, { threads: 4 })
        expect(short.segments).toBe(1)
        await access(shortOut)

        const longSrc = join(dir, 'long.mp4')
        const longOut = join(dir, 'long-proxy.mp4')
        await makeSource(longSrc, 20)
        const long = await encodePreviewProxyFast(ffmpegPath, longSrc, longOut, { threads: 4 })
        expect(long.segments).toBe(1)
        await access(longOut)
        await writeFile(join(dir, 'touch'), 'ok')
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
    120_000
  )
})
