import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import type { MediaRegistry } from './mediaRegistry'

const deniedRequests = new Set<string>()

export function registerMediaProtocol(registry: MediaRegistry): void {
  protocol.handle('pov', (request) => serveRegisteredFile(registry, request))
}

async function serveRegisteredFile(registry: MediaRegistry, request: Request): Promise<Response> {
  const filePath = registry.resolveRequest(request.url)
  if (!filePath) {
    if (!deniedRequests.has(request.url)) {
      deniedRequests.add(request.url)
      console.warn('[media] denied unregistered path')
    }
    return new Response('forbidden', { status: 403 })
  }

  try {
    const fileStat = await stat(filePath)
    const size = fileStat.size
    const type = contentTypeFor(filePath)
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      const ranged = parseRange(rangeHeader, size)
      if (!ranged) {
        return new Response('invalid range', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${size}`,
            'Accept-Ranges': 'bytes'
          }
        })
      }

      const { start, end } = ranged
      const stream = createReadStream(filePath, { start, end })
      return new Response(nodeStreamToWeb(stream), {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      })
    }

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      })
    }

    const stream = createReadStream(filePath)
    return new Response(nodeStreamToWeb(stream), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    })
  } catch (error) {
    console.error('[media] failed to read registered file', error)
    return new Response('read failed', { status: 500 })
  }
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null

  const startText = match[1]
  const endText = match[2]
  let start: number
  let end: number

  if (startText === '' && endText === '') return null

  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Number(endText)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null
  }

  end = Math.min(end, size - 1)
  return { start, end }
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    default:
      return 'application/octet-stream'
  }
}

function nodeStreamToWeb(stream: ReturnType<typeof createReadStream>): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>
}
