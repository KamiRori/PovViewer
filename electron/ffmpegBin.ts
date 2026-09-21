import ffmpegPath from 'ffmpeg-static'
import { resolveAsciiFfmpegBinary } from './asciiPath'

let cached: Promise<string> | null = null

/** Bundled ffmpeg, relocated to an ASCII path when the install dir has non-ASCII chars. */
export function getFfmpegBinary(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      if (!ffmpegPath) throw new Error('未找到内置 FFmpeg')
      const resolved = await resolveAsciiFfmpegBinary(ffmpegPath)
      console.log(`[ffmpeg] bin → ${resolved}`)
      return resolved
    })()
  }
  return cached
}
