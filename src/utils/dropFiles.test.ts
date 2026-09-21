import { describe, expect, it } from 'vitest'
import { dataTransferHasFiles } from './dropFiles'

describe('dataTransferHasFiles', () => {
  it('reads the FrozenArray includes API', () => {
    expect(dataTransferHasFiles({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(dataTransferHasFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false)
  })

  it('reads the legacy DOMStringList contains API', () => {
    const types = {
      contains: (type: string) => type === 'Files'
    }
    expect(dataTransferHasFiles({ types } as unknown as DataTransfer)).toBe(true)
  })
})
