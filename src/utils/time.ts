/**
 * 格式化时间（毫秒 => MM:SS.mmm）
 * @example formatTime(1500) => "00:01.500"
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const milliseconds = ms % 1000

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

/**
 * 将时间字符串解析为毫秒
 * @example parseTimeString("01:30.500") => 90500
 */
export function parseTimeString(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)\.?(\d*)/)
  if (!match) return 0

  const minutes = parseInt(match[1], 10)
  const seconds = parseInt(match[2], 10)
  const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0

  return minutes * 60 * 1000 + seconds * 1000 + ms
}
