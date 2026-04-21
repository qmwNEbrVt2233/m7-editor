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
