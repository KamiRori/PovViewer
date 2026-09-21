import { describe, expect, it } from 'vitest'
import { playerNameFromPath, uniquePlayerName } from './playerName'

describe('playerNameFromPath', () => {
  it('uses the file name without its extension', () => {
    expect(playerNameFromPath('D:/POV/Alice.mp4')).toBe('Alice')
  })

  it('keeps earlier dots and removes only the last extension', () => {
    expect(playerNameFromPath('D:/POV/Alice.final.mp4')).toBe('Alice.final')
  })

  it('keeps a name that has no extension', () => {
    expect(playerNameFromPath('D:/POV/Alice')).toBe('Alice')
  })

  it('reads Windows separators', () => {
    expect(playerNameFromPath('D:\\POV\\Bob.mov')).toBe('Bob')
  })
})

describe('uniquePlayerName', () => {
  it('appends a numeric suffix when the name is taken', () => {
    expect(uniquePlayerName('Alice', ['Alice'])).toBe('Alice (2)')
    expect(uniquePlayerName('Alice', ['Alice', 'Alice (2)'])).toBe('Alice (3)')
  })

  it('keeps the original name when it is free', () => {
    expect(uniquePlayerName('Alice', ['Bob'])).toBe('Alice')
  })
})
