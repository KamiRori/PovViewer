import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/** Compiled main lives at `<project>/out/main/index.js`. */
export function projectRootFromMainBundle(mainDir = __dirname): string {
  return join(mainDir, '../..')
}

/** Dev-mode cache root next to the repo. */
export function projectUserDataPath(mainDir = __dirname): string {
  return join(projectRootFromMainBundle(mainDir), 'minecraft-pov-viewer')
}

/**
 * Resolve where proxies/posters/Chromium session data should live.
 * - Dev: `<repo>/minecraft-pov-viewer`
 * - Portable exe: next to the executable
 * - Installed build: Electron default userData (%APPDATA%/…)
 */
export function resolveUserDataPath(options: {
  isPackaged: boolean
  mainDir?: string
  execPath?: string
  portableDir?: string | null
  defaultUserData?: string
}): string {
  if (!options.isPackaged) {
    return projectUserDataPath(options.mainDir)
  }
  const portable = options.portableDir?.trim()
  if (portable) {
    return join(portable, 'minecraft-pov-viewer')
  }
  if (options.defaultUserData && options.defaultUserData.trim() !== '') {
    return options.defaultUserData
  }
  const execDir = dirname(options.execPath ?? process.execPath)
  return join(execDir, 'minecraft-pov-viewer')
}

function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return true
  }
}

/**
 * Copy legacy Electron userData into the chosen cache folder when empty.
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
 * Point Electron userData at the resolved cache root before app ready.
 */
export function applyProjectUserData(mainDir = __dirname): { from: string; to: string } {
  const from = app.getPath('userData')
  const to = resolveUserDataPath({
    isPackaged: app.isPackaged,
    mainDir,
    execPath: process.execPath,
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR ?? null,
    defaultUserData: from
  })
  if (to === from) {
    mkdirSync(to, { recursive: true })
    console.log(`[cache] userData → ${to} (default)`)
    return { from, to }
  }
  mkdirSync(to, { recursive: true })
  migrateLegacyUserData(from, to)
  app.setPath('userData', to)
  console.log(`[cache] userData → ${to}`)
  return { from, to }
}
