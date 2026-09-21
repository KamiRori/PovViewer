import { computeTimelineRange } from '../timeline/range'
import {
  DEFAULT_PLAYBACK_SOURCE,
  isPlaybackSource,
  type POV,
  type POVRuntime,
  type PlaybackSource
} from './types'

export interface ProjectFilePovV1 {
  id: string
  playerName: string
  filePath: string
  offset: number
  enabled: boolean
  muted: boolean
  /** Optional for older project.json files. */
  playbackSource?: PlaybackSource
}

export interface ProjectFileV1 {
  version: 1
  masterDuration: number
  povs: ProjectFilePovV1[]
}

export type ParseProjectResult =
  | { ok: true; project: ProjectFileV1; runtime: POVRuntime[] }
  | { ok: false; error: string }

export function serializeProject(povs: readonly POVRuntime[]): ProjectFileV1 {
  const range = computeTimelineRange(povs)
  return {
    version: 1,
    masterDuration: range.duration,
    povs: povs.map((pov) => ({
      id: pov.id,
      playerName: pov.playerName,
      filePath: pov.filePath,
      offset: pov.offset,
      enabled: pov.enabled,
      muted: pov.muted,
      playbackSource: pov.playbackSource
    }))
  }
}

export function projectToJson(povs: readonly POVRuntime[]): string {
  return `${JSON.stringify(serializeProject(povs), null, 2)}\n`
}

function asPovEntry(entry: unknown, index: number): ProjectFilePovV1 | string {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return `povs[${index}] 格式无效`
  }
  const item = entry as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id.trim() === '') {
    return `povs[${index}].id 无效`
  }
  if (typeof item.playerName !== 'string' || item.playerName.trim() === '') {
    return `povs[${index}].playerName 无效`
  }
  if (typeof item.filePath !== 'string' || item.filePath.trim() === '') {
    return `povs[${index}].filePath 无效`
  }
  if (typeof item.offset !== 'number' || !Number.isFinite(item.offset)) {
    return `povs[${index}].offset 无效`
  }
  if (typeof item.enabled !== 'boolean') {
    return `povs[${index}].enabled 无效`
  }
  if (typeof item.muted !== 'boolean') {
    return `povs[${index}].muted 无效`
  }
  if (item.playbackSource !== undefined && !isPlaybackSource(item.playbackSource)) {
    return `povs[${index}].playbackSource 无效`
  }
  return {
    id: item.id,
    playerName: item.playerName,
    filePath: item.filePath,
    offset: item.offset,
    enabled: item.enabled,
    muted: item.muted,
    playbackSource: isPlaybackSource(item.playbackSource) ? item.playbackSource : undefined
  }
}

/** duration from file is ignored; metadata is re-probed after open. */
export function toRuntimePov(entry: ProjectFilePovV1, missing = false): POVRuntime {
  const pov: POV = {
    id: entry.id,
    playerName: entry.playerName,
    filePath: entry.filePath,
    duration: 0,
    offset: entry.offset,
    enabled: entry.enabled,
    muted: entry.muted,
    playbackSource: entry.playbackSource ?? DEFAULT_PLAYBACK_SOURCE
  }
  return {
    ...pov,
    metadataReady: false,
    missing
  }
}

export function parseProjectJson(text: string): ParseProjectResult {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: 'project.json 不是有效的 JSON' }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'project.json 根节点必须是对象' }
  }

  const record = raw as Record<string, unknown>
  if (record.version !== 1) {
    return { ok: false, error: '仅支持 project.json version 1' }
  }
  if (!Array.isArray(record.povs)) {
    return { ok: false, error: 'project.json 缺少 povs 数组' }
  }

  const masterDuration =
    typeof record.masterDuration === 'number' && Number.isFinite(record.masterDuration)
      ? record.masterDuration
      : 0

  const parsed: ProjectFilePovV1[] = []
  const seenIds = new Set<string>()
  for (const [index, entry] of record.povs.entries()) {
    const result = asPovEntry(entry, index)
    if (typeof result === 'string') return { ok: false, error: result }
    if (seenIds.has(result.id)) {
      return { ok: false, error: `重复的 pov id: ${result.id}` }
    }
    seenIds.add(result.id)
    parsed.push(result)
  }

  const project: ProjectFileV1 = {
    version: 1,
    masterDuration,
    povs: parsed
  }

  return {
    ok: true,
    project,
    runtime: parsed.map((entry) => toRuntimePov(entry, false))
  }
}
