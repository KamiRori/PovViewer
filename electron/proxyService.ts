import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'

export type ProxyKind = 'preview'

export type ProxyJobStatus = 'ready' | 'pending' | 'error' | 'missing'

export interface ProxyStatus {
  kind: ProxyKind
  status: ProxyJobStatus
  sourcePath: string
  proxyPath: string | null
  error?: string
}

const PREVIEW_LABEL = 'preview-320x180-15fps-v1'

interface QueueItem {
  sourcePath: string
  kind: ProxyKind
  resolve: (status: ProxyStatus) => void
  reject: (error: Error) => void
}

export class ProxyService {
  private readonly statuses = new Map<string, ProxyStatus>()
  private readonly queue: QueueItem[] = []
  /** Extra resolvers waiting on an in-flight encode for the same key. */
  private readonly waiters = new Map<string, Array<(status: ProxyStatus) => void>>()
  private running = 0
  private readonly concurrency = 1
  private dirReady: Promise<string> | null = null

  private cacheKey(sourcePath: string, kind: ProxyKind, size: number, mtimeMs: number): string {
    const hash = createHash('sha1')
    hash.update(sourcePath)
    hash.update('|')
    hash.update(String(size))
    hash.update('|')
    hash.update(String(mtimeMs))
    hash.update('|')
    hash.update(kind === 'preview' ? PREVIEW_LABEL : kind)
    return hash.digest('hex')
  }

  private statusKey(sourcePath: string, kind: ProxyKind): string {
    return `${kind}:${sourcePath.replace(/\\/g, '/').toLowerCase()}`
  }

  private async proxiesDir(): Promise<string> {
    if (!this.dirReady) {
      this.dirReady = (async () => {
        const dir = join(app.getPath('userData'), 'proxies')
        await mkdir(dir, { recursive: true })
        return dir
      })()
    }
    return this.dirReady
  }

  getStatus(sourcePath: string, kind: ProxyKind = 'preview'): ProxyStatus | null {
    return this.statuses.get(this.statusKey(sourcePath, kind)) ?? null
  }

  /**
   * Return a ready proxy if one already exists on disk / in memory.
   * Never starts encoding — critical for multi‑hour OBS files.
   */
  async lookupPreview(sourcePath: string): Promise<ProxyStatus | null> {
    const kind: ProxyKind = 'preview'
    const key = this.statusKey(sourcePath, kind)
    const existing = this.statuses.get(key)
    if (existing?.status === 'ready' && existing.proxyPath) {
      try {
        await access(existing.proxyPath)
        return existing
      } catch {
        // fall through
      }
    }
    if (existing?.status === 'pending') return existing

    let info: { size: number; mtimeMs: number }
    try {
      const s = await stat(sourcePath)
      info = { size: s.size, mtimeMs: s.mtimeMs }
    } catch {
      return null
    }

    const dir = await this.proxiesDir()
    const proxyPath = join(dir, `${this.cacheKey(sourcePath, kind, info.size, info.mtimeMs)}.mp4`)
    try {
      await access(proxyPath)
      const ready: ProxyStatus = { kind, status: 'ready', sourcePath, proxyPath }
      this.statuses.set(key, ready)
      return ready
    } catch {
      return null
    }
  }

  async ensurePreview(sourcePath: string): Promise<ProxyStatus> {
    const kind: ProxyKind = 'preview'
    const key = this.statusKey(sourcePath, kind)
    const existing = this.statuses.get(key)
    if (existing?.status === 'ready' && existing.proxyPath) {
      try {
        await access(existing.proxyPath)
        return existing
      } catch {
        // fall through and rebuild
      }
    }

    let info: { size: number; mtimeMs: number }
    try {
      const s = await stat(sourcePath)
      info = { size: s.size, mtimeMs: s.mtimeMs }
    } catch {
      const missing: ProxyStatus = {
        kind,
        status: 'missing',
        sourcePath,
        proxyPath: null,
        error: '源文件不存在'
      }
      this.statuses.set(key, missing)
      return missing
    }

    const dir = await this.proxiesDir()
    const proxyPath = join(dir, `${this.cacheKey(sourcePath, kind, info.size, info.mtimeMs)}.mp4`)
    try {
      await access(proxyPath)
      const ready: ProxyStatus = {
        kind,
        status: 'ready',
        sourcePath,
        proxyPath
      }
      this.statuses.set(key, ready)
      return ready
    } catch {
      // need encode
    }

    if (existing?.status === 'pending') {
      return new Promise<ProxyStatus>((resolve) => {
        const list = this.waiters.get(key) ?? []
        list.push(resolve)
        this.waiters.set(key, list)
      })
    }

    const pending: ProxyStatus = {
      kind,
      status: 'pending',
      sourcePath,
      proxyPath: null
    }
    this.statuses.set(key, pending)

    return new Promise<ProxyStatus>((resolve, reject) => {
      this.queue.push({ sourcePath, kind, resolve, reject })
      this.pump()
    })
  }

  private settleWaiters(key: string, status: ProxyStatus): void {
    const list = this.waiters.get(key)
    if (!list || list.length === 0) return
    this.waiters.delete(key)
    for (const resolve of list) resolve(status)
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()
      if (!item) return
      this.running += 1
      void this.runJob(item).finally(() => {
        this.running -= 1
        this.pump()
      })
    }
  }

  private async runJob(item: QueueItem): Promise<void> {
    const key = this.statusKey(item.sourcePath, item.kind)
    try {
      if (!ffmpegPath) {
        throw new Error('未找到内置 FFmpeg')
      }
      const s = await stat(item.sourcePath)
      const dir = await this.proxiesDir()
      const proxyPath = join(
        dir,
        `${this.cacheKey(item.sourcePath, item.kind, s.size, s.mtimeMs)}.mp4`
      )

      await encodePreviewProxy(ffmpegPath, item.sourcePath, proxyPath)

      const ready: ProxyStatus = {
        kind: item.kind,
        status: 'ready',
        sourcePath: item.sourcePath,
        proxyPath
      }
      this.statuses.set(key, ready)
      item.resolve(ready)
      this.settleWaiters(key, ready)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed: ProxyStatus = {
        kind: item.kind,
        status: 'error',
        sourcePath: item.sourcePath,
        proxyPath: null,
        error: message
      }
      this.statuses.set(key, failed)
      item.resolve(failed)
      this.settleWaiters(key, failed)
    }
  }
}

function encodePreviewProxy(bin: string, input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      input,
      '-vf',
      'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
      '-r',
      '15',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      output
    ]
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg 退出码 ${code}: ${stderr.trim() || '无输出'}`))
    })
  })
}

/** Pure helper for tests. */
export function buildProxyCacheKey(
  sourcePath: string,
  size: number,
  mtimeMs: number,
  label = PREVIEW_LABEL
): string {
  const hash = createHash('sha1')
  hash.update(sourcePath)
  hash.update('|')
  hash.update(String(size))
  hash.update('|')
  hash.update(String(mtimeMs))
  hash.update('|')
  hash.update(label)
  return hash.digest('hex')
}
