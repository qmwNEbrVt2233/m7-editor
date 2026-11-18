/**
 * 格式化时间（毫秒 => MM:SS.mmm）
 * @example formatTime(1500) => "00:01.500"
 */
export function formatTime(ms: number): string {
  const safeMs = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const milliseconds = safeMs % 1000

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

/**
 * 将时间字符串解析为毫秒
 * @example parseTimeString("01:30.500") => 90500
 */
export function parseTimeString(timeStr: string): number {
  if (typeof timeStr !== 'string') return 0
  const match = timeStr.match(/(\d+):(\d+)\.?(\d*)/)
  if (!match) return 0

  const minutes = parseInt(match[1], 10)
  const seconds = parseInt(match[2], 10)
  const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
  const total = minutes * 60 * 1000 + seconds * 1000 + ms

  return Number.isFinite(total) ? Math.max(0, total) : 0
}

const pad = (value: number) => String(value).padStart(2, '0')

export function formatDateTime(value: number | Date) {
  const rawDate = value instanceof Date ? value : new Date(value)
  const date = Number.isNaN(rawDate.getTime()) ? new Date(0) : rawDate
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds())
  ].join('')
}

export function formatDuration(ms: number) {
  const safeMs = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, ms) : 0
  const totalSeconds = Math.max(0, Math.round(safeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}时${minutes}分${seconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }

  return `${seconds}秒`
}
