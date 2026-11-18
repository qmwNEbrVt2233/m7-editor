import { evaluate, parse } from 'mathjs'
import type { DanmakuItem } from '@/core/danmaku'

/**
 * 输入解析工具
 * 支持五种模式：
 * 1. 直接赋值: "100" => { mode: 'set', value: 100 }
 * 2. 增量操作: "+10" => { mode: 'add', value: 10 }
 *            "-5"  => { mode: 'add', value: -5 }
 * 3. 倍率操作: "*2"  => { mode: 'mul', value: 2 }
 *            "/2"  => { mode: 'div', value: 2 }
 * 4. 随机范围: "r+50" => { mode: 'random', randomMinOffset: 0, randomMaxOffset: 50 }
 *            "r-30" => { mode: 'random', randomMinOffset: -30, randomMaxOffset: 0 }
 *            "r100" => { mode: 'random', randomMinOffset: -100, randomMaxOffset: 100 }
 * 5. 多值检测: null => { mode: 'multiple' }
 */

export interface ParseResult {
  mode: 'set' | 'add' | 'mul' | 'div' | 'random' | 'multiple'
  value?: number
  randomMinOffset?: number
  randomMaxOffset?: number
  error?: string
}

export type NumericFieldKind = 'integer' | 'opacity'
export type NumericFieldDefinition = {
  path: string
  kind: NumericFieldKind
}

export const NUMERIC_FIELD_DEFINITIONS: Record<string, NumericFieldDefinition> = {
  layer: { path: 'layer', kind: 'integer' },
  startTime: { path: 'startTime', kind: 'integer' },
  size: { path: 'content.size', kind: 'integer' },
  startX: { path: 'transform.start.x', kind: 'integer' },
  startY: { path: 'transform.start.y', kind: 'integer' },
  endX: { path: 'transform.end.x', kind: 'integer' },
  endY: { path: 'transform.end.y', kind: 'integer' },
  zRotate: { path: 'transform.zRotate', kind: 'integer' },
  yRotate: { path: 'transform.yRotate', kind: 'integer' },
  opacityFrom: { path: 'opacity.from', kind: 'opacity' },
  opacityTo: { path: 'opacity.to', kind: 'opacity' },
  duration: { path: 'animation.duration', kind: 'integer' },
  moveDuration: { path: 'animation.moveDuration', kind: 'integer' },
  delay: { path: 'animation.delay', kind: 'integer' }
}

function getValueByPath(target: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    return (current as Record<string, unknown>)[key]
  }, target)
}

export function createNumericVariableContext(danmaku: DanmakuItem): Record<string, number> {
  const variables: Record<string, number> = {}

  Object.entries(NUMERIC_FIELD_DEFINITIONS).forEach(([fieldName, definition]) => {
    const value = getValueByPath(danmaku as unknown as Record<string, unknown>, definition.path)
    if (typeof value === 'number' && Number.isFinite(value)) {
      variables[fieldName] = value
    }
  })

  return variables
}

export function parseMathExpression(expression: string) {
  return parse(expression)
}

export function evaluateMathExpressionValue(expression: string, variables: Record<string, unknown>): unknown {
  return evaluate(expression, variables)
}

export function evaluateMathExpression(expression: string, variables: Record<string, unknown>): number {
  const result = evaluateMathExpressionValue(expression, variables)
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('表达式结果不是有效数字')
  }

  return result
}

export function evaluateSeededRandom(seed: number, index = 0): number {
  if (typeof seed !== 'number' || !Number.isFinite(seed) || typeof index !== 'number' || !Number.isFinite(index)) {
    throw new Error('seededRandom 参数必须是有限数字')
  }
  const s = Math.trunc(seed * 1000003) | 0
  const idx = Math.trunc(index * 1000003) | 0
  let h = (Math.imul(s, 0x9e3779b1) ^ Math.imul(idx, 0x85ebca6b)) >>> 0
  h = (h + 0x6d2b79f5) >>> 0
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/**
 * 解析随机范围表达式
 */
function parseRandomRangeExpression(input: string): ParseResult | null {
  const compact = input.replace(/\s+/g, '')

  if (!/^r/i.test(compact)) {
    return null
  }

  const signedMatch = compact.match(/^r([+\-])(\d+(?:\.\d+)?)$/i)
  if (signedMatch) {
    const operator = signedMatch[1]
    const rawValue = parseFloat(signedMatch[2])

    if (!Number.isFinite(rawValue)) {
      return { mode: 'set', error: '无效的随机范围数值' }
    }

    return operator === '+'
      ? { mode: 'random', randomMinOffset: 0, randomMaxOffset: rawValue }
      : { mode: 'random', randomMinOffset: -rawValue, randomMaxOffset: 0 }
  }

  const symmetricMatch = compact.match(/^r(\d+(?:\.\d+)?)$/i)
  if (symmetricMatch) {
    const rawValue = parseFloat(symmetricMatch[1])

    if (!Number.isFinite(rawValue)) {
      return { mode: 'set', error: '无效的随机范围数值' }
    }

    return {
      mode: 'random',
      randomMinOffset: -rawValue,
      randomMaxOffset: rawValue
    }
  }

  return { mode: 'set', error: '随机范围格式不正确，支持 r+50、r-30、r100' }
}

/**
 * 验证是否为有效的单步数值/运算符输入
 * 示例："+10", "-5", "*2", "/2", "100", "+1.5", "*0.5", "/2.5"
 */
export function validateArithmeticExpression(input: string): { valid: boolean; error?: string } {
  if (typeof input !== 'string') {
    return { valid: false, error: '输入必须是字符串' }
  }
  const trimmed = input.trim()
  
  // 空字符串不合法
  if (!trimmed) {
    return { valid: false, error: '输入不能为空' }
  }

  // 检查是否只包含允许的字符：数字、操作符、小数点、空格
  if (!/^[\d+\-*/. ]*$/.test(trimmed)) {
    return { valid: false, error: '仅支持四则运算符和数字' }
  }

  // 仅允许一个可选前缀运算符跟随单个数值，避免 "10+20" 被 parseFloat 静默截断
  const operatorPattern = /^[+\-*/]?\d+(?:\.\d+)?$/
  if (!operatorPattern.test(trimmed.replace(/\s+/g, ''))) {
    return { valid: false, error: '格式不正确' }
  }

  return { valid: true }
}

/**
 * 解析颜色与Alpha混合格式
 * 格式：RRGGBB@ALPHA、#RRGGBB@ALPHA、RGB@ALPHA 或 #RGB@ALPHA
 * 示例：FFFFFF@0.5 表示白色半透明
 * 返回：{ color: '#FFFFFF', alpha: 0.5 } 或 null
 */
export interface ColorAlphaResult {
  color: string
  alpha: number
}

function expandHexSix(rawHex: string): string {
  const upper = rawHex.toUpperCase()
  if (upper.length === 3) {
    return `${upper[0]}${upper[0]}${upper[1]}${upper[1]}${upper[2]}${upper[2]}`
  }
  return upper
}

function parseHexRgbChannels(hexColor: string): [number, number, number] {
  if (typeof hexColor !== 'string') {
    return [0, 0, 0]
  }
  const match = hexColor.trim().match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  if (!match) {
    return [0, 0, 0]
  }
  const hex = expandHexSix(match[1])
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ]
}

export function parseColorWithAlpha(input: string): ColorAlphaResult | null {
  if (typeof input !== 'string') {
    return null
  }
  const trimmed = input.trim()
  
  // 匹配格式：可选的#，3或6位十六进制，@，0-1的浮点数
  const match = trimmed.match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})@([0-1](?:\.\d+)?)$/)
  
  if (!match) {
    return null
  }
  
  const hex = expandHexSix(match[1])
  const alpha = parseFloat(match[2])
  
  // 验证alpha值
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    return null
  }
  
  return {
    color: `#${hex}`,
    alpha: alpha
  }
}

/**
 * RGB颜色混合（Alpha合成）
 * 使用"源超过目标"的Alpha混合公式
 */
export function blendColor(baseHex: string, overlayHex: string, alpha: number): string {
  const safeAlpha = typeof alpha === 'number' && Number.isFinite(alpha)
    ? Math.max(0, Math.min(1, alpha))
    : 0
  const [baseR, baseG, baseB] = parseHexRgbChannels(baseHex)
  const [overlayR, overlayG, overlayB] = parseHexRgbChannels(overlayHex)
  
  // Alpha混合公式：result = overlay * alpha + base * (1 - alpha)
  const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  const r = clampByte(overlayR * safeAlpha + baseR * (1 - safeAlpha))
  const g = clampByte(overlayG * safeAlpha + baseG * (1 - safeAlpha))
  const b = clampByte(overlayB * safeAlpha + baseB * (1 - safeAlpha))
  
  // 转换回十六进制
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 解析输入字符串
 * 文本字段不支持 +- 操作
 */
export function parseInput(input: string | null, isTextField = false): ParseResult {
  // 多个值不同的情况
  if (input == null || input === '—' || input === '--') {
    return { mode: 'multiple' }
  }

  if (typeof input !== 'string') {
    return { mode: 'set', error: '无效的输入' }
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return { mode: 'multiple' }
  }

  // 文本字段只支持直接赋值
  if (isTextField) {
    return { mode: 'set', value: 0 } // value不用于文本字段
  }

  const randomParseResult = parseRandomRangeExpression(trimmed)
  if (randomParseResult) {
    return randomParseResult
  }

  // 验证四则运算表达式的合法性
  const validation = validateArithmeticExpression(trimmed)
  if (!validation.valid) {
    return { mode: 'set', error: validation.error }
  }

  const compact = trimmed.replace(/\s+/g, '')

  // 检查操作符
  if (compact.startsWith('+')) {
    const num = parseFloat(compact.slice(1))
    return !Number.isFinite(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'add', value: num }
  }

  if (compact.startsWith('-')) {
    const num = parseFloat(compact)
    return !Number.isFinite(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'add', value: num }
  }

  if (compact.startsWith('*')) {
    const num = parseFloat(compact.slice(1))
    return !Number.isFinite(num) || num <= 0 ? { mode: 'set', error: '倍率必须是正数' } : { mode: 'mul', value: num }
  }

  if (compact.startsWith('/')) {
    const num = parseFloat(compact.slice(1))
    return !Number.isFinite(num) || num <= 0 ? { mode: 'set', error: '除数必须是正数' } : { mode: 'div', value: num }
  }

  // 直接赋值
  const num = parseFloat(compact)
  return !Number.isFinite(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'set', value: num }
}

/**
 * 应用操作到值
 */
export function applyOperation(originalValue: number, parseResult: ParseResult): number {
  if (parseResult.mode === 'multiple') {
    return originalValue
  }

  const safeOriginal = Number.isFinite(originalValue) ? originalValue : 0

  switch (parseResult.mode) {
    case 'set': {
      if (parseResult.value === undefined || !Number.isFinite(parseResult.value)) {
        return originalValue
      }
      return parseResult.value
    }
    case 'add': {
      if (parseResult.value === undefined || !Number.isFinite(parseResult.value)) {
        return originalValue
      }
      const next = safeOriginal + parseResult.value
      return Number.isFinite(next) ? next : originalValue
    }
    case 'mul': {
      if (parseResult.value === undefined || !Number.isFinite(parseResult.value)) {
        return originalValue
      }
      const next = safeOriginal * parseResult.value
      return Number.isFinite(next) ? next : originalValue
    }
    case 'div': {
      if (parseResult.value === undefined || !Number.isFinite(parseResult.value) || parseResult.value === 0) {
        return originalValue
      }
      const next = safeOriginal / parseResult.value
      return Number.isFinite(next) ? next : originalValue
    }
    case 'random': {
      if (
        parseResult.randomMinOffset === undefined ||
        parseResult.randomMaxOffset === undefined ||
        !Number.isFinite(parseResult.randomMinOffset) ||
        !Number.isFinite(parseResult.randomMaxOffset)
      ) {
        return originalValue
      }

      const minValue = safeOriginal + parseResult.randomMinOffset
      const maxValue = safeOriginal + parseResult.randomMaxOffset
      const lowerBound = Math.min(minValue, maxValue)
      const upperBound = Math.max(minValue, maxValue)
      const next = lowerBound + Math.random() * (upperBound - lowerBound)

      return Number.isFinite(next) ? next : originalValue
    }
    default:
      return originalValue
  }
}

/**
 * 将值转换为输入显示格式
 * 当多个值不同时显示 '--'
 */
export function formatInputDisplay(values: number[]): string {
  if (!Array.isArray(values) || values.length === 0) return ''

  // 判断是否所有值都相同
  const firstValue = values[0]
  if (typeof firstValue !== 'number' || !Number.isFinite(firstValue)) return '--'
  const allSame = values.every(v => v === firstValue)

  return allSame ? String(firstValue) : '--'
}
