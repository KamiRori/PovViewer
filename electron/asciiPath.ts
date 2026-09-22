import { createHash } from 'node:crypto'
import { copyFile, link, mkdir, access, unlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, parse } from 'node:path'
import { execFile } from 'node:child_process'

/** True when the path contains characters outside printable ASCII. */
export function hasNonAscii(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) return true
  }
  return false
}

function pathHash(filePath: string): string {
  return createHash('sha1').update(filePath.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 16)
}

/**
 * Prefer a same-volume ASCII work root so hardlinks of multi‑GB OBS files work.
 * Falls back to os.tmpdir() when the drive root is unavailable.
 */
export function asciiWorkRoot(anchorPath: string): string {
  const normalized = anchorPath.replace(/\//g, '\\')
  const drive = /^([A-Za-z]:)([\\/]|$)/.exec(normalized)
  if (drive?.[1]) {
    return `${drive[1]}\\pov-viewer-work`
  }
  try {
    const { root } = parse(anchorPath)
    if (root && !hasNonAscii(root)) {
      return join(root, 'pov-viewer-work')
    }
  } catch {
    // ignore
  }
  return join(tmpdir(), 'pov-viewer-work')
}

async function windowsShortPath(longPath: string): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const escaped = longPath.replace(/'/g, "''")
  const script = `
$ErrorActionPreference = 'Stop'
$p = '${escaped}'
$fso = New-Object -ComObject Scripting.FileSystemObject
if (Test-Path -LiteralPath $p -PathType Leaf) { $fso.GetFile($p).ShortPath }
elseif (Test-Path -LiteralPath $p -PathType Container) { $fso.GetFolder($p).ShortPath }
else { throw 'missing' }
`
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const short = String(stdout ?? '').trim()
        resolve(short && !hasNonAscii(short) ? short : null)
      }
    )
  })
}

export interface AsciiAlias {
  path: string
  cleanup: () => Promise<void>
}

/**
 * Give FFmpeg an ASCII-only path for a media file.
 * Order: as-is → hardlink in ASCII work root → Windows 8.3 short path.
 * Never copies the media file (multi‑GB OBS takes would hang for hours).
 */
export async function materializeAsciiInput(
  sourcePath: string,
  workRoot: string,
  options?: { force?: boolean }
): Promise<AsciiAlias> {
  if (!options?.force && !hasNonAscii(sourcePath)) {
    return { path: sourcePath, cleanup: async () => undefined }
  }

  await mkdir(workRoot, { recursive: true })
  const alias = join(workRoot, `in-${pathHash(sourcePath)}${extname(sourcePath) || '.mp4'}`)
  try {
    await unlink(alias)
  } catch {
    // ok
  }

  try {
    await link(sourcePath, alias)
    return {
      path: alias,
      cleanup: async () => {
        await unlink(alias).catch(() => undefined)
      }
    }
  } catch (error) {
    console.warn('[path] hardlink failed, trying short path', error)
  }

  const short = await windowsShortPath(sourcePath)
  if (short) {
    return { path: short, cleanup: async () => undefined }
  }

  // Last resort: hope the original path works (may still fail on some ffmpeg builds).
  console.warn('[path] no ASCII alias for', sourcePath)
  return { path: sourcePath, cleanup: async () => undefined }
}

/**
 * Copy the bundled ffmpeg binary to an ASCII location when the install path
 * itself contains non-ASCII characters (common on Windows Desktop folders).
 */
export async function resolveAsciiFfmpegBinary(bundledPath: string): Promise<string> {
  if (!hasNonAscii(bundledPath)) return bundledPath
  const destDir = join(tmpdir(), 'pov-ffmpeg-bin')
  const dest = join(destDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  await mkdir(destDir, { recursive: true })
  try {
    await access(dest)
  } catch {
    await copyFile(bundledPath, dest)
  }
  return dest
}

/** Encode to ASCII temp, then move/copy into the (possibly Unicode) final path. */
export async function withAsciiOutput(
  finalOutput: string,
  workRoot: string,
  encodeTo: (asciiOutput: string) => Promise<void>
): Promise<void> {
  await mkdir(dirname(finalOutput), { recursive: true })
  if (!hasNonAscii(finalOutput)) {
    await encodeTo(finalOutput)
    return
  }

  await mkdir(workRoot, { recursive: true })
  const tempOut = join(workRoot, `out-${pathHash(finalOutput)}${extname(finalOutput) || '.mp4'}`)
  try {
    await unlink(tempOut)
  } catch {
    // ok
  }
  await encodeTo(tempOut)
  await copyFile(tempOut, finalOutput)
  await unlink(tempOut).catch(() => undefined)
}

export async function clearAsciiWork(workRoot: string): Promise<void> {
  await rm(workRoot, { recursive: true, force: true }).catch(() => undefined)
}
