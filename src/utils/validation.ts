/**
 * 验证十六进制颜色
 * @example isValidHex('#ffffff') => true
 */
export function isValidHex(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
}

/**
 * 验证数值范围
 */
export function validateRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * M7弹幕规范验证
 */
export const M7_RULES = {
  size: { min: 10, max: 127, label: '字体大小' },
  opacity: { min: 0, max: 1, label: '透明度' },
  rotate: { min: 0, max: 360, label: '旋转角度' },
  duration: { min: 0, max: Infinity, label: '生存时间' },
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

  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, message: `${label}必须是数字` }
  }

  if (value < min || value > max) {
    return { valid: false, message: `${label}必须在 ${min} ~ ${max} 之间` }
  }

  return { valid: true }
}

/**
 * 解析并验证颜色
 */
export function normalizeColor(color: string): string | null {
  color = color.trim()

  // 检查Hex格式
  if (isValidHex(color)) {
    return color.toUpperCase()
  }

  // 可选：解析rgb格式
  const rgbMatch = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    const hex = [parseInt(r), parseInt(g), parseInt(b)]
      .map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex.toUpperCase()}`
  }

  return null
}
