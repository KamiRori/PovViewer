import type { SyncResult } from './types'

export interface SyncFileV1 {
  version: 1
  povs: SyncResult[]
}

export type ParseSyncResult =
  | { ok: true; results: SyncResult[] }
  | { ok: false; error: string }

export function parseSyncJson(text: string): ParseSyncResult {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: 'sync.json 不是有效的 JSON' }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'sync.json 根节点必须是对象' }
  }

  const record = raw as Record<string, unknown>
  if (record.version !== 1) {
    return { ok: false, error: '仅支持 sync.json version 1' }
  }
  if (!Array.isArray(record.povs)) {
    return { ok: false, error: 'sync.json 缺少 povs 数组' }
  }

  const results: SyncResult[] = []
  for (const [index, entry] of record.povs.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `povs[${index}] 格式无效` }
    }
    const item = entry as Record<string, unknown>
    if (typeof item.playerName !== 'string' || item.playerName.trim() === '') {
      return { ok: false, error: `povs[${index}].playerName 无效` }
    }
    if (typeof item.offset !== 'number' || !Number.isFinite(item.offset)) {
      return { ok: false, error: `povs[${index}].offset 无效` }
    }
    const result: SyncResult = {
      playerName: item.playerName,
      offset: item.offset
    }
    if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
      result.confidence = item.confidence
    }
    results.push(result)
  }

  return { ok: true, results }
}
