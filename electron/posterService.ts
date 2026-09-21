import { createHash } from 'node:crypto'
import { access, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import {
  asciiWorkRoot,
  materializeAsciiInput,
  withAsciiOutput
} from './asciiPath'
import { getFfmpegBinary } from './ffmpegBin'
import { spawn } from 'node:child_process'

export interface PosterStatus {
  filePath: string
  posterPath: string | null
  /** Prefer this in renderer — avoids custom-protocol <img> quirks. */
  dataUrl: string | null
  status: 'ready' | 'error' | 'missing'
  error?: string
}

/**
 * Extract one low-res JPEG poster with a fast input seek.
 * Suitable for multi‑GB OBS recordings — does not keep a Chromium decoder warm.
 */
export class PosterService {
  private readonly cache = new Map<string, PosterStatus>()
  private dirReady: Promise<string> | null = null
  private chain: Promise<void> = Promise.resolve()

  private async postersDir(): Promise<string> {
    if (!this.dirReady) {
      this.dirReady = (async () => {
        const dir = join(app.getPath('userData'), 'posters')
        await mkdir(dir, { recursive: true })
        return dir
      })()
    }
    return this.dirReady
  }

  private cacheKey(sourcePath: string, _atSeconds: number): string {
    const hash = createHash('sha1')
    hash.update(sourcePath.replace(/\\/g, '/').toLowerCase())
    // One poster per source file (fixed early frame) — scrubbing must not re-encode.
    hash.update('|poster-320-t1-v3')
    return hash.digest('hex')
  }

  private async toDataUrl(posterPath: string): Promise<string> {
    const bytes = await readFile(posterPath)
    return `data:image/jpeg;base64,${bytes.toString('base64')}`
  }

  async ensurePoster(sourcePath: string, _atSeconds = 1): Promise<PosterStatus> {
    const run = async (): Promise<PosterStatus> => {
      // Always grab ~1s in — cheap keyframe seek, independent of timeline scrub.
      const safeAt = 1
      const key = this.cacheKey(sourcePath, safeAt)
      const cached = this.cache.get(key)
      if (cached?.status === 'ready' && cached.posterPath && cached.dataUrl) {
        try {
          await access(cached.posterPath)
          return cached
        } catch {
          // rebuild
        }
      }

      let bin: string
      try {
        bin = await getFfmpegBinary()
      } catch {
        const failed: PosterStatus = {
          filePath: sourcePath,
          posterPath: null,
          dataUrl: null,
          status: 'error',
          error: '未找到内置 FFmpeg'
        }
        this.cache.set(key, failed)
        return failed
      }

      const dir = await this.postersDir()
      const posterPath = join(dir, `${key}.jpg`)
      try {
        await access(posterPath)
        const dataUrl = await this.toDataUrl(posterPath)
        const ready: PosterStatus = {
          filePath: sourcePath,
          posterPath,
          dataUrl,
          status: 'ready'
        }
        this.cache.set(key, ready)
        return ready
      } catch {
        // encode
      }

      try {
        await extractPoster(bin, sourcePath, posterPath, safeAt)
        const dataUrl = await this.toDataUrl(posterPath)
        const ready: PosterStatus = {
          filePath: sourcePath,
          posterPath,
          dataUrl,
          status: 'ready'
        }
        this.cache.set(key, ready)
        return ready
      } catch (error) {
        const failed: PosterStatus = {
          filePath: sourcePath,
          posterPath: null,
          dataUrl: null,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
        this.cache.set(key, failed)
        return failed
      }
    }

    // Serialize encodes so importing 10 long POVs does not spawn 10 ffmpeg seeks.
    const wait = this.chain.then(run, run)
    this.chain = wait.then(
      () => undefined,
      () => undefined
    )
    return wait
  }
}

async function extractPoster(
  bin: string,
  input: string,
  output: string,
  atSeconds: number
): Promise<void> {
  const workRoot = asciiWorkRoot(output)
  const inputAlias = await materializeAsciiInput(input, workRoot)
  try {
    await withAsciiOutput(output, workRoot, async (asciiOut) => {
      await new Promise<void>((resolve, reject) => {
        // -ss before -i: keyframe seek, critical for multi‑hour files.
        const args = [
          '-hide_banner',
          '-nostdin',
          '-ss',
          String(Math.max(0, atSeconds)),
          '-i',
          inputAlias.path,
          '-an',
          '-frames:v',
          '1',
          '-vf',
          'scale=320:-2',
          '-q:v',
          '8',
          '-y',
          asciiOut
        ]
        const child = spawn(bin, args, { windowsHide: true })
        let stderr = ''
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error('生成封面超时'))
        }, 25_000)
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
          if (stderr.length > 4000) stderr = stderr.slice(-4000)
        })
        child.on('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          if (code === 0) resolve()
          else reject(new Error(`FFmpeg 退出码 ${code}: ${stderr.trim() || '无输出'}`))
        })
      })
    })
  } finally {
    await inputAlias.cleanup()
  }
}
