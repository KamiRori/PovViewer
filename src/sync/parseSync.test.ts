import { describe, expect, it } from 'vitest'
import { parseSyncJson } from './parseSync'

describe('parseSyncJson', () => {
  it('parses a valid version 1 file and keeps confidence', () => {
    const parsed = parseSyncJson(
      JSON.stringify({
        version: 1,
        povs: [
          { playerName: 'Alice', offset: 0 },
          { playerName: 'Bob', offset: 13.42, confidence: 0.9 }
        ]
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.results).toEqual([
      { playerName: 'Alice', offset: 0 },
      { playerName: 'Bob', offset: 13.42, confidence: 0.9 }
    ])
  })

  it('rejects unsupported versions', () => {
    const parsed = parseSyncJson(JSON.stringify({ version: 2, povs: [] }))
    expect(parsed.ok).toBe(false)
  })

  it('rejects malformed offsets', () => {
    const parsed = parseSyncJson(
      JSON.stringify({ version: 1, povs: [{ playerName: 'Alice', offset: 'late' }] })
    )
    expect(parsed.ok).toBe(false)
  })
})
