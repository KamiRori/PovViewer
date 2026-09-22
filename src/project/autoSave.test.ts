import { describe, expect, it } from 'vitest'
import { projectNeedsAutoSave } from './autoSave'

describe('projectNeedsAutoSave', () => {
  it('skips when there is no project path', () => {
    expect(projectNeedsAutoSave(null, '{"a":1}', null)).toBe(false)
    expect(projectNeedsAutoSave('', '{"a":1}', null)).toBe(false)
  })

  it('skips when content matches the last saved snapshot', () => {
    const json = '{"version":1}'
    expect(projectNeedsAutoSave('/tmp/project.json', json, json)).toBe(false)
  })

  it('saves when path exists and content changed or never saved', () => {
    expect(projectNeedsAutoSave('/tmp/project.json', '{"a":2}', '{"a":1}')).toBe(true)
    expect(projectNeedsAutoSave('/tmp/project.json', '{"a":1}', null)).toBe(true)
  })
})
