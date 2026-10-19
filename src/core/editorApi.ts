import type { DanmakuItem } from './danmaku'
import type { ToolbarMeasure } from './danmakuMeasurement'
import {
  applyOperation,
  blendColor,
  createNumericVariableContext,
  evaluateMathExpression,
  NUMERIC_FIELD_DEFINITIONS,
  parseColorWithAlpha,
  parseInput
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
export type EditorApiMethod = FieldInput | Record<string, unknown>

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getPath(target: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], target)
}

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const keys = path.split('.')
  let current = target
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {}
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

function calculateTextLength(text: string): number {
  let length = 0
  for (const char of text) length += char === '\n' ? 2 : 1
  return length
}

function normalizeFieldValue(path: string, value: number, allowNegative: boolean, warnings: string[]): number {
  if (path === 'opacity.from' || path === 'opacity.to') {
    return roundOpacityValue(validateRange(value, 0, 1))
  }
  if (path === 'transform.zRotate' || path === 'transform.yRotate') {
    return roundToInteger(normalizeAngle(value), allowNegative)
  }

  let normalized = roundToInteger(value, allowNegative)
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

function fieldValueForItem(item: DanmakuItem, path: string, input: FieldInput, allowNegative: boolean, warnings: string[]): unknown {
  if (path === 'content.color') {
    const value = String(input)
    const alpha = parseColorWithAlpha(value)
    if (alpha) {
      return blendColor(item.content.color || '#ffffff', alpha.color, alpha.alpha)
    }
    const color = normalizeColor(value)
    if (!color) throw new Error('颜色格式无效（支持 #RRGGBB 或 RRGGBB@Alpha 格式）')
    return color
  }

  if (path === 'content.text') {
    const text = String(input)
    if (calculateTextLength(text) > 255) warnings.push('文本数据超过255字符限制（换行符占2个字符）')
    return text
  }

  if (path === 'content.font' || path === 'animation.easing') return String(input)
  if (path === 'content.stroke') {
    if (typeof input !== 'boolean') throw new Error('描边字段需要布尔值')
    return input
  }

  const definition = Object.values(NUMERIC_FIELD_DEFINITIONS).find((item) => item.path === path)
  const isOpacity = path === 'opacity.from' || path === 'opacity.to'
  const isRotation = path === 'transform.zRotate' || path === 'transform.yRotate'
  if (!definition && !isOpacity && !isRotation) throw new Error(`字段 ${path} 不支持数值操作`)

  const inputText = String(input).trim()
  if (inputText.startsWith('$')) {
    const expression = inputText.slice(1).trim()
    if (!expression) throw new Error(`字段 ${path} 的表达式为空`)
    let result: number
    try {
      result = evaluateMathExpression(expression, createNumericVariableContext(item))
    } catch (error) {
      throw new Error(`字段 ${path} 表达式执行失败：${error instanceof Error ? error.message : String(error)}`)
    }
    return normalizeFieldValue(path, result, allowNegative, warnings)
  }

  if (typeof input === 'boolean') throw new Error(`字段 ${path} 不能接收布尔值`)
  const parsed = parseInput(inputText, false)
  if (parsed.error) throw new Error(`字段 ${path} 验证失败: ${parsed.error}`)
  if (parsed.mode === 'multiple') return getPath(item as unknown as Record<string, any>, path)

  const current = getPath(item as unknown as Record<string, any>, path)
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    throw new Error(`弹幕 ${item.id} 的字段 ${path} 不是有效数值`)
  }
  const next = applyOperation(current, parsed)
  return normalizeFieldValue(path, next, allowNegative, warnings)
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

function parseSelectionCommand(command: string): (item: DanmakuItem, selecting: Set<string>) => boolean {
  const body = command.replace(/^\/s\b/, '').trim()
  if (!body) throw new Error('请输入至少一组筛选规则')
  const groups = splitOutsideQuotes(body, ';').map((group) => splitOutsideQuotes(group, ','))
  const criteria = groups.map((group) => group.map((rule) => {
    if (rule === 'selecting') return { kind: 'selecting' as const }
    const match = rule.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*"([\s\S]*)"$/)
    if (!match) throw new Error('筛选规则格式无效')
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
    const path = aliases[match[1]]
    if (!path) throw new Error(`筛选字段 ${match[1]} 不存在`)
    const rawCriteria = splitOutsideQuotes(match[2], ',')
    type SelectionTest = (value: unknown, item: DanmakuItem) => boolean
    const tests: SelectionTest[] = rawCriteria.map((criterion) => {
      if (criterion.startsWith("'") && criterion.endsWith("'")) {
        const expected = criterion.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        return (value: unknown) => String(value ?? '') === expected
      }
      if (criterion.startsWith('<') && criterion.endsWith('>')) {
        let regex: RegExp
        try { regex = new RegExp(criterion.slice(1, -1)) } catch { throw new Error(`筛选字段 ${match[1]} 的正则表达式无效`) }
        return (value: unknown) => {
          regex.lastIndex = 0
          return value !== null && value !== undefined && regex.test(String(value))
        }
      }
      if (/^(?:layer|startTime|content\.size|transform\.(?:start|end)\.[xy]|transform\.[zy]Rotate|opacity\.(?:from|to)|animation\.(?:duration|moveDuration|delay))$/.test(path)) {
        const parts = splitOutsideQuotes(criterion, '~')
        if (parts.length !== 2) throw new Error(`筛选字段 ${match[1]} 的条件应为 '匹配值' 或 数值~数值`)
        return (value: unknown, item: DanmakuItem) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) return false
          const variables = createNumericVariableContext(item)
          const from = evaluateMathExpression(parts[0], variables)
          const to = evaluateMathExpression(parts[1], variables)
          return value >= Math.min(from, to) && value <= Math.max(from, to)
        }
      }
      throw new Error(`筛选字段 ${match[1]} 的条件格式无效`)
    })
    return { kind: 'field' as const, path, tests }
  }))
  return (item, selecting) => criteria.some((group) => group.every((rule) => {
    if (rule.kind === 'selecting') return selecting.has(item.id)
    const value = getPath(item as unknown as Record<string, any>, rule.path)
    return rule.tests.some((test) => test(value, item))
  }))
}

function getSelected(danmakus: DanmakuItem[], ids: string[]): DanmakuItem[] {
  const idSet = new Set(ids)
  return danmakus.filter((item) => idSet.has(item.id))
}

function allocateId(context: EditorApiContext, danmakus: DanmakuItem[]) {
  const generated = Number(context.generateId())
  const maxExisting = danmakus.reduce((max, item) => {
    const id = Number(item.id)
    return Number.isFinite(id) ? Math.max(max, id) : max
  }, 0)
  let next = Number.isFinite(generated) ? Math.max(generated, maxExisting + 1) : maxExisting + 1
  const used = new Set(danmakus.map((item) => item.id))
  return () => {
    while (used.has(String(next))) next++
    const id = String(next++)
    used.add(id)
    return id
  }
}

function rotatedBox(width: number, height: number, angle: number) {
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

function hasLayerConflict(candidate: DanmakuItem, layer: number, occupied: DanmakuItem[]) {
  return occupied.some((item) => item.layer === layer && candidate.startTime < item.startTime + item.animation.duration && item.startTime < candidate.startTime + candidate.animation.duration)
}

function assignLayers(candidates: DanmakuItem[], occupied: DanmakuItem[], maxLayers: number) {
  const maxLayer = Math.max(0, maxLayers - 1)
  for (const candidate of candidates) {
    let layer = Math.max(0, Math.round(candidate.layer))
    while (layer < maxLayers && hasLayerConflict(candidate, layer, occupied)) layer++
    candidate.layer = Math.min(layer, maxLayer)
    occupied.push(clone(candidate))
  }
}

function assignLayersSequentially(candidates: DanmakuItem[], occupied: DanmakuItem[], maxLayers: number) {
  const maxLayer = Math.max(0, maxLayers - 1)
  const ordered = [...candidates].sort((left, right) => left.layer - right.layer)
  for (const candidate of ordered) {
    let layer = Math.max(0, Math.round(candidate.layer))
    while (layer < maxLayers && hasLayerConflict(candidate, layer, occupied)) layer++
    candidate.layer = Math.min(layer, maxLayer)
    occupied.push(clone(candidate))
  }
}

async function applyToolbarOperation(
  context: EditorApiContext,
  danmakus: DanmakuItem[],
  field: string,
  method: EditorApiMethod,
  selectedIds: string[],
  warnings: string[]
): Promise<{ selectedIds: string[]; historyLabel: string; changedField?: string }> {
  const params = method && typeof method === 'object' ? method as Record<string, any> : { value: method }
  const selected = getSelected(danmakus, selectedIds)
  if (field !== '@toolbar.command' && field !== '@selection.filter' && selected.length === 0) throw new Error('没有选中的弹幕')
  const makeId = allocateId(context, danmakus)
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

  if (field === '@toolbar.command' && typeof params.command === 'string' && /^\/s\b/.test(params.command.trim())) {
    const matches = parseSelectionCommand(params.command.trim())
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
      return { target: match[1], expression: match[2].trim() }
    })
    if (!rules.length) throw new Error('请输入至少一条赋值规则')
    const bases = selected.map(clone)
    const updates = bases.map(clone)
    for (const rule of rules) {
      const definition = NUMERIC_FIELD_DEFINITIONS[rule.target]
      if (rule.expression === 'upset') {
        const values = updates.map((item) => getPath(item as unknown as Record<string, any>, definition.path))
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[values[i], values[j]] = [values[j], values[i]]
        }
        updates.forEach((item, index) => setPath(item as unknown as Record<string, any>, definition.path, values[index]))
      } else {
        updates.forEach((item, index) => {
          let value: number
          try {
            value = evaluateMathExpression(rule.expression, createNumericVariableContext(bases[index]))
          } catch (error) {
            throw new Error(`命令字段 ${rule.target} 表达式执行失败：${error instanceof Error ? error.message : String(error)}`)
          }
          const normalized = definition.kind === 'opacity'
            ? roundOpacityValue(value)
            : roundToInteger(value, context.allowNegativeValues)
          setPath(item as unknown as Record<string, any>, definition.path, normalized)
        })
      }
    }
    const byId = new Map(updates.map((item) => [item.id, item]))
    danmakus.forEach((item, index) => { const updated = byId.get(item.id); if (updated) danmakus[index] = updated })
    return { selectedIds, historyLabel: `命令执行：${rules.length} 条规则` }
  }

  if (field === '@toolbar.stroke') {
    const parsedWidth = Number(params.width)
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) throw new Error('描边宽度必须是大于 0 的数字')
    const width = Math.max(1, roundToInteger(parsedWidth, context.allowNegativeValues))
    const color = normalizeColor(String(params.color ?? ''))
    if (!color) throw new Error('描边颜色格式无效')
    const offsets = [{x:-1,y:-1},{x:0,y:-1},{x:1,y:-1},{x:-1,y:0},{x:1,y:0},{x:-1,y:1},{x:0,y:1},{x:1,y:1}]
    const selectedSet = new Set(selectedIds)
    const occupied = danmakus.filter((item) => !selectedSet.has(item.id)).map(clone)
    const created: DanmakuItem[] = []
    for (const item of selected) {
      const copies = offsets.map((offset, index) => {
        const copy = clone(item)
        copy.id = makeId(); copy.layer = item.layer + index; copy.content.color = color
        copy.transform.start.x = clamp(item.transform.start.x + offset.x * width)
        copy.transform.start.y = clamp(item.transform.start.y + offset.y * width)
        copy.transform.end.x = clamp(item.transform.end.x + offset.x * width)
        copy.transform.end.y = clamp(item.transform.end.y + offset.y * width)
        return copy
      })
      const original = clone(item); original.layer = item.layer + offsets.length
      const group = [...copies, original]
      assignLayers(group, occupied, context.maxLayers)
      copies.forEach((copy) => { created.push(copy); selectedIds.push(copy.id) })
      item.layer = original.layer
    }
    danmakus.push(...created)
    return { selectedIds: [...new Set(selectedIds)], historyLabel: '工具栏：高级工具描边' }
  }

  if (field === '@toolbar.center') {
    if (params.axis !== undefined && params.axis !== 'x' && params.axis !== 'y') throw new Error('居中方向无效')
    const axis = params.axis === 'y' ? 'y' : 'x'
    const measurements = await context.measureDanmakus(selected.map(clone))
    for (const item of selected) {
      const measure = measurements[item.id]
      if (!measure) throw new Error(`弹幕 ${item.id} 测量结果缺失`)
      const box = rotatedBox(measure.rawWidth, measure.rawHeight, item.transform.zRotate)
      const size = axis === 'x' ? context.screenWidth : context.screenHeight
      const coordinate = axis === 'x' ? ((size - box.width) / 2) - box.minX : ((size - box.height) / 2) - box.minY
      for (const target of targets(item)) target[axis] = clamp(coordinate)
    }
    return { selectedIds, historyLabel: axis === 'x' ? '工具栏：垂直居中' : '工具栏：水平居中' }
  }

  if (field === '@toolbar.copy') {
    const direction = params.direction
    if (direction !== 'startToEnd' && direction !== 'endToStart') throw new Error('坐标复制方向无效')
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
    const lengthText = String(params.length ?? '').trim()
    if (!lengthText) throw new Error('请输入长度')
    const length = Number(lengthText)
    if (!Number.isFinite(length)) throw new Error('请输入有效长度')
    const angleText = String(params.angle ?? '').trim()
    for (const item of selected) {
      let angle = item.transform.zRotate
      if (/^[+-]\d+(?:\.\d+)?$/.test(angleText)) angle = normalizeAngle(angle + Number(angleText))
      else if (/^\d+(?:\.\d+)?$/.test(angleText)) angle = normalizeAngle(Number(angleText))
      else if (angleText) throw new Error('角度格式无效，请留空或输入数字、+数字、-数字')
      const rad = angle * Math.PI / 180
      item.transform.end.x = clamp(Math.max(0, Math.min(10000, item.transform.start.x + length * Math.cos(rad))))
      item.transform.end.y = clamp(Math.max(0, Math.min(10000, item.transform.start.y + length * Math.sin(rad))))
    }
    return { selectedIds, historyLabel: '工具栏：长度输入' }
  }

  if (field === '@toolbar.lockAngle') {
    if (params.changedAxis !== undefined && params.changedAxis !== 'x' && params.changedAxis !== 'y') throw new Error('锁角坐标轴无效')
    const axis = params.changedAxis === 'y' ? 'y' : 'x'
    const angleText = String(params.angle ?? '').trim()
    let hasClampWarning = false
    const clampToRange = (value: number) => {
      if (Number.isNaN(value)) return 0
      if (!Number.isFinite(value)) return value > 0 ? Math.max(10000, context.screenHeight, context.screenWidth) : 0
      return Math.max(0, Math.min(10000, value))
    }
    for (const item of selected) {
      let resolvedAngle = item.transform.zRotate
      if (angleText) {
        if (/^[+-]\d+(?:\.\d+)?$/.test(angleText)) resolvedAngle += Number(angleText)
        else if (/^\d+(?:\.\d+)?$/.test(angleText)) resolvedAngle = Number(angleText)
        else throw new Error('角度格式无效，请留空或输入数字、+数字、-数字')
      }
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
      const splitTime = Math.round(context.currentTime)
      for (const item of selected) {
        const original = clone(item)
        const end = original.startTime + original.animation.duration
        const before = splitTime - original.startTime
        const after = end - splitTime
        if (before <= 10 || after <= 10) continue
        item.animation.duration = Math.round(before)
        const second = clone(original)
        second.id = makeId()
        second.startTime = splitTime
        second.animation.duration = Math.round(after)
        created.push(second)
        nextSelected.push(second.id)
      }
    } else {
      selected.forEach((item) => {
        const base = clone(item)
        const lines = base.content.text.split('\n')
        if (lines.length <= 1) {
          lineItems.push({ item, base, lineIndex: 0 })
          return
        }
        item.content.text = lines[0]
        lineItems.push({ item, base, lineIndex: 0 })
        lines.slice(1).forEach((line, index) => {
          const copy = clone(base)
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
        lineItems.forEach(({ item }, recordIndex) => {
          for (let index = 1; index < item.content.text.length; index++) {
            const request = clone(item)
            const requestId = `measure-${recordIndex}-${index}`
            request.id = requestId
            request.content.text = item.content.text.slice(0, index)
            measureRequests.push(request)
            requestFor.set(`${recordIndex}:${index}`, requestId)
          }
        })
        const measurements = measureRequests.length ? await context.measureDanmakus(measureRequests) : {}
        lineItems.forEach(({ item }, recordIndex) => {
          const originalText = item.content.text
          if (originalText.length <= 1) return
          item.content.text = originalText[0]
          const baseItem = clone(item)
          for (let index = 1; index < originalText.length; index++) {
            const copy = clone(baseItem)
            copy.id = makeId()
            copy.content.text = originalText[index]
            const requestId = requestFor.get(`${recordIndex}:${index}`)
            const width = requestId ? measurements[requestId]?.rawWidth : undefined
            if (width === undefined) throw new Error(`字分隔测量结果缺失：${item.id}`)
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
    const occupied = danmakus.map(clone)
    assignLayersSequentially(created, occupied, context.maxLayers)
    danmakus.push(...created)
    return { selectedIds: [...new Set(nextSelected)], historyLabel: mode === 'line' ? '工具栏：行分隔' : mode === 'letter' ? '工具栏：字分隔' : '工具栏：时间分割' }
  }

  throw new Error(`不支持的编辑操作：${field}`)
}

export async function applyEditorApi(context: EditorApiContext, field: string, method: EditorApiMethod): Promise<EditorApiOutcome> {
  if (field === '@selection.filter' || (field === '@toolbar.command' && typeof method === 'object' && typeof method.command === 'string' && /^\/s\b/.test(method.command.trim()))) {
    const command = field === '@selection.filter' ? String((method as Record<string, unknown>)?.command ?? '') : String((method as Record<string, unknown>).command)
    if (!/^\/s\b/.test(command.trim())) throw new Error('筛选命令必须以 /s 开头')
    const matches = parseSelectionCommand(command)
    const selecting = new Set(context.selectedIds)
    const nextSelection = context.danmakus.filter((item) => matches(item, selecting)).map((item) => item.id)
    return { danmakus: context.danmakus, selectedIds: nextSelection, changedIds: [], createdIds: [], warnings: [], selectionChanged: true }
  }

  const draft = clone(context.danmakus)
  const warnings: string[] = []
  let nextSelection = [...context.selectedIds]
  let historyLabel: string | undefined
  let changedField: string | undefined

  if (FIELD_PATHS.has(field)) {
    if (!context.selectedIds.length) throw new Error('没有选中的弹幕')
    if (!['@internal', '@none'].includes(field) && (typeof method !== 'string' && typeof method !== 'number' && typeof method !== 'boolean')) throw new Error('字段操作的第二个参数必须是字符串、数字或布尔值')
    const selectedIds = new Set(context.selectedIds)
    const input = method as FieldInput
    const path = field
    for (const item of draft) {
      if (!selectedIds.has(item.id)) continue
      const value = fieldValueForItem(item, path, input, context.allowNegativeValues, warnings)
      setPath(item as unknown as Record<string, any>, path, value)
    }
    changedField = path
    historyLabel = `字段更新：${path} 操作：${method}`
  } else if (TOOLBAR_FIELDS.has(field)) {
    const result = await applyToolbarOperation(context, draft, field, method, nextSelection, warnings)
    nextSelection = result.selectedIds
    historyLabel = result.historyLabel
    changedField = result.changedField
  } else {
    throw new Error(`不支持的字段或操作：${field}`)
  }

  const beforeById = new Map(context.danmakus.map((item) => [item.id, JSON.stringify(item)]))
  const changedIds = draft.filter((item) => beforeById.get(item.id) !== JSON.stringify(item)).map((item) => item.id)
  const createdIds = draft.filter((item) => !beforeById.has(item.id)).map((item) => item.id)
  return { danmakus: draft, selectedIds: nextSelection, changedIds, createdIds, warnings: [...new Set(warnings)], historyLabel, changedField, selectionChanged: false }
}
