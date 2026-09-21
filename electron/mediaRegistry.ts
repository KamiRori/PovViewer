import path from 'node:path'

export interface RegisteredMedia {
  absolutePath: string
  url: string
}

export class MediaRegistry {
  private readonly allowed = new Map<string, string>()

  register(filePath: string): RegisteredMedia {
    const absolutePath = path.resolve(filePath)
    this.allowed.set(pathKey(absolutePath), absolutePath)
    return { absolutePath, url: mediaUrlFor(absolutePath) }
  }

  urlFor(filePath: string): string | null {
    const absolutePath = this.allowed.get(pathKey(path.resolve(filePath)))
    return absolutePath ? mediaUrlFor(absolutePath) : null
  }

  resolveRequest(requestUrl: string): string | null {
    let url: URL
    try {
      url = new URL(requestUrl)
    } catch {
      return null
    }
    if (url.protocol !== 'pov:' || url.hostname !== 'media') return null
    const raw = url.searchParams.get('path')
    if (!raw) return null
    return this.allowed.get(pathKey(path.resolve(raw))) ?? null
  }
}

export function mediaUrlFor(absolutePath: string): string {
  const url = new URL('pov://media/')
  url.searchParams.set('path', absolutePath)
  return url.href
}

function pathKey(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
