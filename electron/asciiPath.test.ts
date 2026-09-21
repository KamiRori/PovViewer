import { describe, expect, it } from 'vitest'
import { hasNonAscii, asciiWorkRoot } from './asciiPath'

describe('hasNonAscii', () => {
  it('detects Chinese desktop paths', () => {
    expect(hasNonAscii('D:\\桌面\\PovViewer\\a.mp4')).toBe(true)
    expect(hasNonAscii('D:\\POV\\a.mp4')).toBe(false)
  })
})

describe('asciiWorkRoot', () => {
  it('uses drive-root ASCII folder on Windows-style paths', () => {
    expect(asciiWorkRoot('D:\\桌面\\PovViewer\\out.mp4').replace(/\\/g, '/')).toBe('D:/pov-viewer-work')
  })
})
