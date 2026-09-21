import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { projectRootFromMainBundle, projectUserDataPath } from './projectUserData'

describe('projectUserData paths', () => {
  it('resolves project root from out/main', () => {
    const mainDir = join('/repo', 'out', 'main')
    expect(projectRootFromMainBundle(mainDir)).toBe(join('/repo'))
  })

  it('places userData under project/minecraft-pov-viewer', () => {
    const mainDir = join('/repo', 'out', 'main')
    expect(projectUserDataPath(mainDir)).toBe(join('/repo', 'minecraft-pov-viewer'))
  })
})
