export function formatMasterTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000'
  const negative = seconds < 0
  const absolute = Math.abs(seconds)
  const totalMs = Math.round(absolute * 1000)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  const body =
    hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
      : `${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
  return negative ? `-${body}` : body
}
