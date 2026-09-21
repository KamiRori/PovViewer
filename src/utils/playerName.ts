export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

export function playerNameFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return fileName
  return fileName.slice(0, dot)
}

export function playerNameFromPath(filePath: string): string {
  return playerNameFromFileName(fileNameFromPath(filePath))
}

export function uniquePlayerName(baseName: string, usedNames: readonly string[]): string {
  if (!usedNames.includes(baseName)) return baseName
  let index = 2
  while (usedNames.includes(`${baseName} (${index})`)) index += 1
  return `${baseName} (${index})`
}

export function pathIdentity(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
}
