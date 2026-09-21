import { open, type FileHandle } from 'node:fs/promises'
import { extname } from 'node:path'

/**
 * Read duration from MP4/MOV mvhd without decoding.
 * Long OBS recordings often put `moov` near EOF — scanning the tail is enough
 * and avoids Chromium/ffmpeg seeking through multi‑GB mdat.
 */

const MAX_TAIL_SCAN = 64 * 1024 * 1024
const HEAD_SCAN = 8 * 1024 * 1024

function readUInt32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset)
}

function readUInt64BE(buf: Buffer, offset: number): number {
  const high = buf.readUInt32BE(offset)
  const low = buf.readUInt32BE(offset + 4)
  return high * 2 ** 32 + low
}

function boxType(buf: Buffer, offset: number): string {
  return buf.toString('ascii', offset + 4, offset + 8)
}

function findTopLevelMoov(
  buf: Buffer,
  fileOffset: number
): { payloadStart: number; payloadSize: number } | null {
  let offset = 0
  while (offset + 8 <= buf.length) {
    let size = readUInt32BE(buf, offset)
    const type = boxType(buf, offset)
    let header = 8
    if (size === 1) {
      if (offset + 16 > buf.length) break
      size = readUInt64BE(buf, offset + 8)
      header = 16
    } else if (size === 0) {
      size = buf.length - offset
    }
    if (!Number.isFinite(size) || size < header) break
    if (type === 'moov') {
      return {
        payloadStart: fileOffset + offset + header,
        payloadSize: size - header
      }
    }
    // Prevent infinite loops on corrupt size.
    if (size > buf.length && fileOffset === 0 && offset === 0 && type !== 'moov') {
      // First box larger than head buffer (usually mdat) — stop head walk.
      break
    }
    offset += size
    if (offset <= 0) break
  }
  return null
}

function parseMvhdDuration(moov: Buffer): number | null {
  let offset = 0
  while (offset + 8 <= moov.length) {
    let size = readUInt32BE(moov, offset)
    const type = boxType(moov, offset)
    let header = 8
    if (size === 1) {
      if (offset + 16 > moov.length) return null
      size = readUInt64BE(moov, offset + 8)
      header = 16
    } else if (size === 0) {
      size = moov.length - offset
    }
    if (!Number.isFinite(size) || size < header) return null

    if (type === 'mvhd') {
      const body = offset + header
      if (body + 1 > moov.length) return null
      const version = moov[body]
      if (version === 1) {
        if (body + 32 > moov.length) return null
        const timescale = readUInt32BE(moov, body + 20)
        const duration = readUInt64BE(moov, body + 24)
        if (timescale <= 0) return null
        return duration / timescale
      }
      if (body + 20 > moov.length) return null
      const timescale = readUInt32BE(moov, body + 12)
      const duration = readUInt32BE(moov, body + 16)
      if (timescale <= 0) return null
      return duration / timescale
    }

    offset += size
    if (offset <= 0) return null
  }
  return null
}

async function readRange(handle: FileHandle, start: number, length: number): Promise<Buffer> {
  const buf = Buffer.allocUnsafe(length)
  const { bytesRead } = await handle.read(buf, 0, length, start)
  return bytesRead === length ? buf : buf.subarray(0, bytesRead)
}

async function durationFromMoov(
  handle: FileHandle,
  fileSize: number,
  payloadStart: number,
  payloadSize: number
): Promise<number | null> {
  if (payloadSize <= 0 || payloadStart + payloadSize > fileSize) return null
  // Guard absurd moov sizes.
  if (payloadSize > 256 * 1024 * 1024) return null
  const moov = await readRange(handle, payloadStart, payloadSize)
  const duration = parseMvhdDuration(moov)
  if (duration === null || !Number.isFinite(duration) || duration < 0) return null
  return duration
}

export async function readMp4Duration(filePath: string): Promise<number | null> {
  const handle = await open(filePath, 'r')
  try {
    const stat = await handle.stat()
    const fileSize = stat.size
    if (fileSize < 16) return null

    const headLen = Math.min(HEAD_SCAN, fileSize)
    const headBuf = await readRange(handle, 0, headLen)
    const headMoov = findTopLevelMoov(headBuf, 0)
    if (headMoov) {
      const duration = await durationFromMoov(
        handle,
        fileSize,
        headMoov.payloadStart,
        headMoov.payloadSize
      )
      if (duration !== null) return duration
    }

    const tailLen = Math.min(MAX_TAIL_SCAN, fileSize)
    const tailStart = fileSize - tailLen
    const tailBuf = await readRange(handle, tailStart, tailLen)

    for (let i = 0; i + 8 <= tailBuf.length; i += 1) {
      if (
        tailBuf[i + 4] === 0x6d &&
        tailBuf[i + 5] === 0x6f &&
        tailBuf[i + 6] === 0x6f &&
        tailBuf[i + 7] === 0x76
      ) {
        let size = readUInt32BE(tailBuf, i)
        let header = 8
        if (size === 1) {
          if (i + 16 > tailBuf.length) continue
          size = readUInt64BE(tailBuf, i + 8)
          header = 16
        }
        if (size < header || size > fileSize) continue
        const payloadStart = tailStart + i + header
        const payloadSize = size - header
        const duration = await durationFromMoov(handle, fileSize, payloadStart, payloadSize)
        if (duration !== null) return duration
      }
    }

    return null
  } finally {
    await handle.close()
  }
}

export function isMp4LikePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return ext === '.mp4' || ext === '.mov' || ext === '.m4v'
}
