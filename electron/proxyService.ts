import { createHash } from 'node:crypto'
import { access, mkdir, stat } from 'node:fs/promises'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { encodePreviewProxyFast, resolveJobParallelism } from './proxyEncode'

export type ProxyKind = 'preview'

export type ProxyJobStatus = 'ready' | 'pending' | 'error' | 'missing'

export interface ProxyStatus {
  kind: ProxyKind
  status: ProxyJobStatus
  sourcePath: string
  proxyPath: string | null
  error?: string
}

export interface ProxyJobProgress {
  sourcePath: string
  phase: 'start' | 'encode' | 'done' | 'error'
  /** 0–1 progress within the active file. */
  fileFraction: number
}

const PREVIEW_LABEL = 'preview-320x180-15fps-v5'

interface QueueItem {
  sourcePath: string
  kind: ProxyKind
  resolve: (status: ProxyStatus) => void
  reject: (error: Error) => void
}

/**
 * Parallel ffmpeg file-jobs for intentional 「生成预览代理」.
 * Override with POV_PROXY_CONCURRENCY.
 */
export function resolveProxyConcurrency(
  cpuCount = cpus().length,
  envValue = process.env.POV_PROXY_CONCURRENCY
): number {
  const parsed = envValue != null && envValue.trim() !== '' ? Number.parseInt(envValue, 10) : NaN
  if (Number.isFinite(parsed) && parsed >= 1) return Math.min(64, parsed)
  const n = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 4
  // Prefer higher file parallelism; short segments make this safer than before.
  return Math.max(1, Math.min(6, Math.ceil(n / 3)))
}

export class ProxyService {
  private readonly statuses = new Map<string, ProxyStatus>()
  private readonly queue: QueueItem[] = []
  /** Extra resolvers waiting on an in-flight encode for the same key. */
  private readonly waiters = new Map<string, Array<(status: ProxyStatus) => void>>()
  private running = 0
  private readonly concurrency: number
  private readonly cpuCount: number
  private dirReady: Promise<string> | null = null
  private progressHandler: ((progress: ProxyJobProgress) => void) | null = null

  constructor(concurrency = resolveProxyConcurrency(), cpuCount = cpus().length) {
    this.concurrency = concurrency
    this.cpuCount = cpuCount > 0 ? cpuCount : 4
    console.log(`[proxy] encode concurrency = ${this.concurrency} (cpus=${this.cpuCount})`)
  }

  setProgressHandler(handler: ((progress: ProxyJobProgress) => void) | null): void {
    this.progressHandler = handler
  }

  private emitProgress(progress: ProxyJobProgress): void {
    try {
      this.progressHandler?.(progress)
    } catch (error) {
      console.warn('[proxy] progress handler failed', error)
    }
  }

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
        console.log(`[proxy] proxies dir → ${dir}`)
        return dir
      })()
    }
    return this.dirReady
  }

  async getProxiesDir(): Promise<string> {
    return this.proxiesDir()
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
    this.emitProgress({ sourcePath: item.sourcePath, phase: 'start', fileFraction: 0 })
    try {
      const s = await stat(item.sourcePath)
      const dir = await this.proxiesDir()
      const proxyPath = join(
        dir,
        `${this.cacheKey(item.sourcePath, item.kind, s.size, s.mtimeMs)}.mp4`
      )

      const started = Date.now()
      let lastEmit = 0
      const stats = await encodePreviewProxyFast(null, item.sourcePath, proxyPath, {
        threads: resolveJobParallelism(this.cpuCount, this.running, this.queue.length),
        cpuCount: this.cpuCount,
        runningJobs: this.running,
        onProgress: ({ fraction }) => {
          const now = Date.now()
          if (fraction < 1 && now - lastEmit < 400) return
          lastEmit = now
          this.emitProgress({
            sourcePath: item.sourcePath,
            phase: 'encode',
            fileFraction: fraction
          })
        }
      })
      console.log(
        `[proxy] ready ${item.sourcePath} in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
          `(encoder=${stats.encoder}, mode=${stats.mode}, segments=${stats.segments}, threads=${stats.threads}, duration=${stats.duration ?? '?'})`
      )

      const ready: ProxyStatus = {
        kind: item.kind,
        status: 'ready',
        sourcePath: item.sourcePath,
        proxyPath
      }
      this.statuses.set(key, ready)
      this.emitProgress({ sourcePath: item.sourcePath, phase: 'done', fileFraction: 1 })
      item.resolve(ready)
      this.settleWaiters(key, ready)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[proxy] failed ${item.sourcePath}`, message)
      const failed: ProxyStatus = {
        kind: item.kind,
        status: 'error',
        sourcePath: item.sourcePath,
        proxyPath: null,
        error: message
      }
      this.statuses.set(key, failed)
      this.emitProgress({ sourcePath: item.sourcePath, phase: 'error', fileFraction: 0 })
      item.resolve(failed)
      this.settleWaiters(key, failed)
    }
  }
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
