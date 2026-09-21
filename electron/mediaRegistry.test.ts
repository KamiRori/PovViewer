import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { MediaRegistry } from './mediaRegistry'

describe('MediaRegistry', () => {
  it('mints a pov URL only after the path is registered', () => {
    const registry = new MediaRegistry()
    const filePath = path.resolve('samples', 'Alice.mp4')

    expect(registry.urlFor(filePath)).toBeNull()
    expect(registry.resolveRequest(mediaRequest(filePath))).toBeNull()

    const registered = registry.register(filePath)
    expect(registered.absolutePath).toBe(filePath)
    expect(registered.url.startsWith('pov://media/?path=')).toBe(true)
    expect(registry.resolveRequest(registered.url)).toBe(filePath)
  })

  it('rejects a path that is not the registered file', () => {
    const registry = new MediaRegistry()
    const allowed = path.resolve('samples', 'Alice.mp4')
    registry.register(allowed)

    const outside = path.resolve('samples', 'secret.mp4')
    expect(registry.resolveRequest(mediaRequest(outside))).toBeNull()
    expect(registry.resolveRequest(mediaRequest(path.resolve('secret.mp4')))).toBeNull()
  })

  it('does not follow a traversal escape', () => {
    const registry = new MediaRegistry()
    const allowed = path.resolve('samples', 'pov', 'Alice.mp4')
    registry.register(allowed)

    const escaped = path.resolve('samples', 'pov', '..', 'secret.mp4')
    expect(registry.resolveRequest(mediaRequest(escaped))).toBeNull()
    expect(registry.resolveRequest(mediaRequest(allowed))).toBe(allowed)
  })
})

function mediaRequest(filePath: string): string {
  const url = new URL('pov://media/')
  url.searchParams.set('path', path.resolve(filePath))
  return url.href
}
