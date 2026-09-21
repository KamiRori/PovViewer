import { useEffect, useId, useRef } from 'react'

export interface ExportProgressDialogProps {
  open: boolean
  total: number
  completed: number
  currentName: string
  outputDir: string
  ok: number
  failed: number
  phase: 'running' | 'confirm-cancel' | 'done' | 'aborted'
  onRequestClose: () => void
  onConfirmCancel: () => void
  onDismissConfirm: () => void
  onDismiss: () => void
}

export function ExportProgressDialog({
  open,
  total,
  completed,
  currentName,
  outputDir,
  ok,
  failed,
  phase,
  onRequestClose,
  onConfirmCancel,
  onDismissConfirm,
  onDismiss
}: ExportProgressDialogProps) {
  const titleId = useId()
  const confirmTitleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const running = phase === 'running' || phase === 'confirm-cancel'

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
  }, [open, phase])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (phase === 'confirm-cancel') onDismissConfirm()
      else if (running) onRequestClose()
      else onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, phase, running, onRequestClose, onDismissConfirm, onDismiss])

  if (!open) return null

  const statusText =
    phase === 'aborted'
      ? `已终止：成功 ${ok}，失败 ${failed}`
      : phase === 'done'
        ? failed > 0
          ? `导出结束：成功 ${ok}，失败 ${failed}`
          : `导出完成：${ok} 个片段`
        : `正在导出（${Math.min(completed + 1, total)}/${total}）`

  return (
    <div className="modal-root" role="presentation">
      <div className="modal-backdrop" aria-hidden />
      <div
        className="modal-dialog export-progress-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <h2 id={titleId}>导出选区视频</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            aria-label={running ? '关闭并终止导出' : '关闭'}
            title={running ? '关闭' : '关闭'}
            onClick={() => {
              if (running) onRequestClose()
              else onDismiss()
            }}
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="export-progress-status">{statusText}</p>
          {running && currentName ? (
            <p className="export-progress-file" title={currentName}>
              {currentName}
            </p>
          ) : null}
          <div
            className="export-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="export-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="export-progress-meta">
            {completed}/{total}
            {outputDir ? ` · ${outputDir}` : ''}
          </p>
        </div>
      </div>

      {phase === 'confirm-cancel' ? (
        <div className="modal-root modal-root-nested" role="presentation">
          <div className="modal-backdrop" aria-hidden />
          <div
            className="modal-dialog modal-dialog-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
          >
            <header className="modal-header">
              <h2 id={confirmTitleId}>终止导出？</h2>
            </header>
            <div className="modal-body">
              <p>确定要终止当前导出吗？已完成的片段会保留。</p>
            </div>
            <footer className="modal-footer">
              <button type="button" className="modal-btn" onClick={onDismissConfirm}>
                继续导出
              </button>
              <button type="button" className="modal-btn modal-btn-danger" onClick={onConfirmCancel}>
                终止导出
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
