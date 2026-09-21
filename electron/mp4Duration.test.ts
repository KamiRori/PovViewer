import { describe, expect, it } from 'vitest'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readMp4Duration } from './mp4Duration'

function box(type: string, payload: Buffer): Buffer {
  const size = 8 + payload.length
  const header = Buffer.alloc(8)
  header.writeUInt32BE(size, 0)
  header.write(type, 4, 4, 'ascii')
  return Buffer.concat([header, payload])
}

describe('readMp4Duration', () => {
  it('reads mvhd v0 duration from a tiny moov-at-start file', async () => {
    // mvhd v0: version(1)+flags(3)+ctime(4)+mtime(4)+timescale(4)+duration(4)+...
    const mvhdBody = Buffer.alloc(100)
    mvhdBody[0] = 0 // version
    mvhdBody.writeUInt32BE(1000, 12) // timescale
    mvhdBody.writeUInt32BE(9050000, 16) // duration ticks => 9050 seconds
    const moov = box('moov', box('mvhd', mvhdBody))
    const ftyp = box('ftyp', Buffer.from('isom'))
    const file = Buffer.concat([ftyp, moov])
    const path = join(tmpdir(), `pov-moov-test-${Date.now()}.mp4`)
    await writeFile(path, file)
    try {
      const duration = await readMp4Duration(path)
      expect(duration).toBe(9050)
    } finally {
      await unlink(path)
    }
  })
})
