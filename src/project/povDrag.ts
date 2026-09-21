export const POV_DRAG_MIME = 'application/x-pov-viewer-pov-id'

export function setPovDragData(dataTransfer: DataTransfer, id: string): void {
  dataTransfer.setData(POV_DRAG_MIME, id)
  dataTransfer.setData('text/plain', id)
  dataTransfer.effectAllowed = 'move'
}

export function dataTransferHasPovId(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer?.types) return false
  return Array.from(dataTransfer.types).includes(POV_DRAG_MIME)
}

export function readPovDragId(dataTransfer: DataTransfer | null | undefined): string | null {
  if (!dataTransfer) return null
  const id = dataTransfer.getData(POV_DRAG_MIME) || dataTransfer.getData('text/plain')
  return id || null
}
