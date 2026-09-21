import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'

export interface PosterStatus {
  filePath: string
  posterPath: string | null
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

  private cacheKey(sourcePath: string, atSeconds: number): string {
    const hash = createHash('sha1')
    hash.update(sourcePath.replace(/\\/g, '/').toLowerCase())
    hash.update('|')
    hash.update(String(Math.round(atSeconds * 2) / 2)) // 0.5s bucket
    hash.update('|poster-480-v1')
    return hash.digest('hex')
  }

  async ensurePoster(sourcePath: string, atSeconds = 1): Promise<PosterStatus> {
    const run = async (): Promise<PosterStatus> => {
      const safeAt = Number.isFinite(atSeconds) && atSeconds > 0 ? atSeconds : 1
      const key = this.cacheKey(sourcePath, safeAt)
      const cached = this.cache.get(key)
      if (cached?.status === 'ready' && cached.posterPath) {
        try {
          await access(cached.posterPath)
          return cached
        } catch {
          // rebuild
        }
      }

      if (!ffmpegPath) {
        const failed: PosterStatus = {
          filePath: sourcePath,
          posterPath: null,
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
        const ready: PosterStatus = { filePath: sourcePath, posterPath, status: 'ready' }
        this.cache.set(key, ready)
        return ready
      } catch {
        // encode
      }

      try {
        await extractPoster(ffmpegPath, sourcePath, posterPath, safeAt)
        const ready: PosterStatus = { filePath: sourcePath, posterPath, status: 'ready' }
        this.cache.set(key, ready)
        return ready
      } catch (error) {
        const failed: PosterStatus = {
          filePath: sourcePath,
          posterPath: null,
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

function extractPoster(
  bin: string,
  input: string,
  output: string,
  atSeconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -ss before -i: keyframe seek, critical for multi‑hour files.
    const args = [
      '-hide_banner',
      '-nostdin',
      '-ss',
      String(Math.max(0, atSeconds)),
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-2',
      '-q:v',
      '6',
      '-y',
      output
    ]
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('生成封面超时'))
    }, 60_000)
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
}
