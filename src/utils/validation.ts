/**
 * 验证十六进制颜色
 * @example isValidHex('#ffffff') => true
 */
export function isValidHex(color: string): boolean {
  return typeof color === 'string' && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
}

/**
 * 验证数值范围
 */
export function validateRange(value: number, min: number, max: number): number {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return Number.isFinite(low) ? low : 0
  }
  return Math.max(low, Math.min(high, value))
}

/**
 * 普通数值规范化
 */
export function roundToInteger(value: number, allowNegative: boolean = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  const rounded = allowNegative ? Math.round(value) : Math.round(Math.max(0, value))
  return rounded === 0 ? 0 : rounded
}

/**
 * 透明度规范化，保留两位小数并约束在 0-1 之间
 */
export function roundOpacityValue(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  const clamped = validateRange(value, 0, 1)
  const rounded = Number(clamped.toFixed(2))
  return rounded === 0 ? 0 : rounded
}

/**
 * 将角度规范化到0-360度范围内
 */
export function normalizeAngle(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  const normalized = ((value % 360) + 360) % 360
  return normalized === 0 || normalized === 360 ? 0 : normalized
}

/**
 * M7弹幕规范验证
 */
export const M7_RULES = {
  size: { min: 10, max: 127, label: '字体大小' },
  opacity: { min: 0, max: 1, label: '透明度' },
  rotate: { min: 0, max: 360, label: '旋转角度' },
  duration: { min: 1, max: Infinity, label: '生存时间' },
  layer: { min: 0, max: Infinity, label: '层级' }
}

/**
 * 验证单个字段值
 */
export function validateField(field: string, value: any): { valid: boolean; message?: string } {
  // 大小写不敏感的字段检查
  const rule = Object.entries(M7_RULES).find(([key]) => key.toLowerCase() === String(field).toLowerCase())

  if (!rule) {
    return { valid: true }
  }

  const [, { min, max, label }] = rule

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: `${label}必须是数字` }
  }

  if (value < min || value > max) {
    return { valid: false, message: `${label}必须在 ${min} ~ ${max} 之间` }
  }

  return { valid: true }
}

/**
 * 解析并验证颜色，统一输出为 #RRGGBB 大写格式
 */
export function normalizeColor(color: string): string | null {
  if (typeof color !== 'string') {
    return null
  }
  const trimmed = color.trim()

  // 检查Hex格式（支持 #RGB 并自动展开为 #RRGGBB）
  if (isValidHex(trimmed)) {
    if (trimmed.length === 4) {
      const r = trimmed[1]
      const g = trimmed[2]
      const b = trimmed[3]
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }
    return trimmed.toUpperCase()
  }

  // 解析rgb格式
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    const hex = [parseInt(r, 10), parseInt(g, 10), parseInt(b, 10)]
      .map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex.toUpperCase()}`
  }

  return null
}
