/**
 * 输入解析工具
 * 支持四种模式：
 * 1. 直接赋值: "100" => { mode: 'set', value: 100 }
 * 2. 增量操作: "+10" => { mode: 'add', value: 10 }
 *            "-5"  => { mode: 'add', value: -5 }
 * 3. 倍率操作: "*2"  => { mode: 'mul', value: 2 }
 *            "/2"  => { mode: 'div', value: 2 }
 * 4. 多值检测: null => { mode: 'multiple' }
 */

export interface ParseResult {
  mode: 'set' | 'add' | 'mul' | 'div' | 'multiple'
  value?: number
  error?: string
}

/**
 * 验证是否为有效的四则运算表达式
 * 仅支持：数字、+、-、*、/ 和空格
 * 示例："+10", "-5", "*2", "/2", "100"
 */
export function validateArithmeticExpression(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim()
  
  // 空字符串不合法
  if (!trimmed) {
    return { valid: false, error: '输入不能为空' }
  }

  // 检查是否只包含允许的字符：数字、操作符、小数点、负号、空格
  if (!/^[\d+\-*/.() ]*$/.test(trimmed)) {
    return { valid: false, error: '仅支持四则运算符和数字' }
  }

  // 检查操作符的合法性
  const operatorPattern = /^[+\-*/]?\d+(?:[+\-*/]\d+)*$/
  if (!operatorPattern.test(trimmed.replace(/\s+/g, ''))) {
    return { valid: false, error: '四则运算格式不正确' }
  }

  return { valid: true }
}

/**
 * 解析颜色与Alpha混合格式
 * 格式：RRGGBB@ALPHA 或 #RRGGBB@ALPHA
 * 示例：FFFFFF@0.5 表示白色半透明
 * 返回：{ color: '#FFFFFF', alpha: 0.5 } 或 null
 */
export interface ColorAlphaResult {
  color: string
  alpha: number
}

export function parseColorWithAlpha(input: string): ColorAlphaResult | null {
  const trimmed = input.trim()
  
  // 匹配格式：可选的#，6位十六进制，@，0-1的浮点数
  const match = trimmed.match(/^#?([A-Fa-f0-9]{6})@([0-1](?:\.\d+)?)$/)
  
  if (!match) {
    return null
  }
  
  const hex = match[1].toUpperCase()
  const alpha = parseFloat(match[2])
  
  // 验证alpha值
  if (isNaN(alpha) || alpha < 0 || alpha > 1) {
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
  // 解析基础颜色
  const baseR = parseInt(baseHex.slice(1, 3), 16)
  const baseG = parseInt(baseHex.slice(3, 5), 16)
  const baseB = parseInt(baseHex.slice(5, 7), 16)
  
  // 解析叠加颜色
  const overlayR = parseInt(overlayHex.slice(1, 3), 16)
  const overlayG = parseInt(overlayHex.slice(3, 5), 16)
  const overlayB = parseInt(overlayHex.slice(5, 7), 16)
  
  // Alpha混合公式：result = overlay * alpha + base * (1 - alpha)
  const r = Math.round(overlayR * alpha + baseR * (1 - alpha))
  const g = Math.round(overlayG * alpha + baseG * (1 - alpha))
  const b = Math.round(overlayB * alpha + baseB * (1 - alpha))
  
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
  if (input === null || input === '—' || input === '--') {
    return { mode: 'multiple' }
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return { mode: 'multiple' }
  }

  // 文本字段只支持直接赋值
  if (isTextField) {
    return { mode: 'set', value: 0 } // value不用于文本字段
  }

  // 验证四则运算表达式的合法性
  const validation = validateArithmeticExpression(trimmed)
  if (!validation.valid) {
    return { mode: 'set', error: validation.error }
  }
  

  // 检查操作符
  if (trimmed.startsWith('+')) {
    const num = parseFloat(trimmed.slice(1))
    return isNaN(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'add', value: num }
  }

  if (trimmed.startsWith('-')) {
    const num = parseFloat(trimmed)
    return isNaN(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'add', value: num }
  }

  if (trimmed.startsWith('*')) {
    const num = parseFloat(trimmed.slice(1))
    return isNaN(num) || num <= 0 ? { mode: 'set', error: '倍率必须是正数' } : { mode: 'mul', value: num }
  }

  if (trimmed.startsWith('/')) {
    const num = parseFloat(trimmed.slice(1))
    return isNaN(num) || num <= 0 ? { mode: 'set', error: '除数必须是正数' } : { mode: 'div', value: num }
  }

  // 直接赋值
  const num = parseFloat(trimmed)
  return isNaN(num) ? { mode: 'set', error: '无效的数值' } : { mode: 'set', value: num }
}

/**
 * 应用操作到值
 */
export function applyOperation(originalValue: number, parseResult: ParseResult): number {
  if (parseResult.mode === 'multiple' || parseResult.value === undefined) {
    return originalValue
  }

  switch (parseResult.mode) {
    case 'set':
      return parseResult.value
    case 'add':
      return originalValue + parseResult.value
    case 'mul':
      return originalValue * parseResult.value
    case 'div':
      return originalValue / parseResult.value
    default:
      return originalValue
  }
}

/**
 * 将值转换为输入显示格式
 * 当多个值不同时显示 '--'
 */
export function formatInputDisplay(values: number[]): string {
  if (values.length === 0) return ''

  // 判断是否所有值都相同
  const firstValue = values[0]
  const allSame = values.every(v => v === firstValue)

  return allSame ? String(firstValue) : '--'
}
