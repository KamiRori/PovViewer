/**
 * Serialize expensive seeks across POV cards.
 * Concurrent hard/sample seeks on two videos often make one smooth and one stutter.
 */

let hardSeekOwner: string | null = null
let sampleSeekOwner: string | null = null

export function tryAcquireHardSeek(ownerId: string): boolean {
  if (hardSeekOwner && hardSeekOwner !== ownerId) return false
  hardSeekOwner = ownerId
  return true
}

export function releaseHardSeek(ownerId: string): void {
  if (hardSeekOwner === ownerId) hardSeekOwner = null
}

export function tryAcquireSampleSeek(ownerId: string): boolean {
  if (sampleSeekOwner && sampleSeekOwner !== ownerId) return false
  sampleSeekOwner = ownerId
  return true
}

export function releaseSampleSeek(ownerId: string): void {
  if (sampleSeekOwner === ownerId) sampleSeekOwner = null
}

/** Test helper */
export function resetSeekGatesForTests(): void {
  hardSeekOwner = null
  sampleSeekOwner = null
}
