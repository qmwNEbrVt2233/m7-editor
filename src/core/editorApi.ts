import type { DanmakuItem } from './danmaku'
import type { ToolbarMeasure } from './danmakuMeasurement'
import {
  applyOperation,
  blendColor,
  createNumericVariableContext,
  evaluateSeededRandom,
  NUMERIC_FIELD_DEFINITIONS,
  parseColorWithAlpha,
  parseInput,
  parseMathExpression
} from '@/utils/parser'
import {
  normalizeAngle,
  normalizeColor,
  roundOpacityValue,
  roundToInteger,
  validateField,
  validateRange,
  M7_RULES
} from '@/utils/validation'

export type FieldInput = string | number | boolean
export type UpsetMethod = { op: 'upset'; seed?: number }
export type EditorApiMethod = FieldInput | UpsetMethod | Record<string, unknown>

export type EditorApiResult = {
  ok: true
  changedIds: string[]
  createdIds: string[]
  selectedIds: string[]
  warnings: string[]
} | {
  ok: false
  code: string
  message: string
  changedIds: string[]
  createdIds: string[]
  selectedIds: string[]
  warnings: string[]
}

export type EditorApiContext = {
  danmakus: DanmakuItem[]
  selectedIds: string[]
  currentTime: number
  screenWidth: number
  screenHeight: number
  maxLayers: number
  allowNegativeValues: boolean
  generateId: () => string
  measureDanmakus: (danmakus: DanmakuItem[]) => Promise<ToolbarMeasure>
}

export type EditorApiOutcome = {
  danmakus: DanmakuItem[]
  selectedIds: string[]
  changedIds: string[]
  createdIds: string[]
  warnings: string[]
  historyLabel?: string
  changedField?: string
  changedFields?: string[]
  selectionChanged: boolean
}

const FIELD_PATHS = new Set([
  'layer', 'startTime', 'content.text', 'content.font', 'content.size', 'content.color', 'content.stroke',
  'transform.start.x', 'transform.start.y', 'transform.end.x', 'transform.end.y',
  'transform.zRotate', 'transform.yRotate', 'opacity.from', 'opacity.to',
  'animation.duration', 'animation.moveDuration', 'animation.delay', 'animation.easing'
])
const TOOLBAR_FIELDS = new Set([
  '@toolbar.command', '@toolbar.stroke', '@toolbar.center', '@toolbar.copy', '@toolbar.swap',
  '@toolbar.mirror', '@toolbar.calculateRotation', '@toolbar.length', '@toolbar.lockAngle',
  '@toolbar.pickAt', '@toolbar.split'
])

function cloneDanmaku(item: DanmakuItem): DanmakuItem {
  return {
    ...item,
    content: { ...item.content },
    transform: {
      ...item.transform,
      start: { ...item.transform.start },
      end: { ...item.transform.end }
    },
    opacity: { ...item.opacity },
    animation: { ...item.animation }
  }
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function expandColorHex(input: string): string | null {
  const normalized = normalizeColor(input)
  if (!normalized) return null
  if (normalized.length === 4) {
    const [, r, g, b] = normalized
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return normalized
}

const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

function splitGraphemes(text: string): string[] {
  if (!text) return []
  if (SEGMENTER) {
    return Array.from(SEGMENTER.segment(text), (entry) => entry.segment)
  }
  return Array.from(text)
}

function getPath(target: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], target)
}

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const keys = path.split('.')
  let current = target
  for (const key of keys.slice(0, -1)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`非法字段路径：${path}`)
    }
    if (!current[key] || typeof current[key] !== 'object') current[key] = {}
    current = current[key]
  }
  const leaf = keys[keys.length - 1]
  if (leaf === '__proto__' || leaf === 'constructor' || leaf === 'prototype') {
    throw new Error(`非法字段路径：${path}`)
  }
  current[leaf] = value
}

function calculateTextLength(text: string): number {
  let length = 0
  for (const char of text) length += char === '\n' ? 2 : 1
  return length
}

type CompiledNumericEvaluator = (variables: Record<string, number>) => number

function compileNumericExpression(expression: string, contextLabel: string): CompiledNumericEvaluator {
  const trimmed = expression.trim()
  if (!trimmed) {
    throw new Error(`${contextLabel}表达式为空`)
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const constant = Number(trimmed)
    if (!Number.isFinite(constant)) {
      throw new Error(`${contextLabel}数值超出有效范围`)
    }
    return () => constant
  }
  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown }
  try {
    compiled = parseMathExpression(trimmed).compile()
  } catch (error) {
    throw new Error(`${contextLabel}表达式解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return (variables: Record<string, number>) => {
    let result: unknown
    try {
      result = compiled.evaluate(variables)
    } catch (error) {
      throw new Error(`${contextLabel}表达式执行失败：${error instanceof Error ? error.message : String(error)}`)
    }
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`${contextLabel}表达式结果不是有效数字`)
    }
    return result
  }
}

function normalizeFieldValue(path: string, value: number, allowNegative: boolean, warnings: string[]): number {
  if (!Number.isFinite(value)) {
    throw new Error(`字段 ${path} 计算结果无效（NaN 或无穷大）`)
  }
  if (path === 'opacity.from' || path === 'opacity.to') {
    return roundOpacityValue(validateRange(value, 0, 1))
  }
  if (path === 'transform.zRotate' || path === 'transform.yRotate') {
    return roundToInteger(normalizeAngle(value), allowNegative)
  }

  let normalized = roundToInteger(value, allowNegative)
  if (path === 'animation.duration' && normalized < 1) {
    warnings.push('生存时间必须大于等于 1 毫秒，已自动调整为 1')
    return 1
  }

  const fieldName = path.split('.').pop() || ''
  const ruleName = path === 'opacity.from' || path === 'opacity.to' ? 'opacity' : fieldName
  const validation = validateField(ruleName, normalized)
  if (!validation.valid) {
    const rule = M7_RULES[ruleName as keyof typeof M7_RULES]
    if (rule) {
      warnings.push(validation.message || `${rule.label} 已限制在有效范围内`)
      normalized = roundToInteger(validateRange(normalized, rule.min, rule.max), allowNegative)
    }
  }
  return normalized
}

function parseUpsetMethod(input: unknown): UpsetMethod | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (record.op !== 'upset' || keys.some((key) => key !== 'op' && key !== 'seed')) {
    throw new Error('upset 操作只支持 { op: "upset", seed? } 格式，不能与其他赋值规则或表达式混用')
  }
  if (record.seed !== undefined && (typeof record.seed !== 'number' || !Number.isFinite(record.seed))) {
    throw new Error('upset 的 seed 必须是有限数字')
  }
  return record.seed === undefined ? { op: 'upset' } : { op: 'upset', seed: record.seed }
}

function applyUpsetToField(targetItems: DanmakuItem[], sourceItems: DanmakuItem[], path: string, seed?: number) {
  const values = sourceItems.map((item) => cloneValue(getPath(item as unknown as Record<string, any>, path)))
  for (let i = values.length - 1; i > 0; i--) {
    const rand = seed !== undefined ? evaluateSeededRandom(seed, i) : Math.random()
    const j = Math.min(i, Math.max(0, Math.floor(rand * (i + 1))))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  targetItems.forEach((item, index) => setPath(item as unknown as Record<string, any>, path, values[index]))
}

type PreparedFieldEvaluator = (item: DanmakuItem, sourceItem?: DanmakuItem) => unknown

function prepareFieldEvaluator(
  path: string,
  input: FieldInput,
  allowNegative: boolean,
  warnings: string[]
): PreparedFieldEvaluator {
  if (path === 'content.color') {
    if (typeof input === 'boolean') throw new Error('颜色字段需要字符串')
    const value = String(input)
    const alpha = parseColorWithAlpha(value)
    if (alpha) {
      return (_item, sourceItem = _item) => {
        const baseColor = expandColorHex(sourceItem.content.color || '#FFFFFF') || '#FFFFFF'
        return blendColor(baseColor, alpha.color, alpha.alpha)
      }
    }
    const color = expandColorHex(value)
    if (!color) throw new Error('颜色格式无效（支持 #RGB、#RRGGBB 或 RRGGBB@Alpha 格式）')
    return () => color
  }

  if (path === 'content.text') {
    if (typeof input === 'boolean') throw new Error('文本字段不能接收布尔值')
    const text = String(input)
    if (calculateTextLength(text) > 255) warnings.push('文本数据超过255字符限制（换行符占2个字符）')
    return () => text
  }

  if (path === 'content.font') {
    if (typeof input !== 'string') throw new Error('字体字段需要字符串')
    const font = input.trim()
    if (!font) throw new Error('字体名称不能为空')
    return () => font
  }

  if (path === 'animation.easing') {
    if (input !== 'speedup' && input !== 'speeddown') {
      throw new Error('animation.easing 仅支持 speedup 或 speeddown')
    }
    return () => input
  }

  if (path === 'content.stroke') {
    if (typeof input !== 'boolean') throw new Error('描边字段需要布尔值')
    return () => input
  }

  const definition = Object.values(NUMERIC_FIELD_DEFINITIONS).find((entry) => entry.path === path)
  const isOpacity = path === 'opacity.from' || path === 'opacity.to'
  const isRotation = path === 'transform.zRotate' || path === 'transform.yRotate'
  if (!definition && !isOpacity && !isRotation) throw new Error(`字段 ${path} 不支持数值操作`)

  if (typeof input === 'boolean') throw new Error(`字段 ${path} 不能接收布尔值`)
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`字段 ${path} 的输入必须是有限数字`)
    if (input >= 0) {
      const normalized = normalizeFieldValue(path, input, allowNegative, warnings)
      return () => normalized
    }
  }

  const inputText = typeof input === 'number'
    ? (Math.abs(input) < 1e-6 ? input.toFixed(10) : String(input))
    : String(input).trim()

  if (!inputText) {
    throw new Error(`字段 ${path} 的输入不能为空`)
  }

  if (inputText.startsWith('$')) {
    const evaluator = compileNumericExpression(inputText.slice(1), `字段 ${path} `)
    return (_item, sourceItem = _item) => {
      const result = evaluator(createNumericVariableContext(sourceItem))
      return normalizeFieldValue(path, result, allowNegative, warnings)
    }
  }

  const parsed = parseInput(inputText, false)
  if (parsed.error) throw new Error(`字段 ${path} 验证失败: ${parsed.error}`)
  if (parsed.mode === 'multiple') {
    throw new Error(`字段 ${path} 的输入无效：${inputText}`)
  }
  if (parsed.value !== undefined && !Number.isFinite(parsed.value)) {
    throw new Error(`字段 ${path} 的输入数值超出有限范围`)
  }

  if (parsed.mode === 'set' && parsed.value !== undefined) {
    const normalized = normalizeFieldValue(path, parsed.value, allowNegative, warnings)
    return () => normalized
  }

  return (item, sourceItem = item) => {
    const current = getPath(sourceItem as unknown as Record<string, any>, path)
    if (typeof current !== 'number' || !Number.isFinite(current)) {
      throw new Error(`弹幕 ${item.id} 的字段 ${path} 不是有效数值`)
    }
    const next = applyOperation(current, parsed)
    return normalizeFieldValue(path, next, allowNegative, warnings)
  }
}

function splitOutsideQuotes(input: string, delimiter: ';' | ',' | '~'): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote) {
      current += char
      escaping = true
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      current += char
      continue
    }
    if ((char === delimiter || (delimiter === ';' && char === '；') || (delimiter === ',' && char === '，')) && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (quote) throw new Error('筛选命令中存在未闭合的引号')
  parts.push(current.trim())
  return parts.filter(Boolean)
}

function splitCriteriaList(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let inRegex = false
  let escaping = false
  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && (quote || inRegex)) {
      current += char
      escaping = true
      continue
    }
    if (inRegex) {
      current += char
      if (char === '>') inRegex = false
      continue
    }
    if (!quote && char === '<' && !current.trim()) {
      inRegex = true
      current += char
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      current += char
      continue
    }
    if ((char === ',' || char === '，') && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (quote) throw new Error('筛选命令中存在未闭合的引号')
  if (inRegex) throw new Error('筛选命令中存在未闭合的正则表达式 <>')
  parts.push(current.trim())
  return parts.filter(Boolean)
}

function unescapeCriterionLiteral(raw: string): string {
  return raw.replace(/\\([nrt'"\\])/g, (_match, ch: string) => {
    if (ch === 'n') return '\n'
    if (ch === 'r') return '\r'
    if (ch === 't') return '\t'
    return ch
  })
}

type SelectionTest = (value: unknown, item: DanmakuItem) => boolean

function splitRangeOutsideQuotes(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote) {
      current += char
      escaping = true
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      current += char
      continue
    }
    if (char === '~' && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (quote || escaping) throw new Error('筛选命令中存在未闭合的引号')
  parts.push(current.trim())
  return parts
}

function parseCanonicalNumericId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function buildNumericRangeOrExactTest(
  criterion: string,
  fieldLabel: string,
  extractNumber: (value: unknown) => number | null
): SelectionTest {
  const parts = splitRangeOutsideQuotes(criterion)
  if (parts.length === 1) {
    const evalTarget = compileNumericExpression(parts[0], `筛选字段 ${fieldLabel} 目标值 `)
    return (value: unknown, item: DanmakuItem) => {
      const num = extractNumber(value)
      if (num === null) return false
      return num === evalTarget(createNumericVariableContext(item))
    }
  }
  if (parts.length === 2) {
    const [left, right] = parts
    if (!left && !right) {
      throw new Error(`筛选字段 ${fieldLabel} 范围起终点不能同时为空`)
    }
    if (left && right) {
      const evalFrom = compileNumericExpression(left, `筛选字段 ${fieldLabel} 范围起点 `)
      const evalTo = compileNumericExpression(right, `筛选字段 ${fieldLabel} 范围终点 `)
      return (value: unknown, item: DanmakuItem) => {
        const num = extractNumber(value)
        if (num === null) return false
        const variables = createNumericVariableContext(item)
        const from = evalFrom(variables)
        const to = evalTo(variables)
        return num >= Math.min(from, to) && num <= Math.max(from, to)
      }
    }
    if (left) {
      const evalFrom = compileNumericExpression(left, `筛选字段 ${fieldLabel} 范围起点 `)
      return (value: unknown, item: DanmakuItem) => {
        const num = extractNumber(value)
        if (num === null) return false
        return num >= evalFrom(createNumericVariableContext(item))
      }
    }
    const evalTo = compileNumericExpression(right, `筛选字段 ${fieldLabel} 范围终点 `)
    return (value: unknown, item: DanmakuItem) => {
      const num = extractNumber(value)
      if (num === null) return false
      return num <= evalTo(createNumericVariableContext(item))
    }
  }
  throw new Error(`筛选字段 ${fieldLabel} 范围表达式格式无效`)
}

export function parseSelectionCommand(command: string): (item: DanmakuItem, selecting: Set<string>) => boolean {
  const body = command.trim().replace(/^\/s\b/i, '').trim()
  if (!body) throw new Error('请输入至少一组筛选规则')
  const rawGroups = splitOutsideQuotes(body, ';')
  if (rawGroups.length === 0) throw new Error('请输入至少一组筛选规则')
  const groups = rawGroups.map((group) => {
    const rules = splitOutsideQuotes(group, ',')
    if (rules.length === 0) throw new Error('筛选规则格式无效：存在空条件组')
    return rules
  })
  const aliases: Record<string, string> = {
    id: 'id', layer: 'layer', startTime: 'startTime', text: 'content.text', 'content.text': 'content.text',
    font: 'content.font', 'content.font': 'content.font', size: 'content.size', 'content.size': 'content.size',
    color: 'content.color', 'content.color': 'content.color', stroke: 'content.stroke', 'content.stroke': 'content.stroke',
    startX: 'transform.start.x', 'transform.start.x': 'transform.start.x', startY: 'transform.start.y', 'transform.start.y': 'transform.start.y',
    endX: 'transform.end.x', 'transform.end.x': 'transform.end.x', endY: 'transform.end.y', 'transform.end.y': 'transform.end.y',
    zRotate: 'transform.zRotate', 'transform.zRotate': 'transform.zRotate', yRotate: 'transform.yRotate', 'transform.yRotate': 'transform.yRotate',
    opacityFrom: 'opacity.from', 'opacity.from': 'opacity.from', opacityTo: 'opacity.to', 'opacity.to': 'opacity.to',
    duration: 'animation.duration', 'animation.duration': 'animation.duration', moveDuration: 'animation.moveDuration',
    'animation.moveDuration': 'animation.moveDuration', delay: 'animation.delay', 'animation.delay': 'animation.delay',
    easing: 'animation.easing', 'animation.easing': 'animation.easing'
  }
  const numericPathPattern = /^(?:layer|startTime|content\.size|transform\.(?:start|end)\.[xy]|transform\.[zy]Rotate|opacity\.(?:from|to)|animation\.(?:duration|moveDuration|delay))$/

  const criteria = groups.map((group) => group.map((rule) => {
    if (rule === 'selecting') return { kind: 'selecting' as const }
    if (rule === 'all') return { kind: 'all' as const }
    if (rule === 'none') return { kind: 'none' as const }
    const match = rule.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*"([\s\S]*)"$/)
    if (!match) throw new Error('筛选规则格式无效')
    const path = aliases[match[1]]
    if (!path) throw new Error(`筛选字段 ${match[1]} 不存在`)
    const rawCriteria = splitCriteriaList(match[2])
    if (rawCriteria.length === 0) throw new Error(`筛选字段 ${match[1]} 的条件不能为空`)
    const isNumericField = numericPathPattern.test(path)
    const tests: SelectionTest[] = rawCriteria.map((criterion) => {
      if (criterion.length >= 2 && criterion.startsWith("'") && criterion.endsWith("'")) {
        const expected = unescapeCriterionLiteral(criterion.slice(1, -1))
        return (value: unknown) => String(value ?? '') === expected
      }
      if (criterion.length >= 2 && criterion.startsWith('<') && criterion.endsWith('>')) {
        let regex: RegExp
        try { regex = new RegExp(criterion.slice(1, -1)) } catch { throw new Error(`筛选字段 ${match[1]} 的正则表达式无效`) }
        return (value: unknown) => {
          regex.lastIndex = 0
          return value !== null && value !== undefined && regex.test(String(value))
        }
      }
      if (isNumericField) {
        return buildNumericRangeOrExactTest(
          criterion,
          match[1],
          (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
        )
      }
      if (path === 'id') {
        return buildNumericRangeOrExactTest(criterion, match[1], parseCanonicalNumericId)
      }
      if (path === 'content.stroke' && /^(?:true|false)$/i.test(criterion)) {
        const expected = criterion.toLowerCase() === 'true'
        return (value: unknown) => value === expected
      }
      if (path === 'animation.easing' && (criterion === 'speedup' || criterion === 'speeddown')) {
        return (value: unknown) => value === criterion
      }
      if (path === 'content.stroke') {
        throw new Error(`筛选字段 ${match[1]} 的条件格式无效，请使用 true/false、'精确值' 或 <正则表达式>`)
      }
      if (path === 'animation.easing') {
        throw new Error(`筛选字段 ${match[1]} 的条件格式无效，请使用 speedup/speeddown、'精确值' 或 <正则表达式>`)
      }
      throw new Error(`筛选字段 ${match[1]} 的条件格式无效，请使用 '精确值' 或 <正则表达式>`)
    })
    return { kind: 'field' as const, path, tests }
  }))
  return (item, selecting) => criteria.some((group) => group.every((rule) => {
    if (rule.kind === 'selecting') return selecting.has(item.id)
    if (rule.kind === 'all') return true
    if (rule.kind === 'none') return false
    const value = getPath(item as unknown as Record<string, any>, rule.path)
    return rule.tests.some((test) => test(value, item))
  }))
}

function getSelected(danmakus: DanmakuItem[], ids: string[]): DanmakuItem[] {
  const idSet = new Set(ids)
  return danmakus.filter((item) => idSet.has(item.id))
}

function createIdAllocator(context: EditorApiContext, danmakus: DanmakuItem[]) {
  let next: number | null = null
  let used: Set<string> | null = null
  const MAX_ALLOCATABLE_ID = Number.MAX_SAFE_INTEGER - 1_000_000

  return () => {
    if (next === null || used === null) {
      const generated = Number(context.generateId())
      let maxExisting = 0
      const idSet = new Set<string>()
      for (const item of danmakus) {
        idSet.add(item.id)
        const id = Number(item.id)
        if (Number.isSafeInteger(id) && id >= 0 && id <= MAX_ALLOCATABLE_ID && id > maxExisting) {
          maxExisting = id
        }
      }
      used = idSet
      next = Number.isSafeInteger(generated) && generated >= 0 && generated <= MAX_ALLOCATABLE_ID
        ? Math.max(generated, maxExisting + 1)
        : maxExisting + 1
    }
    while (used.has(String(next))) next++
    const id = String(next++)
    used.add(id)
    return id
  }
}

export function rotatedBox(width: number, height: number, angle: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(angle)) {
    throw new Error('旋转包围盒计算参数必须是有限数字')
  }
  const rad = angle * Math.PI / 180
  const corners = [
    { x: 0, y: 0 }, { x: width * Math.cos(rad), y: width * Math.sin(rad) },
    { x: -height * Math.sin(rad), y: height * Math.cos(rad) },
    { x: width * Math.cos(rad) - height * Math.sin(rad), y: width * Math.sin(rad) + height * Math.cos(rad) }
  ]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

type LayerInterval = { start: number; end: number }
type LayerOccupancy = Map<number, LayerInterval[]>

function itemTimeInterval(item: DanmakuItem): LayerInterval {
  const start = Number.isFinite(item.startTime) ? item.startTime : 0
  const duration = Number.isFinite(item.animation.duration) ? Math.max(0, item.animation.duration) : 0
  return { start, end: start + duration }
}

function addLayerOccupancy(occupancy: LayerOccupancy, layer: number, interval: LayerInterval) {
  let intervals = occupancy.get(layer)
  if (!intervals) {
    intervals = []
    occupancy.set(layer, intervals)
  }
  intervals.push(interval)
}

function buildLayerOccupancy(items: DanmakuItem[]): LayerOccupancy {
  const occupancy: LayerOccupancy = new Map()
  for (const item of items) {
    addLayerOccupancy(occupancy, item.layer, itemTimeInterval(item))
  }
  return occupancy
}

function hasLayerConflict(candidateStart: number, candidateEnd: number, layer: number, occupancy: LayerOccupancy): boolean {
  const intervals = occupancy.get(layer)
  if (!intervals) return false
  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i]
    if (candidateStart < interval.end && interval.start < candidateEnd) {
      return true
    }
  }
  return false
}

function assignLayers(candidates: DanmakuItem[], occupancy: LayerOccupancy, maxLayers: number) {
  const safeMaxLayers = Number.isFinite(maxLayers) ? Math.max(1, Math.round(maxLayers)) : 1
  const maxLayer = safeMaxLayers - 1
  for (const candidate of candidates) {
    const { start, end } = itemTimeInterval(candidate)
    let layer = Number.isFinite(candidate.layer) ? Math.max(0, Math.round(candidate.layer)) : 0
    while (layer < safeMaxLayers && hasLayerConflict(start, end, layer, occupancy)) layer++
    candidate.layer = Math.min(layer, maxLayer)
    addLayerOccupancy(occupancy, candidate.layer, { start, end })
  }
}

function assignLayersSequentially(candidates: DanmakuItem[], occupancy: LayerOccupancy, maxLayers: number) {
  const ordered = [...candidates].sort((left, right) => left.layer - right.layer)
  assignLayers(ordered, occupancy, maxLayers)
}

async function applyToolbarOperation(
  context: EditorApiContext,
  danmakus: DanmakuItem[],
  field: string,
  method: EditorApiMethod,
  selectedIds: string[],
  warnings: string[]
): Promise<{ selectedIds: string[]; historyLabel: string; changedField?: string }> {
  const params = method && typeof method === 'object' && !Array.isArray(method)
    ? method as Record<string, any>
    : { value: method }
  const selected = getSelected(danmakus, selectedIds)
  if (field !== '@toolbar.command' && field !== '@selection.filter' && selected.length === 0) throw new Error('没有选中的弹幕')
  const makeId = createIdAllocator(context, danmakus)
  if (params.scope !== undefined && params.scope !== 'S' && params.scope !== 'E' && params.scope !== 'B') {
    throw new Error('坐标作用范围无效，应为 S、E 或 B')
  }
  const scope = params.scope === 'S' || params.scope === 'E' ? params.scope : 'B'
  const targets = (item: DanmakuItem) => scope === 'S' ? [item.transform.start] : scope === 'E' ? [item.transform.end] : [item.transform.start, item.transform.end]
  const clamp = (value: number) => {
    const rounded = Math.round(value)
    const actual = context.allowNegativeValues ? rounded : Math.max(0, rounded)
    if (actual !== rounded) warnings.push('部分坐标小于 0，已自动修正为 0')
    return actual
  }

  if (field === '@toolbar.command' && typeof params.command === 'string' && /^\/s\b/i.test(params.command.trim())) {
    const matches = parseSelectionCommand(params.command)
    const selecting = new Set(selectedIds)
    const next = danmakus.filter((item) => matches(item, selecting)).map((item) => item.id)
    return { selectedIds: next, historyLabel: '工具栏：筛选选择' }
  }

  if (field === '@toolbar.command') {
    const command = String(params.command ?? (typeof method === 'string' ? method : '')).trim()
    if (!command) throw new Error('命令为空')
    if (selected.length === 0) throw new Error('没有选中的弹幕，命令未执行')
    const rules = command.replace(/；/g, ';').split(';').map((rule) => rule.trim()).filter(Boolean).map((rule) => {
      const match = rule.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
      if (!match || !NUMERIC_FIELD_DEFINITIONS[match[1]]) throw new Error(`命令格式无效或字段不可写入：${rule}`)
      const target = match[1]
      const expression = match[2].trim()
      const evaluator = expression === 'upset'
        ? null
        : compileNumericExpression(expression, `命令字段 ${target} `)
      return { target, expression, evaluator }
    })
    if (!rules.length) throw new Error('请输入至少一条赋值规则')
    const bases = selected.map(cloneDanmaku)
    const updates = bases.map(cloneDanmaku)
    for (const rule of rules) {
      const definition = NUMERIC_FIELD_DEFINITIONS[rule.target]
      if (!rule.evaluator) {
        applyUpsetToField(updates, updates, definition.path)
      } else {
        const evaluate = rule.evaluator
        updates.forEach((item, index) => {
          const value = evaluate(createNumericVariableContext(bases[index]))
          const normalized = normalizeFieldValue(definition.path, value, context.allowNegativeValues, warnings)
          setPath(item as unknown as Record<string, any>, definition.path, normalized)
        })
      }
    }
    const byId = new Map(updates.map((item) => [item.id, item]))
    danmakus.forEach((item, index) => { const updated = byId.get(item.id); if (updated) danmakus[index] = updated })
    return { selectedIds, historyLabel: `命令执行：${rules.length} 条规则` }
  }

  if (field === '@toolbar.stroke') {
    if (typeof params.width === 'boolean' || params.width === null || (typeof params.width === 'string' && !params.width.trim())) {
      throw new Error('描边宽度必须是大于 0 的数字')
    }
    const parsedWidth = Number(params.width)
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) throw new Error('描边宽度必须是大于 0 的数字')
    const width = Math.max(1, roundToInteger(parsedWidth, context.allowNegativeValues))
    if (typeof params.color !== 'string') throw new Error('描边颜色格式无效')
    const color = expandColorHex(params.color)
    if (!color) throw new Error('描边颜色格式无效')
    const offsets = [{x:-1,y:-1},{x:0,y:-1},{x:1,y:-1},{x:-1,y:0},{x:1,y:0},{x:-1,y:1},{x:0,y:1},{x:1,y:1}]
    const selectedSet = new Set(selectedIds)
    const occupancy = buildLayerOccupancy(danmakus.filter((item) => !selectedSet.has(item.id)))
    const created: DanmakuItem[] = []
    for (const item of selected) {
      const copies = offsets.map((offset, index) => {
        const copy = cloneDanmaku(item)
        copy.id = makeId(); copy.layer = item.layer + index; copy.content.color = color
        copy.transform.start.x = clamp(item.transform.start.x + offset.x * width)
        copy.transform.start.y = clamp(item.transform.start.y + offset.y * width)
        copy.transform.end.x = clamp(item.transform.end.x + offset.x * width)
        copy.transform.end.y = clamp(item.transform.end.y + offset.y * width)
        return copy
      })
      const original = cloneDanmaku(item); original.layer = item.layer + offsets.length
      const group = [...copies, original]
      assignLayers(group, occupancy, context.maxLayers)
      copies.forEach((copy) => { created.push(copy); selectedIds.push(copy.id) })
      item.layer = original.layer
    }
    danmakus.push(...created)
    return { selectedIds: [...new Set(selectedIds)], historyLabel: '工具栏：高级工具描边' }
  }

  if (field === '@toolbar.center') {
    if (params.axis !== undefined && params.axis !== 'x' && params.axis !== 'y') throw new Error('居中方向无效')
    const axis = params.axis === 'y' ? 'y' : 'x'
    const measurements = await context.measureDanmakus(selected.map(cloneDanmaku))
    for (const item of selected) {
      const measure = measurements[item.id]
      if (!measure || !Number.isFinite(measure.rawWidth) || !Number.isFinite(measure.rawHeight)) {
        throw new Error(`弹幕 ${item.id} 测量结果缺失或无效`)
      }
      const zRotate = Number.isFinite(item.transform.zRotate) ? item.transform.zRotate : 0
      const box = rotatedBox(measure.rawWidth, measure.rawHeight, zRotate)
      const size = axis === 'x' ? context.screenWidth : context.screenHeight
      const coordinate = axis === 'x' ? ((size - box.width) / 2) - box.minX : ((size - box.height) / 2) - box.minY
      for (const target of targets(item)) target[axis] = clamp(coordinate)
    }
    return { selectedIds, historyLabel: axis === 'x' ? '工具栏：垂直居中' : '工具栏：水平居中' }
  }

  if (field === '@toolbar.copy') {
    if (params.direction !== undefined && params.direction !== 'startToEnd' && params.direction !== 'endToStart') {
      throw new Error('坐标复制方向无效，应为 startToEnd 或 endToStart')
    }
    const direction = params.direction === 'endToStart' ? 'endToStart' : 'startToEnd'
    for (const item of selected) {
      const source = direction === 'startToEnd' ? item.transform.start : item.transform.end
      const target = direction === 'startToEnd' ? item.transform.end : item.transform.start
      target.x = clamp(source.x); target.y = clamp(source.y)
    }
    return { selectedIds, historyLabel: direction === 'startToEnd' ? '工具栏：起始坐标应用至结束坐标' : '工具栏：结束坐标应用至起始坐标' }
  }

  if (field === '@toolbar.swap') {
    for (const item of selected) {
      const startX = roundToInteger(item.transform.start.x, context.allowNegativeValues)
      const startY = roundToInteger(item.transform.start.y, context.allowNegativeValues)
      const endX = roundToInteger(item.transform.end.x, context.allowNegativeValues)
      const endY = roundToInteger(item.transform.end.y, context.allowNegativeValues)
      item.transform.start.x = endX
      item.transform.start.y = endY
      item.transform.end.x = startX
      item.transform.end.y = startY
    }
    return { selectedIds, historyLabel: '工具栏：互换结束与起始坐标' }
  }

  if (field === '@toolbar.mirror') {
    if (params.axis !== undefined && params.axis !== 'horizontal' && params.axis !== 'vertical') throw new Error('镜像方向无效')
    const axis = params.axis === 'vertical' ? 'vertical' : 'horizontal'
    for (const item of selected) {
      if (axis === 'horizontal') {
        item.transform.start.x = clamp(context.screenWidth - item.transform.start.x)
        item.transform.end.x = clamp(context.screenWidth - item.transform.end.x)
        item.transform.zRotate = normalizeAngle(360 - item.transform.zRotate)
      } else {
        item.transform.start.y = clamp(context.screenHeight - item.transform.start.y)
        item.transform.end.y = clamp(context.screenHeight - item.transform.end.y)
        item.transform.zRotate = normalizeAngle(180 - item.transform.zRotate)
      }
      item.transform.yRotate = normalizeAngle(180 - item.transform.yRotate)
    }
    return { selectedIds, historyLabel: axis === 'horizontal' ? '工具栏：水平镜像' : '工具栏：垂直镜像' }
  }

  if (field === '@toolbar.calculateRotation') {
    for (const item of selected) {
      const angle = normalizeAngle(Math.atan2(item.transform.end.y - item.transform.start.y, item.transform.end.x - item.transform.start.x) * 180 / Math.PI)
      item.transform.zRotate = roundToInteger(angle, context.allowNegativeValues)
    }
    return { selectedIds, historyLabel: '工具栏：根据坐标计算Z轴旋转' }
  }

  if (field === '@toolbar.length') {
    if (typeof params.length === 'boolean' || params.length === null) throw new Error('请输入有效长度')
    const lengthText = String(params.length ?? '').trim()
    if (!lengthText) throw new Error('请输入长度')
    const length = Number(lengthText)
    if (!Number.isFinite(length)) throw new Error('请输入有效长度')
    const angleText = String(params.angle ?? '').trim()
    const isRelativeAngle = /^[+-]\d+(?:\.\d+)?$/.test(angleText)
    const isAbsoluteAngle = /^\d+(?:\.\d+)?$/.test(angleText)
    if (angleText && !isRelativeAngle && !isAbsoluteAngle) {
      throw new Error('角度格式无效，请留空或输入数字、+数字、-数字')
    }
    const parsedAngle = angleText ? Number(angleText) : 0
    if (angleText && !Number.isFinite(parsedAngle)) {
      throw new Error('角度数值超出有效范围')
    }
    let hasRangeClamp = false
    for (const item of selected) {
      let angle = item.transform.zRotate
      if (isRelativeAngle) angle = normalizeAngle(angle + parsedAngle)
      else if (isAbsoluteAngle) angle = normalizeAngle(parsedAngle)
      const rad = angle * Math.PI / 180
      const rawEndX = item.transform.start.x + length * Math.cos(rad)
      const rawEndY = item.transform.start.y + length * Math.sin(rad)
      const clampedX = Math.max(0, Math.min(10000, rawEndX))
      const clampedY = Math.max(0, Math.min(10000, rawEndY))
      if (clampedX !== rawEndX || clampedY !== rawEndY) hasRangeClamp = true
      item.transform.end.x = clamp(clampedX)
      item.transform.end.y = clamp(clampedY)
    }
    if (hasRangeClamp) warnings.push('部分长度计算结果超出坐标范围，已自动限制在 0 到 10000 之间')
    return { selectedIds, historyLabel: '工具栏：长度输入' }
  }

  if (field === '@toolbar.lockAngle') {
    if (params.changedAxis !== undefined && params.changedAxis !== 'x' && params.changedAxis !== 'y') throw new Error('锁角坐标轴无效')
    const axis = params.changedAxis === 'y' ? 'y' : 'x'
    const angleText = String(params.angle ?? '').trim()
    const isRelativeAngle = /^[+-]\d+(?:\.\d+)?$/.test(angleText)
    const isAbsoluteAngle = /^\d+(?:\.\d+)?$/.test(angleText)
    if (angleText && !isRelativeAngle && !isAbsoluteAngle) {
      throw new Error('角度格式无效，请留空或输入数字、+数字、-数字')
    }
    const parsedAngle = angleText ? Number(angleText) : 0
    if (angleText && !Number.isFinite(parsedAngle)) {
      throw new Error('角度数值超出有效范围')
    }
    let hasClampWarning = false
    const clampToRange = (value: number) => {
      if (Number.isNaN(value)) return 0
      if (!Number.isFinite(value)) return value > 0 ? Math.max(10000, context.screenHeight, context.screenWidth) : 0
      return Math.max(0, Math.min(10000, value))
    }
    for (const item of selected) {
      let resolvedAngle = item.transform.zRotate
      if (isRelativeAngle) resolvedAngle += parsedAngle
      else if (isAbsoluteAngle) resolvedAngle = parsedAngle
      const radians = normalizeAngle(resolvedAngle) * Math.PI / 180
      const dx = Math.cos(radians)
      const dy = Math.sin(radians)
      const epsilon = 1e-6
      let nextX = axis === 'x' ? item.transform.end.x : item.transform.start.x
      let nextY = axis === 'y' ? item.transform.end.y : item.transform.start.y
      if (axis === 'x') {
        if (Math.abs(dx) > epsilon) {
          const t = (nextX - item.transform.start.x) / dx
          nextY = item.transform.start.y + t * dy
        } else {
          nextY = dy >= 0 ? Infinity : -Infinity
        }
      } else {
        if (Math.abs(dy) > epsilon) {
          const t = (nextY - item.transform.start.y) / dy
          nextX = item.transform.start.x + t * dx
        } else {
          nextX = dx >= 0 ? Infinity : -Infinity
        }
      }
      let clampedX = clampToRange(nextX)
      let clampedY = clampToRange(nextY)
      if (clampedX !== nextX && Math.abs(dx) > epsilon) {
        const t = (clampedX - item.transform.start.x) / dx
        clampedY = clampToRange(item.transform.start.y + t * dy)
      }
      if (clampedY !== nextY && Math.abs(dy) > epsilon) {
        const t = (clampedY - item.transform.start.y) / dy
        clampedX = clampToRange(item.transform.start.x + t * dx)
      }
      if (clampedX !== nextX || clampedY !== nextY || !Number.isFinite(nextX) || !Number.isFinite(nextY)) {
        hasClampWarning = true
      }
      item.transform.end.x = roundToInteger(clampedX, context.allowNegativeValues)
      item.transform.end.y = roundToInteger(clampedY, context.allowNegativeValues)
    }
    if (hasClampWarning) warnings.push('部分锁定角度结果超出坐标范围，已自动限制在 0 到 10000 之间')
    return { selectedIds, historyLabel: '工具栏：锁定角度' }
  }

  if (field === '@toolbar.pickAt') {
    if (
      typeof params.x === 'boolean' || params.x === null || (typeof params.x === 'string' && !params.x.trim()) ||
      typeof params.y === 'boolean' || params.y === null || (typeof params.y === 'string' && !params.y.trim())
    ) {
      throw new Error('拾取坐标无效')
    }
    const x = Number(params.x)
    const y = Number(params.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('拾取坐标无效')
    for (const item of selected) {
      for (const target of targets(item)) {
        target.x = clamp(x)
        target.y = clamp(y)
      }
    }
    return { selectedIds, historyLabel: '工具栏：拾取定位' }
  }

  if (field === '@toolbar.split') {
    const mode = params.mode
    if (mode !== 'line' && mode !== 'letter' && mode !== 'time') throw new Error('分割模式无效')
    const created: DanmakuItem[] = []
    const nextSelected = [...selectedIds]
    const lineItems: Array<{ item: DanmakuItem; base: DanmakuItem; lineIndex: number }> = []
    if (mode === 'time') {
      if (!Number.isFinite(context.currentTime) || context.currentTime < 0) {
        throw new Error('当前播放头时间无效，无法进行时间分割')
      }
      const splitTime = Math.round(context.currentTime)
      let skippedCount = 0
      for (const item of selected) {
        const original = cloneDanmaku(item)
        const end = original.startTime + original.animation.duration
        const before = splitTime - original.startTime
        const after = end - splitTime
        if (before <= 10 || after <= 10) {
          skippedCount++
          continue
        }
        item.animation.duration = Math.round(before)
        const second = cloneDanmaku(original)
        second.id = makeId()
        second.startTime = splitTime
        second.animation.duration = Math.round(after)
        created.push(second)
        nextSelected.push(second.id)
      }
      if (skippedCount > 0) {
        warnings.push(
          created.length === 0
            ? '没有弹幕被时间分割：播放头需落在选中弹幕起止时间 10ms 以外的区间'
            : `有 ${skippedCount} 条弹幕未满足时间分割条件（播放头距起止不足 10ms），已跳过`
        )
      }
    } else {
      selected.forEach((item) => {
        const base = cloneDanmaku(item)
        const lines = base.content.text.split(/\r?\n/)
        if (lines.length <= 1) {
          if (item.content.text !== lines[0]) item.content.text = lines[0]
          lineItems.push({ item, base, lineIndex: 0 })
          return
        }
        item.content.text = lines[0]
        lineItems.push({ item, base, lineIndex: 0 })
        lines.slice(1).forEach((line, index) => {
          const copy = cloneDanmaku(base)
          copy.id = makeId()
          copy.content.text = line
          const lineIndex = index + 1
          const rad = base.transform.zRotate * Math.PI / 180
          const offsetX = -Math.sin(rad) * base.content.size * lineIndex
          const offsetY = Math.cos(rad) * base.content.size * lineIndex
          copy.transform.start.x = clamp(base.transform.start.x + offsetX)
          copy.transform.start.y = clamp(base.transform.start.y + offsetY)
          copy.transform.end.x = clamp(base.transform.end.x + offsetX)
          copy.transform.end.y = clamp(base.transform.end.y + offsetY)
          created.push(copy)
          nextSelected.push(copy.id)
          lineItems.push({ item: copy, base, lineIndex })
        })
      })

      if (mode === 'letter') {
        const measureRequests: DanmakuItem[] = []
        const requestFor = new Map<string, string>()
        const lineGraphemes = lineItems.map(({ item }) => splitGraphemes(item.content.text))
        lineItems.forEach(({ item }, recordIndex) => {
          const graphemes = lineGraphemes[recordIndex]
          for (let index = 1; index < graphemes.length; index++) {
            const request = cloneDanmaku(item)
            const requestId = `measure-${recordIndex}-${index}`
            request.id = requestId
            request.content.text = graphemes.slice(0, index).join('')
            measureRequests.push(request)
            requestFor.set(`${recordIndex}:${index}`, requestId)
          }
        })
        if (measureRequests.length > 2000) {
          throw new Error(`字分隔待测量字符过多（${measureRequests.length} 个，上限 2000 个），请减少单次选中的弹幕数量或文本长度`)
        }
        const measurements = measureRequests.length ? await context.measureDanmakus(measureRequests) : {}
        lineItems.forEach(({ item }, recordIndex) => {
          const graphemes = lineGraphemes[recordIndex]
          if (graphemes.length <= 1) return
          item.content.text = graphemes[0]
          const baseItem = cloneDanmaku(item)
          for (let index = 1; index < graphemes.length; index++) {
            const copy = cloneDanmaku(baseItem)
            copy.id = makeId()
            copy.content.text = graphemes[index]
            const requestId = requestFor.get(`${recordIndex}:${index}`)
            const width = requestId ? measurements[requestId]?.rawWidth : undefined
            if (typeof width !== 'number' || !Number.isFinite(width)) {
              throw new Error(`字分隔测量结果缺失：${item.id}`)
            }
            const rad = baseItem.transform.zRotate * Math.PI / 180
            copy.transform.start.x = clamp(baseItem.transform.start.x + Math.cos(rad) * width)
            copy.transform.start.y = clamp(baseItem.transform.start.y + Math.sin(rad) * width)
            copy.transform.end.x = clamp(baseItem.transform.end.x + Math.cos(rad) * width)
            copy.transform.end.y = clamp(baseItem.transform.end.y + Math.sin(rad) * width)
            created.push(copy)
            nextSelected.push(copy.id)
          }
        })
      }
    }
    if (created.length > 0) {
      const occupancy = buildLayerOccupancy(danmakus)
      assignLayersSequentially(created, occupancy, context.maxLayers)
      danmakus.push(...created)
    }
    return { selectedIds: [...new Set(nextSelected)], historyLabel: mode === 'line' ? '工具栏：行分隔' : mode === 'letter' ? '工具栏：字分隔' : '工具栏：时间分割' }
  }

  throw new Error(`不支持的编辑操作：${field}`)
}

export async function applyEditorApi(context: EditorApiContext, field: string, method: EditorApiMethod): Promise<EditorApiOutcome> {
  const isCommandFilter = field === '@toolbar.command'
    && method !== null
    && typeof method === 'object'
    && !Array.isArray(method)
    && typeof method.command === 'string'
    && /^\/s\b/i.test(method.command.trim())

  if (field === '@selection.filter' || isCommandFilter) {
    if (!method || typeof method !== 'object' || Array.isArray(method) || typeof (method as Record<string, unknown>).command !== 'string') {
      throw new Error('筛选参数必须包含字符串类型的 command')
    }
    const command = String((method as Record<string, unknown>).command)
    if (field !== '@selection.filter' && !/^\/s\b/i.test(command.trim())) throw new Error('筛选命令必须以 /s 开头')
    const matches = parseSelectionCommand(command)
    const selecting = new Set(context.selectedIds)
    const nextSelection = context.danmakus.filter((item) => matches(item, selecting)).map((item) => item.id)
    return { danmakus: context.danmakus, selectedIds: nextSelection, changedIds: [], createdIds: [], warnings: [], selectionChanged: true }
  }

  const existingIds = new Set(context.danmakus.map((item) => item.id))
  const selectedIdSet = new Set(context.selectedIds)
  const selectedBeforeJson = new Map<string, string>()
  const draft = context.danmakus.map((item) => {
    if (!selectedIdSet.has(item.id)) return item
    selectedBeforeJson.set(item.id, JSON.stringify(item))
    return cloneDanmaku(item)
  })
  const warnings: string[] = []
  let nextSelection = [...context.selectedIds]
  let historyLabel: string | undefined
  let changedField: string | undefined
  let changedFields: string[] | undefined

  if (field === '@danmaku.updateFields') {
    const selectedItems = draft.filter((item) => selectedIdSet.has(item.id))
    if (!selectedItems.length) throw new Error('没有选中的弹幕')
    const rawSteps = method && typeof method === 'object' && !Array.isArray(method)
      ? (method as Record<string, unknown>).steps
      : undefined
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      throw new Error('steps 必须是非空二维数组')
    }
    const appliedFields: string[] = []
    let totalEntries = 0
    for (let stepIndex = 0; stepIndex < rawSteps.length; stepIndex++) {
      const rawStep = rawSteps[stepIndex]
      if (!Array.isArray(rawStep) || rawStep.length === 0) {
        throw new Error(`steps[${stepIndex}] 必须是非空数组`)
      }
      totalEntries += rawStep.length
      if (totalEntries > 200) {
        throw new Error('所有步骤的更新条目总数不能超过 200')
      }
      const seenFields = new Set<string>()
      const stepBases = selectedItems.map(cloneDanmaku)
      for (const entry of rawStep) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new Error(`steps[${stepIndex}] 中的每一项都必须是包含 field 和 method 的对象`)
        }
        const updateField = (entry as Record<string, unknown>).field
        const updateMethod = (entry as Record<string, unknown>).method
        if (typeof updateField !== 'string' || !FIELD_PATHS.has(updateField)) {
          throw new Error(`不支持批量更新的字段：${String(updateField)}`)
        }
        if (seenFields.has(updateField)) {
          throw new Error(`第 ${stepIndex + 1} 步中存在重复字段：${updateField}（如需先后多次修改同一字段，请拆到不同步骤）`)
        }
        seenFields.add(updateField)
        const upset = parseUpsetMethod(updateMethod)
        if (upset) {
          applyUpsetToField(selectedItems, stepBases, updateField, upset.seed)
        } else {
          if (typeof updateMethod !== 'string' && typeof updateMethod !== 'number' && typeof updateMethod !== 'boolean') {
            throw new Error(`字段 ${updateField} 的更新值必须是字符串、数字、布尔值或 { op: "upset", seed? }`)
          }
          const evaluateField = prepareFieldEvaluator(updateField, updateMethod, context.allowNegativeValues, warnings)
          selectedItems.forEach((item, index) => {
            const value = evaluateField(item, stepBases[index])
            setPath(item as unknown as Record<string, any>, updateField, value)
          })
        }
        appliedFields.push(updateField)
      }
    }
    changedField = appliedFields[appliedFields.length - 1]
    changedFields = [...new Set(appliedFields)]
    historyLabel = `批量字段更新（${rawSteps.length} 步）：${changedFields.join(', ')}`
  } else if (FIELD_PATHS.has(field)) {
    const selectedItems = draft.filter((item) => selectedIdSet.has(item.id))
    if (!selectedItems.length) throw new Error('没有选中的弹幕')
    const path = field
    const upset = parseUpsetMethod(method)
    if (upset) {
      applyUpsetToField(selectedItems, selectedItems, path, upset.seed)
      changedField = path
      changedFields = [path]
      historyLabel = `字段打乱：${path}`
    } else {
      if (typeof method !== 'string' && typeof method !== 'number' && typeof method !== 'boolean') {
        throw new Error('字段操作的第二个参数必须是字符串、数字、布尔值或 { op: "upset", seed? }')
      }
      const input = method as FieldInput
      const evaluateField = prepareFieldEvaluator(path, input, context.allowNegativeValues, warnings)
      for (const item of selectedItems) {
        const value = evaluateField(item)
        setPath(item as unknown as Record<string, any>, path, value)
      }
      changedField = path
      changedFields = [path]
      historyLabel = `字段更新：${path} 操作：${method}`
    }
  } else if (TOOLBAR_FIELDS.has(field)) {
    const result = await applyToolbarOperation(context, draft, field, method, nextSelection, warnings)
    nextSelection = result.selectedIds
    historyLabel = result.historyLabel
    changedField = result.changedField
    if (changedField) changedFields = [changedField]
  } else {
    throw new Error(`不支持的字段或操作：${field}`)
  }

  const changedIds = draft
    .filter((item) => {
      const before = selectedBeforeJson.get(item.id)
      return before !== undefined && before !== JSON.stringify(item)
    })
    .map((item) => item.id)
  const createdIds = draft
    .filter((item) => !existingIds.has(item.id))
    .map((item) => item.id)
  return { danmakus: draft, selectedIds: nextSelection, changedIds, createdIds, warnings: [...new Set(warnings)], historyLabel, changedField, changedFields, selectionChanged: false }
}
