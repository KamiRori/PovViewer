import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  projectRootFromMainBundle,
  projectUserDataPath,
  resolveUserDataPath
} from './projectUserData'

describe('projectUserData paths', () => {
  it('resolves project root from out/main', () => {
    const mainDir = join('/repo', 'out', 'main')
    expect(projectRootFromMainBundle(mainDir)).toBe(join('/repo'))
  })

  it('places userData under project/minecraft-pov-viewer in dev', () => {
    const mainDir = join('/repo', 'out', 'main')
    expect(projectUserDataPath(mainDir)).toBe(join('/repo', 'minecraft-pov-viewer'))
    expect(
      resolveUserDataPath({ isPackaged: false, mainDir })
    ).toBe(join('/repo', 'minecraft-pov-viewer'))
  })

  it('uses portable dir when packaged as portable', () => {
    expect(
      resolveUserDataPath({
        isPackaged: true,
        portableDir: 'D:\\Apps\\MinecraftPOVViewer',
        defaultUserData: 'C:\\Users\\x\\AppData\\Roaming\\minecraft-pov-viewer'
      }).replace(/\\/g, '/')
    ).toBe('D:/Apps/MinecraftPOVViewer/minecraft-pov-viewer')
  })

  it('keeps Electron default userData for installed builds', () => {
    const def = 'C:\\Users\\x\\AppData\\Roaming\\minecraft-pov-viewer'
    expect(
      resolveUserDataPath({
        isPackaged: true,
        portableDir: null,
        defaultUserData: def
      })
    ).toBe(def)
  })
})
