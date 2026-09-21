export function dataTransferHasFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer?.types) return false
  const types = dataTransfer.types as ArrayLike<string> & {
    contains?: (type: string) => boolean
    includes?: (type: string) => boolean
  }
  if (typeof types.contains === 'function') return types.contains('Files')
  if (typeof types.includes === 'function') return types.includes('Files')
  return Array.from(types).includes('Files')
}

export async function pathsFromDroppedFiles(fileList: FileList | File[]): Promise<string[]> {
  const files = Array.from(fileList)
  const paths: string[] = []
  for (const file of files) {
    const filePath = window.povApi.getPathForFile(file)
    if (filePath) paths.push(filePath)
  }
  if (paths.length === 0) return []
  return window.povApi.registerPaths(paths)
}
