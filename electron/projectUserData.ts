import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Compiled main lives at `<project>/out/main/index.js`. */
export function projectRootFromMainBundle(mainDir = __dirname): string {
  return join(mainDir, '../..')
}

/** Project-local cache root (proxies, posters, Chromium session data). */
export function projectUserDataPath(mainDir = __dirname): string {
  return join(projectRootFromMainBundle(mainDir), 'minecraft-pov-viewer')
}

function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return true
  }
}

/**
 * Copy legacy Electron userData (e.g. %APPDATA%/minecraft-pov-viewer) into the
 * project folder when the destination is still empty / missing cache dirs.
 */
export function migrateLegacyUserData(from: string, to: string): void {
  if (from === to || !existsSync(from)) return

  mkdirSync(to, { recursive: true })

  if (isEmptyDir(to)) {
    try {
      cpSync(from, to, { recursive: true })
      console.log(`[cache] migrated userData ${from} → ${to}`)
    } catch (error) {
      console.warn('[cache] full userData migrate failed', error)
    }
    return
  }

  for (const name of ['proxies', 'posters'] as const) {
    const src = join(from, name)
    const dest = join(to, name)
    if (!existsSync(src) || existsSync(dest)) continue
    try {
      cpSync(src, dest, { recursive: true })
      console.log(`[cache] migrated ${name} → ${dest}`)
    } catch (error) {
      console.warn(`[cache] migrate ${name} failed`, error)
    }
  }
}

/**
 * Point Electron userData at `<project>/minecraft-pov-viewer` before app ready.
 * Must run once at process start (before `app.whenReady()`).
 */
export function applyProjectUserData(mainDir = __dirname): { from: string; to: string } {
  const from = app.getPath('userData')
  const to = projectUserDataPath(mainDir)
  mkdirSync(to, { recursive: true })
  migrateLegacyUserData(from, to)
  app.setPath('userData', to)
  console.log(`[cache] userData → ${to}`)
  return { from, to }
}
