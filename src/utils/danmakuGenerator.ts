import { useEditorStore } from '@/store/editor'
import type { DanmakuItem } from '@/core/danmaku'
import { measureDanmakus, type ToolbarMeasure } from '@/core/danmakuMeasurement'
import {
  applyOperation,
  blendColor,
  evaluateMathExpressionValue,
  evaluateSeededRandom,
  parseColorWithAlpha,
  parseInput,
  parseMathExpression
} from '@/utils/parser'
import { M7_RULES, normalizeAngle, normalizeColor, validateRange } from '@/utils/validation'

export type RuleMode = 'cycle' | 'range' | 'relative'
export type WriteMode = 'append' | 'replace'
export type DirectRuleMode = 'assign' | 'cycle'

export type NumericFieldPath =
  | 'layer'
  | 'startTime'
  | 'content.size'
  | 'transform.start.x'
  | 'transform.start.y'
  | 'transform.end.x'
  | 'transform.end.y'
  | 'transform.zRotate'
  | 'transform.yRotate'
  | 'opacity.from'
  | 'opacity.to'
  | 'animation.duration'
  | 'animation.moveDuration'
  | 'animation.delay'

export type ColorFieldPath = 'content.color'
export type DirectFieldPath = 'content.text' | 'content.font' | 'content.stroke' | 'animation.easing'
export type AllFieldPath = NumericFieldPath | ColorFieldPath | DirectFieldPath

export type NumericRuleState = {
  mode: RuleMode
  cycleList: string
  start: string
  end: string
  step: string
  expression: string
  expressionPreset: string
}

export type ColorRuleState = {
  mode: RuleMode
  cycleList: string
  start: string
  startText: string
  target: string
  targetText: string
  alpha: string
}

export type DirectRuleState<T> = {
  mode: DirectRuleMode
  value: T
  cycleList: string
}

export type ToolWriteRequest = {
  quantity: number
  expressionEnabled: boolean
  writeMode: WriteMode
  previewText: string
  numericRules: Record<NumericFieldPath, NumericRuleState>
  colorRule: ColorRuleState
  directRules: {
    text: DirectRuleState<string>
    font: DirectRuleState<string>
    stroke: DirectRuleState<boolean>
    easing: DirectRuleState<DanmakuItem['animation']['easing']>
  }
}

export type AgentNumericRule =
  | { mode: 'range'; start: number; end: number; expression?: string }
  | { mode: 'relative'; start: number; step: number | string }
  | { mode: 'cycle'; values: Array<number | string> }

export type AgentColorRule =
  | { mode: 'range'; start: string; target: string }
  | { mode: 'relative'; start: string; target: string; alpha: number | string }
  | { mode: 'cycle'; values: string[] }

export type AgentDirectRule =
  | { mode: 'assign'; value: string | boolean }
  | { mode: 'cycle'; values: Array<string | boolean> }

export type AgentCreationRule = AgentNumericRule | AgentColorRule | AgentDirectRule

export type AgentCreationRequest = {
  quantity: number
  rules: Partial<Record<AllFieldPath, AgentCreationRule>>
}

export type MeasurementVariableName = 'rawWidth' | 'rawHeight' | 'boxWidth' | 'boxHeight'

export type GenerateDanmakuOptions = {
  measureDanmakus?: (danmakus: DanmakuItem[]) => Promise<ToolbarMeasure>
}

export type DanmakuDraft = Omit<DanmakuItem, 'id'> & {
  id?: string
}

export type GeneratedPreviewResult = {
  generatedDanmakus: DanmakuDraft[]
  nextDanmakus: DanmakuDraft[]
  previewText: string
}

interface RangeEvaluationParams {
  expression: string; // 用户输入的表达式，例如 "S + (E - S) * bezier(0.25, 0.1, 0.25, 1, t)"
  startVal: number;   // UI传入的起点数值
  endVal: number;     // UI传入的终点数值
  quantity: number;   // 生成数量
  fieldSeries?: Partial<Record<AllFieldPath, unknown[]>>
  measurementSeries?: Partial<Record<MeasurementVariableName, number[]>>
}

export type ExpressionPreset = {
  key: string
  label: string
  expression: string
}

export const RANGE_EXPRESSION_PRESETS: ExpressionPreset[] = [
  {
    key: 'linear',
    label: '线性均分',
    expression: 'S + (E - S) * t'
  },
  {
    key: 'easeInOut',
    label: '标准缓入缓出',
    expression: 'S + (E - S) * bezier(0.42, 0, 0.58, 1, t)'
  },
  {
    key: 'easeIn',
    label: '缓入',
    expression: 'S + (E - S) * bezier(0.42, 0, 1, 1, t)'
  },
  {
    key: 'easeOut',
    label: '缓出',
    expression: 'S + (E - S) * bezier(0, 0, 0.58, 1, t)'
  },
  {
    key: 'quadIn',
    label: '二次加速曲线',
    expression: 'S + (E - S) * t ^ 2'
  },
  {
    key: 'quadOut',
    label: '二次减速曲线',
    expression: 'S + (E - S) * (1 - (1 - t) ^ 2)'
  },
  {
    key: 'random',
    label: '随机',
    expression: 'S + (E - S) * random()'
  },
  {
    key: 'overshoot',
    label: '轻微回弹',
    expression: 'S + (E - S) * (t + 0.18 * sin(pi * t) * (1 - t))'
  }
  
]

const MAX_GENERATE_QUANTITY = 10000
const agentCycleValuesMap = new WeakMap<object, string[]>()

function getRuleCycleEntries(rule: { cycleList: string }): string[] {
  const exactValues = agentCycleValuesMap.get(rule)
  return exactValues ? [...exactValues] : parseStrictList(rule.cycleList)
}

export function createDefaultNumericRules(currentTime = 0): Record<NumericFieldPath, NumericRuleState> {
  const safeCurrentTime = typeof currentTime === 'number' && Number.isFinite(currentTime)
    ? Math.max(0, currentTime)
    : 0
  const createRule = (mode: RuleMode, start = '', end = '', step = ''): NumericRuleState => ({
    mode,
    cycleList: '',
    start,
    end,
    step,
    expression: RANGE_EXPRESSION_PRESETS[0].expression,
    expressionPreset: RANGE_EXPRESSION_PRESETS[0].key
  })

  return {
    layer: createRule('relative', '0', '9', '+1'),
    startTime: createRule('relative', String(Math.round(safeCurrentTime)), String(Math.round(safeCurrentTime + 900)), '+100'),
    'content.size': createRule('range', '60', '60', '+2'),
    'transform.start.x': createRule('range', '0', '0', '+20'),
    'transform.start.y': createRule('range', '0', '0', '+10'),
    'transform.end.x': createRule('range', '0', '0', '+20'),
    'transform.end.y': createRule('range', '0', '0', '+10'),
    'transform.zRotate': createRule('range', '0', '0', '+15'),
    'transform.yRotate': createRule('range', '0', '0', '+15'),
    'opacity.from': createRule('range', '1', '1', '-0.05'),
    'opacity.to': createRule('range', '1', '1', '-0.05'),
    'animation.duration': createRule('range', '1000', '1000', '+100'),
    'animation.moveDuration': createRule('range', '500', '500', '+100'),
    'animation.delay': createRule('range', '0', '0', '+100')
  }
}

export function createDefaultColorRule(): ColorRuleState {
  return {
    mode: 'range',
    cycleList: '',
    start: '#FFFFFF',
    startText: '#FFFFFF',
    target: '#FFAA00',
    targetText: '#FFAA00',
    alpha: '0.1'
  }
}

export function createDefaultDirectRules(): ToolWriteRequest['directRules'] {
  return {
    text: { mode: 'assign', value: '欢迎使用高级创建工具', cycleList: '' },
    font: { mode: 'assign', value: 'Microsoft YaHei', cycleList: '' },
    stroke: { mode: 'assign', value: false, cycleList: '' },
    easing: { mode: 'assign', value: 'speedup', cycleList: '' }
  }
}

export function buildToolWriteRequestFromAgentRules(
  input: AgentCreationRequest,
  currentTime: number
): ToolWriteRequest {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_GENERATE_QUANTITY) {
    throw new Error(`quantity 必须是 1 到 ${MAX_GENERATE_QUANTITY} 之间的整数`)
  }

  const entries = Object.entries(input.rules) as Array<[string, AgentCreationRule | undefined]>
  if (entries.length === 0 || entries.some(([, rule]) => rule === undefined)) {
    throw new Error('rules 至少需要包含一个有效字段规则')
  }

  const request: ToolWriteRequest = {
    quantity: input.quantity,
    expressionEnabled: false,
    writeMode: 'replace',
    previewText: '[]',
    numericRules: createDefaultNumericRules(currentTime),
    colorRule: createDefaultColorRule(),
    directRules: createDefaultDirectRules()
  }

  for (const [rawPath, rawRule] of entries) {
    if (!CREATION_TOOL_FIELD_PATH_SET.has(rawPath as AllFieldPath)) {
      throw new Error(`不支持的 creationTools 字段：${rawPath}`)
    }
    if (!rawRule) throw new Error(`字段 ${rawPath} 缺少规则`)

    if (isNumericFieldPath(rawPath)) {
      const rule = rawRule as AgentNumericRule
      const target = request.numericRules[rawPath]
      target.mode = rule.mode
      if (rule.mode === 'range') {
        if (!Number.isFinite(rule.start) || !Number.isFinite(rule.end)) {
          throw new Error(`${rawPath} 的 start 和 end 必须是有限数字`)
        }
        target.start = String(rule.start)
        target.end = String(rule.end)
        if (rule.expression !== undefined) {
          target.expression = rule.expression
          request.expressionEnabled = true
        }
      } else if (rule.mode === 'relative') {
        if (!Number.isFinite(rule.start)) {
          throw new Error(`${rawPath} 的 start 必须是有限数字`)
        }
        target.start = String(rule.start)
        target.step = String(rule.step)
      } else {
        if (!Array.isArray(rule.values) || rule.values.length === 0) {
          throw new Error(`${rawPath} 的 cycle values 不能为空`)
        }
        const values = rule.values.map(String)
        target.cycleList = values.join(';\n')
        agentCycleValuesMap.set(target, values)
      }
      continue
    }

    if (rawPath === 'content.color') {
      const rule = rawRule as AgentColorRule
      request.colorRule.mode = rule.mode
      if (rule.mode === 'cycle') {
        if (!Array.isArray(rule.values) || rule.values.length === 0) {
          throw new Error('content.color 的 cycle values 不能为空')
        }
        const values = rule.values.map(String)
        request.colorRule.cycleList = values.join(';\n')
        agentCycleValuesMap.set(request.colorRule, values)
      } else {
        request.colorRule.start = rule.start
        request.colorRule.startText = rule.start
        request.colorRule.target = rule.target
        request.colorRule.targetText = rule.target
        if (rule.mode === 'relative') request.colorRule.alpha = String(rule.alpha)
      }
      continue
    }

    const rule = rawRule as AgentDirectRule
    const directPath = rawPath as DirectFieldPath
    const target = directPath === 'content.text'
      ? request.directRules.text
      : directPath === 'content.font'
        ? request.directRules.font
        : directPath === 'content.stroke'
          ? request.directRules.stroke
          : request.directRules.easing
    target.mode = rule.mode
    if (rule.mode === 'assign') {
      target.value = rule.value as never
    } else {
      if (!Array.isArray(rule.values) || rule.values.length === 0) {
        throw new Error(`${rawPath} 的 cycle values 不能为空`)
      }
      const values = rule.values.map(String)
      target.cycleList = values.join(';\n')
      agentCycleValuesMap.set(target, values)
    }
  }

  return request
}

export async function generateDanmakuDraftsFromAgentRules(
  input: AgentCreationRequest,
  currentTime: number,
  allowNegativeValues = false,
  options?: GenerateDanmakuOptions
): Promise<DanmakuDraft[]> {
  const request = buildToolWriteRequestFromAgentRules(input, currentTime)
  const drafts = await generateDanmakuDraftsFromRules(request, options)
  return drafts.map((draft) => normalizeGeneratedDraft(draft, allowNegativeValues))
}

const NUMERIC_FIELD_PATHS: NumericFieldPath[] = [
  'layer',
  'startTime',
  'content.size',
  'transform.start.x',
  'transform.start.y',
  'transform.end.x',
  'transform.end.y',
  'transform.zRotate',
  'transform.yRotate',
  'opacity.from',
  'opacity.to',
  'animation.duration',
  'animation.moveDuration',
  'animation.delay'
]

const COLOR_FIELD_PATHS: ColorFieldPath[] = [
  'content.color'
]

const DIRECT_FIELD_PATHS: DirectFieldPath[] = [
  'content.text',
  'content.font',
  'content.stroke',
  'animation.easing'
]

export const CREATION_TOOL_FIELD_PATHS: AllFieldPath[] = [
  ...NUMERIC_FIELD_PATHS,
  ...COLOR_FIELD_PATHS,
  ...DIRECT_FIELD_PATHS
]

const CREATION_TOOL_FIELD_PATH_SET = new Set<AllFieldPath>(CREATION_TOOL_FIELD_PATHS)

type RawMeasurementVariableName = 'rawWidth' | 'rawHeight'
type BoxMeasurementVariableName = 'boxWidth' | 'boxHeight'
type DependencyNode = AllFieldPath | MeasurementVariableName

const RAW_MEASUREMENT_VARIABLE_NAMES: RawMeasurementVariableName[] = [
  'rawWidth',
  'rawHeight'
]
const BOX_MEASUREMENT_VARIABLE_NAMES: BoxMeasurementVariableName[] = [
  'boxWidth',
  'boxHeight'
]
export const MEASUREMENT_VARIABLE_NAMES: MeasurementVariableName[] = [
  ...RAW_MEASUREMENT_VARIABLE_NAMES,
  ...BOX_MEASUREMENT_VARIABLE_NAMES
]

const RAW_MEASUREMENT_VARIABLE_SET = new Set<string>(RAW_MEASUREMENT_VARIABLE_NAMES)
const BOX_MEASUREMENT_VARIABLE_SET = new Set<string>(BOX_MEASUREMENT_VARIABLE_NAMES)
const MEASUREMENT_VARIABLE_SET = new Set<string>(MEASUREMENT_VARIABLE_NAMES)

const RAW_MEASUREMENT_DEPENDENCIES: AllFieldPath[] = [
  'content.text',
  'content.size',
  'content.font',
  'content.stroke'
]
const BOX_MEASUREMENT_DEPENDENCIES: AllFieldPath[] = [
  ...RAW_MEASUREMENT_DEPENDENCIES,
  'transform.zRotate'
]
const MEASURE_BATCH_SIZE = 500

type FieldSeriesMap = Partial<Record<AllFieldPath, unknown[]>>
type MeasurementSeriesMap = Partial<Record<MeasurementVariableName, number[]>>
type FieldResolveState = 'visiting' | 'resolved'

type TextTemplatePart =
  | { type: 'text'; value: string }
  | { type: 'expression'; source: string; compiled: any }

type TextTemplate = {
  parts: TextTemplatePart[]
}

export async function writeGeneratedDanmakusToPreview(
  request: ToolWriteRequest,
  options?: GenerateDanmakuOptions
): Promise<GeneratedPreviewResult> {
  const store = useEditorStore()
  const generatedDanmakus = (await generateDanmakuDraftsFromRules(request, options)).map((draft) => {
    return normalizeGeneratedDraft(draft, store.allowNegativeValues)
  })
  const nextDanmakus = request.writeMode === 'append'
    ? [...parsePreviewDanmakus(request.previewText), ...generatedDanmakus]
    : generatedDanmakus

  return {
    generatedDanmakus,
    nextDanmakus,
    previewText: JSON.stringify(nextDanmakus, null, 2)
  }
}

export async function generateDanmakuDraftsFromRules(
  request: ToolWriteRequest,
  options?: GenerateDanmakuOptions
): Promise<DanmakuDraft[]> {
  if (typeof request.quantity === 'number' && Number.isFinite(request.quantity) && request.quantity > MAX_GENERATE_QUANTITY) {
    throw new Error(`单次生成数量不能超过 ${MAX_GENERATE_QUANTITY} 条`)
  }
  const quantity = normalizeQuantity(request.quantity)
  const screenSize = resolveScreenDimensions()
  const fieldSeries = await buildFieldSeriesMap(request, quantity, screenSize, options)
  const numericSeries = fieldSeries as Record<NumericFieldPath, number[]>
  const colorSeries = fieldSeries['content.color'] as string[]
  const textSeries = fieldSeries['content.text'] as string[]
  const fontSeries = fieldSeries['content.font'] as string[]
  const strokeSeries = fieldSeries['content.stroke'] as boolean[]
  const easingSeries = fieldSeries['animation.easing'] as DanmakuItem['animation']['easing'][]

  const drafts: DanmakuDraft[] = []

  for (let index = 0; index < quantity; index++) {
    drafts.push({
      layer: numericSeries.layer[index],
      startTime: numericSeries.startTime[index],
      content: {
        text: textSeries[index],
        font: fontSeries[index],
        size: numericSeries['content.size'][index],
        color: colorSeries[index],
        stroke: strokeSeries[index]
      },
      transform: {
        start: {
          x: numericSeries['transform.start.x'][index],
          y: numericSeries['transform.start.y'][index]
        },
        end: {
          x: numericSeries['transform.end.x'][index],
          y: numericSeries['transform.end.y'][index]
        },
        zRotate: numericSeries['transform.zRotate'][index],
        yRotate: numericSeries['transform.yRotate'][index]
      },
      opacity: {
        from: numericSeries['opacity.from'][index],
        to: numericSeries['opacity.to'][index]
      },
      animation: {
        duration: numericSeries['animation.duration'][index],
        moveDuration: numericSeries['animation.moveDuration'][index],
        delay: numericSeries['animation.delay'][index],
        easing: easingSeries[index]
      }
    })
  }

  return drafts
}

export function parsePreviewDanmakus(text: string): DanmakuDraft[] {
  if (typeof text !== 'string') {
    throw new Error('预览内容必须是字符串')
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  if (Array.isArray(parsed) && parsed.length === 0) {
    return []
  }

  const drafts = extractDanmakuDrafts(parsed)
  if (drafts.length === 0) {
    throw new Error('未识别到可创建的弹幕数据')
  }

  return drafts
}

export function normalizeGeneratedDraft(draft: DanmakuDraft, allowNegativeValues: boolean = false): Omit<DanmakuItem, 'id'> {
  const normalizedColorValue = normalizeColor(String(draft.content?.color ?? '#FFFFFF')) || '#FFFFFF'
  const easingValue = normalizeEasingValue(draft.animation?.easing)
  const strokeValue = normalizeStrokeValue(draft.content?.stroke)

  return {
    layer: clampIntegerByRule(draft.layer, M7_RULES.layer),
    startTime: clampNonNegativeInteger(draft.startTime, allowNegativeValues),
    content: {
      text: String(draft.content?.text ?? ''),
      font: String(draft.content?.font ?? 'Microsoft YaHei'),
      size: clampIntegerByRule(draft.content?.size, M7_RULES.size),
      color: normalizedColorValue,
      stroke: strokeValue
    },
    transform: {
      start: {
        x: roundInteger(draft.transform?.start?.x, allowNegativeValues),
        y: roundInteger(draft.transform?.start?.y, allowNegativeValues)
      },
      end: {
        x: roundInteger(draft.transform?.end?.x, allowNegativeValues),
        y: roundInteger(draft.transform?.end?.y, allowNegativeValues)
      },
      zRotate: clampIntegerByRule(normalizeAngle(draft.transform?.zRotate), M7_RULES.rotate),
      yRotate: clampIntegerByRule(normalizeAngle(draft.transform?.yRotate), M7_RULES.rotate)
    },
    opacity: {
      from: clampOpacity(draft.opacity?.from),
      to: clampOpacity(draft.opacity?.to)
    },
    animation: {
      duration: clampIntegerByRule(draft.animation?.duration, M7_RULES.duration),
      moveDuration: clampNonNegativeInteger(draft.animation?.moveDuration, allowNegativeValues),
      delay: clampNonNegativeInteger(draft.animation?.delay, allowNegativeValues),
      easing: easingValue
    }
  }
}

function buildDependencyGraph(request: ToolWriteRequest): {
  dependencyMap: Map<DependencyNode, Set<DependencyNode>>
  usesBoxMeasurement: boolean
  zRotateDependsOnRaw: boolean
} {
  const dependencyMap = new Map<DependencyNode, Set<DependencyNode>>()
  let usesBoxMeasurement = false

  for (const path of CREATION_TOOL_FIELD_PATHS) {
    const deps = getNodeDependencies(path, request)
    dependencyMap.set(path, deps)
    for (const dep of deps) {
      if (isBoxMeasurementVariableName(dep)) {
        usesBoxMeasurement = true
      }
    }
  }

  for (const variable of MEASUREMENT_VARIABLE_NAMES) {
    dependencyMap.set(variable, getNodeDependencies(variable, request))
  }

  const visitStates = new Map<DependencyNode, FieldResolveState>()
  const stack: DependencyNode[] = []

  const validateNode = (node: DependencyNode) => {
    const state = visitStates.get(node)
    if (state === 'resolved') {
      return
    }
    if (state === 'visiting') {
      const cycleStart = stack.indexOf(node)
      const cycle = [...stack.slice(cycleStart), node].join(' -> ')
      throw new Error(`字段引用出现循环: ${cycle}`)
    }

    visitStates.set(node, 'visiting')
    stack.push(node)

    const deps = dependencyMap.get(node) || new Set<DependencyNode>()
    if (deps.has(node)) {
      throw new Error(`${node} 表达式不能引用自身`)
    }

    for (const dep of deps) {
      validateNode(dep)
    }

    stack.pop()
    visitStates.set(node, 'resolved')
  }

  for (const path of CREATION_TOOL_FIELD_PATHS) {
    validateNode(path)
  }

  const zRotateDependsOnRaw = canReachDependencyNode(
    'transform.zRotate',
    RAW_MEASUREMENT_VARIABLE_SET,
    dependencyMap
  )

  return {
    dependencyMap,
    usesBoxMeasurement,
    zRotateDependsOnRaw
  }
}

function canReachDependencyNode(
  start: DependencyNode,
  targets: Set<string>,
  dependencyMap: Map<DependencyNode, Set<DependencyNode>>
): boolean {
  const visited = new Set<DependencyNode>()
  const queue: DependencyNode[] = [start]

  while (queue.length > 0) {
    const current = queue.shift() as DependencyNode
    const deps = dependencyMap.get(current)
    if (!deps) continue
    for (const dep of deps) {
      if (targets.has(dep)) {
        return true
      }
      if (!visited.has(dep)) {
        visited.add(dep)
        queue.push(dep)
      }
    }
  }

  return false
}

async function buildFieldSeriesMap(
  request: ToolWriteRequest,
  quantity: number,
  screenSize: { width: number; height: number },
  options?: GenerateDanmakuOptions
): Promise<Record<AllFieldPath, unknown[]>> {
  const { dependencyMap, usesBoxMeasurement, zRotateDependsOnRaw } = buildDependencyGraph(request)
  const canCombineRawAndBox = usesBoxMeasurement && !zRotateDependsOnRaw
  const measureFn = options?.measureDanmakus ?? measureDanmakus

  const cache: FieldSeriesMap = {}
  const measurementCache: MeasurementSeriesMap = {}
  const states = new Map<DependencyNode, FieldResolveState>()
  const stack: DependencyNode[] = []

  const resolveMeasurement = async (includeZRotate: boolean) => {
    const measured = await measureDanmakuSeries(quantity, cache, includeZRotate, measureFn)
    if (!measurementCache.rawWidth) {
      measurementCache.rawWidth = measured.rawWidth
    }
    if (!measurementCache.rawHeight) {
      measurementCache.rawHeight = measured.rawHeight
    }
    states.set('rawWidth', 'resolved')
    states.set('rawHeight', 'resolved')

    if (includeZRotate) {
      measurementCache.boxWidth = measured.boxWidth
      measurementCache.boxHeight = measured.boxHeight
      states.set('boxWidth', 'resolved')
      states.set('boxHeight', 'resolved')
    }
  }

  const resolveNode = async (node: DependencyNode): Promise<void> => {
    if (states.get(node) === 'resolved') {
      return
    }

    if (states.get(node) === 'visiting') {
      const cycleStart = stack.indexOf(node)
      const cycle = [...stack.slice(cycleStart), node].join(' -> ')
      throw new Error(`字段引用出现循环: ${cycle}`)
    }

    states.set(node, 'visiting')
    stack.push(node)

    if (isMeasurementVariableName(node)) {
      const includeZRotate = isBoxMeasurementVariableName(node) || canCombineRawAndBox
      const requiredFields = includeZRotate ? BOX_MEASUREMENT_DEPENDENCIES : RAW_MEASUREMENT_DEPENDENCIES
      for (const field of requiredFields) {
        await resolveNode(field)
      }
      await resolveMeasurement(includeZRotate)
      stack.pop()
      return
    }

    const dependencies = dependencyMap.get(node) || new Set<DependencyNode>()
    for (const dependency of dependencies) {
      await resolveNode(dependency)
    }

    cache[node] = buildFieldSeries(node, request, quantity, cache, measurementCache, screenSize)
    stack.pop()
    states.set(node, 'resolved')
  }

  for (const path of CREATION_TOOL_FIELD_PATHS) {
    await resolveNode(path)
  }

  return cache as Record<AllFieldPath, unknown[]>
}

async function measureDanmakuSeries(
  quantity: number,
  fieldSeries: FieldSeriesMap,
  includeZRotate: boolean,
  measureFn: (danmakus: DanmakuItem[]) => Promise<ToolbarMeasure>
): Promise<{
  rawWidth: number[]
  rawHeight: number[]
  boxWidth: number[]
  boxHeight: number[]
}> {
  const textSeries = (fieldSeries['content.text'] as string[] | undefined) || []
  const fontSeries = (fieldSeries['content.font'] as string[] | undefined) || []
  const sizeSeries = (fieldSeries['content.size'] as number[] | undefined) || []
  const strokeSeries = (fieldSeries['content.stroke'] as boolean[] | undefined) || []
  const zRotateSeries = includeZRotate
    ? ((fieldSeries['transform.zRotate'] as number[] | undefined) || [])
    : []

  const uniqueRequestMap = new Map<string, string>()
  const uniqueItems: DanmakuItem[] = []
  const indexToRequestId: string[] = new Array(quantity)

  for (let index = 0; index < quantity; index++) {
    const text = String(textSeries[index] ?? '')
    const font = String(fontSeries[index] ?? 'Microsoft YaHei')
    const size = clampIntegerByRule(sizeSeries[index], M7_RULES.size)
    const stroke = normalizeStrokeValue(strokeSeries[index])
    const zRotate = includeZRotate
      ? clampIntegerByRule(normalizeAngle(zRotateSeries[index]), M7_RULES.rotate)
      : 0

    const key = JSON.stringify([text, font, size, stroke, zRotate])
    let requestId = uniqueRequestMap.get(key)
    if (!requestId) {
      requestId = `generator-measure-${uniqueItems.length}`
      uniqueRequestMap.set(key, requestId)
      uniqueItems.push({
        id: requestId,
        layer: 0,
        startTime: 0,
        content: {
          text,
          font,
          size,
          color: '#FFFFFF',
          stroke
        },
        transform: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          zRotate,
          yRotate: 0
        },
        opacity: { from: 1, to: 1 },
        animation: {
          duration: 1000,
          moveDuration: 1,
          delay: 0,
          easing: 'speedup'
        }
      })
    }
    indexToRequestId[index] = requestId
  }

  const measurements: ToolbarMeasure = {}
  for (let offset = 0; offset < uniqueItems.length; offset += MEASURE_BATCH_SIZE) {
    const batch = uniqueItems.slice(offset, offset + MEASURE_BATCH_SIZE)
    const batchResult = await measureFn(batch)
    for (const item of batch) {
      const entry = batchResult?.[item.id]
      if (
        !entry ||
        !Number.isFinite(entry.rawWidth) ||
        !Number.isFinite(entry.rawHeight) ||
        (includeZRotate && (!Number.isFinite(entry.width) || !Number.isFinite(entry.height)))
      ) {
        throw new Error('弹幕实际宽高测量结果缺失或无效')
      }
      measurements[item.id] = entry
    }
  }

  const rawWidth: number[] = new Array(quantity)
  const rawHeight: number[] = new Array(quantity)
  const boxWidth: number[] = new Array(quantity)
  const boxHeight: number[] = new Array(quantity)

  for (let index = 0; index < quantity; index++) {
    const entry = measurements[indexToRequestId[index]]
    rawWidth[index] = entry.rawWidth
    rawHeight[index] = entry.rawHeight
    boxWidth[index] = includeZRotate ? entry.width : entry.rawWidth
    boxHeight[index] = includeZRotate ? entry.height : entry.rawHeight
  }

  return { rawWidth, rawHeight, boxWidth, boxHeight }
}

function getNodeDependencies(node: DependencyNode, request: ToolWriteRequest): Set<DependencyNode> {
  if (isRawMeasurementVariableName(node)) {
    return new Set<DependencyNode>(RAW_MEASUREMENT_DEPENDENCIES)
  }

  if (isBoxMeasurementVariableName(node)) {
    return new Set<DependencyNode>(BOX_MEASUREMENT_DEPENDENCIES)
  }

  if (isNumericFieldPath(node)) {
    const rule = request.numericRules[node]
    if (request.expressionEnabled && rule.mode === 'range') {
      const expression = rule.expression?.trim() || RANGE_EXPRESSION_PRESETS[0].expression
      return extractExpressionDependencies(expression, `${node} `)
    }
    if (rule.mode === 'cycle') {
      return getNumericCycleDependencies(rule, node)
    }
  }

  if (node === 'content.text') {
    const dependencies = getTextRuleDependencies(request.directRules.text)
    const forbiddenMeasurements = Array.from(dependencies).filter(isMeasurementVariableName)
    if (forbiddenMeasurements.length > 0) {
      throw new Error(`content.text 表达式不能引用宽高变量: ${forbiddenMeasurements.join(', ')}`)
    }
    return dependencies
  }

  return new Set()
}

function buildFieldSeries(
  path: AllFieldPath,
  request: ToolWriteRequest,
  quantity: number,
  fieldSeries: FieldSeriesMap,
  measurementSeries: MeasurementSeriesMap,
  screenSize: { width: number; height: number }
): unknown[] {
  if (isNumericFieldPath(path)) {
    return buildNumericSeries(
      path,
      request.numericRules[path],
      quantity,
      request.expressionEnabled,
      fieldSeries,
      measurementSeries,
      screenSize
    )
  }

  if (path === 'content.color') {
    return buildColorSeries(request.colorRule, quantity)
  }

  if (path === 'content.text') {
    return buildTextFieldSeries(request.directRules.text, quantity, fieldSeries, screenSize)
  }

  if (path === 'content.font') {
    return buildDirectFieldSeries<string>('content.font', request.directRules.font, quantity)
  }

  if (path === 'content.stroke') {
    return buildDirectFieldSeries<boolean>('content.stroke', request.directRules.stroke, quantity)
  }

  return buildDirectFieldSeries<DanmakuItem['animation']['easing']>('animation.easing', request.directRules.easing, quantity)
}

function buildNumericSeries(
  path: NumericFieldPath,
  rule: NumericRuleState,
  quantity: number,
  expressionEnabled: boolean,
  fieldSeries: FieldSeriesMap,
  measurementSeries: MeasurementSeriesMap,
  screenSize: { width: number; height: number }
): number[] {
  if (rule.mode === 'cycle') {
    return buildCycleNumericSeries(path, rule, quantity, fieldSeries, measurementSeries, screenSize)
  }

  const startValue = parseRequiredNumber(rule.start, `${path} 起始值`)

  if (rule.mode === 'range') {
    if (expressionEnabled) {
      const endValue = quantity <= 1 && !rule.end.trim()
        ? startValue
        : parseRequiredNumber(rule.end, `${path} 结束值`)
      const expression = rule.expression?.trim() || RANGE_EXPRESSION_PRESETS[0].expression
      return evaluateRangeExpressionInternal({
        expression,
        startVal: startValue,
        endVal: endValue,
        quantity,
        fieldSeries,
        measurementSeries
      }, screenSize)
    }

    if (quantity <= 1) {
      return [startValue]
    }

    const endValue = parseRequiredNumber(rule.end, `${path} 结束值`)
    const diff = endValue - startValue
    return Array.from({ length: quantity }, (_, index) => {
      const t = index / (quantity - 1)
      const val = Number.isFinite(diff) ? startValue + diff * t : startValue * (1 - t) + endValue * t
      if (!Number.isFinite(val)) {
        throw new Error(`${path} 范围插值结果超出有效数字范围`)
      }
      return val
    })
  }

  if (quantity <= 1) {
    return [startValue]
  }

  if (isOpacityPath(path)) {
    const operation = parseOpacityOperation(rule.step, path)
    const values = [startValue]

    while (values.length < quantity) {
      const nextValue = applyOpacityOperation(values[values.length - 1], operation)
      if (!Number.isFinite(nextValue)) {
        throw new Error(`${path} 计算结果超出有效数字范围`)
      }
      values.push(nextValue)
    }

    return values
  }

  const operation = parseInput(rule.step, false)
  if (operation.error) {
    throw new Error(`${path} 相对值无效: ${operation.error}`)
  }

  if (operation.mode === 'multiple') {
    throw new Error(`${path} 相对值不能为空`)
  }

  const values = [startValue]
  while (values.length < quantity) {
    const prevValue = values[values.length - 1]
    const nextValue = applyOperation(prevValue, operation)
    if (!Number.isFinite(nextValue)) {
      throw new Error(`${path} 计算结果超出有效数字范围`)
    }
    values.push(nextValue)
  }

  return values
}

function buildColorSeries(rule: ColorRuleState, quantity: number): string[] {
  if (rule.mode === 'cycle') {
    return buildCycleColorSeries(rule, quantity)
  }

  const startColor = normalizeColor(rule.startText || rule.start)
  const targetColor = normalizeColor(rule.targetText || rule.target)

  if (!startColor) {
    throw new Error('颜色起始值无效')
  }

  if (!targetColor) {
    throw new Error('颜色目标值无效')
  }

  if (quantity <= 1) {
    return [startColor]
  }

  if (rule.mode === 'range') {
    return Array.from({ length: quantity }, (_, index) => {
      const alpha = index / (quantity - 1)
      return blendWithAlpha(startColor, targetColor, alpha)
    })
  }

  const alphaStep = parseRelativeColorStep(rule.alpha)
  return Array.from({ length: quantity }, (_, index) => {
    const alpha = Math.min(1, alphaStep * index)
    return blendWithAlpha(startColor, targetColor, alpha)
  })
}

function blendWithAlpha(baseColor: string, overlayColor: string, alpha: number): string {
  const roundedAlpha = Number(validateRange(alpha, 0, 1).toFixed(6))
  const parsed = parseColorWithAlpha(`${overlayColor}@${roundedAlpha}`)
  if (!parsed) {
    throw new Error('颜色 Alpha 混合参数无效')
  }

  return blendColor(baseColor, parsed.color, parsed.alpha)
}

function parseRelativeColorStep(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) {
    return 0
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('颜色 Alpha 混合每次偏移值必须是 0 到 1 之间的数字')
  }

  return validateRange(parsed, 0, 1)
}

function buildCycleNumericSeries(
  path: NumericFieldPath,
  rule: NumericRuleState,
  quantity: number,
  fieldSeries: FieldSeriesMap,
  measurementSeries: MeasurementSeriesMap,
  screenSize: { width: number; height: number }
): number[] {
  const entries = getRuleCycleEntries(rule)
  if (entries.length === 0) {
    throw new Error(`${path} 循环列表不能为空`)
  }

  const compiledEntries = entries.map((rawValue, entryIndex) => {
    try {
      return compileMathExpression(rawValue, `${path} 循环值 ${entryIndex + 1} `)
    } catch (error) {
      throw new Error(`${path} 循环值 ${entryIndex + 1} 表达式解析失败: ${getErrorMessage(error)}`)
    }
  })

  return Array.from({ length: quantity }, (_, index) => {
    const compiled = compiledEntries[index % compiledEntries.length]
    const result = evaluateCompiledExpression(compiled, {
      index,
      quantity,
      startVal: 0,
      endVal: 0,
      fieldSeries,
      measurementSeries,
      screenSize,
      label: `${path} 循环值`
    })

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`${path} 循环值计算结果不合法 (NaN/Infinite)`)
    }

    return result
  })
}

function getNumericCycleDependencies(rule: NumericRuleState, path: NumericFieldPath): Set<DependencyNode> {
  const entries = getRuleCycleEntries(rule)
  const dependencies = new Set<DependencyNode>()

  for (const [index, entry] of entries.entries()) {
    mergeDependencies(dependencies, extractExpressionDependencies(entry, `${path} 循环值 ${index + 1} `))
  }

  return dependencies
}

function buildCycleColorSeries(rule: ColorRuleState, quantity: number): string[] {
  const entries = getRuleCycleEntries(rule)
  if (entries.length === 0) {
    throw new Error('颜色循环列表不能为空')
  }

  return Array.from({ length: quantity }, (_, index) => {
    const rawValue = entries[index % entries.length]
    const normalized = normalizeColor(rawValue.trim())
    if (!normalized) {
      throw new Error(`颜色循环值无效: ${rawValue}`)
    }
    return normalized
  })
}

function getTextRuleDependencies(rule: DirectRuleState<string>): Set<DependencyNode> {
  const dependencies = new Set<DependencyNode>()

  if (rule.mode === 'assign') {
    mergeDependencies(dependencies, collectTextTemplateDependencies(rule.value, 'content.text '))
    return dependencies
  }

  const entries = getRuleCycleEntries(rule)
  for (const [entryIndex, rawValue] of entries.entries()) {
    mergeDependencies(dependencies, collectTextTemplateDependencies(rawValue, `content.text 循环值 ${entryIndex + 1} `))
  }

  return dependencies
}

function collectTextTemplateDependencies(rawValue: string, label: string): Set<DependencyNode> {
  const expressions = scanTextTemplateExpressions(rawValue)
  const dependencies = new Set<DependencyNode>()

  if (!expressions) {
    return dependencies
  }

  for (const expression of expressions) {
    mergeDependencies(dependencies, extractExpressionDependencies(expression.source, label))
  }

  return dependencies
}

function buildTextFieldSeries(
  rule: DirectRuleState<string>,
  quantity: number,
  fieldSeries: FieldSeriesMap,
  screenSize: { width: number; height: number }
): string[] {
  if (rule.mode === 'assign') {
    const template = compileTextTemplate(rule.value, 'content.text ')
    if (!template) {
      return Array.from({ length: quantity }, () => rule.value)
    }

    return Array.from({ length: quantity }, (_, index) => {
      return renderTextTemplate(template, {
        index,
        quantity,
        startVal: 0,
        endVal: 0,
        fieldSeries,
        screenSize,
        label: 'content.text '
      })
    })
  }

  const entries = getRuleCycleEntries(rule)
  if (entries.length === 0) {
    throw new Error('content.text 循环列表不能为空')
  }

  const compiledEntries = entries.map((rawValue, entryIndex) => {
    return {
      rawValue,
      template: compileTextTemplate(rawValue, `content.text 循环值 ${entryIndex + 1} `)
    }
  })

  return Array.from({ length: quantity }, (_, index) => {
    const entry = compiledEntries[index % compiledEntries.length]
    if (!entry.template) {
      return entry.rawValue
    }

    return renderTextTemplate(entry.template, {
      index,
      quantity,
      startVal: 0,
      endVal: 0,
      fieldSeries,
      screenSize,
      label: 'content.text '
    })
  })
}

function buildDirectFieldSeries<T>(
  path: DirectFieldPath,
  rule: DirectRuleState<T>,
  quantity: number
): T[] {
  if (rule.mode === 'assign') {
    return Array.from({ length: quantity }, () => rule.value)
  }

  const entries = getRuleCycleEntries(rule)
  if (entries.length === 0) {
    throw new Error(`${path} 循环列表不能为空`)
  }

  return Array.from({ length: quantity }, (_, index) => {
    const rawValue = entries[index % entries.length]
    return parseDirectCycleValue(path, rawValue)
  })
}

function parseDirectCycleValue(path: DirectFieldPath, rawValue: string): any {
  if (path === 'content.text' || path === 'content.font') {
    return rawValue
  }

  if (path === 'content.stroke') {
    return parseBooleanLike(rawValue, '描边循环值')
  }

  if (path === 'animation.easing') {
    return parseEasingLike(rawValue)
  }

  return rawValue
}

function scanTextTemplateExpressions(rawValue: string): Array<{ start: number; end: number; source: string }> | null {
  if (typeof rawValue !== 'string' || !rawValue.startsWith('`') || !rawValue.endsWith('`') || rawValue.length < 2) {
    return null
  }

  const inner = rawValue.slice(1, -1)
  const expressions: Array<{ start: number; end: number; source: string }> = []
  let cursor = 0

  while (cursor < inner.length) {
    const start = inner.indexOf('${', cursor)
    if (start === -1) {
      break
    }

    let depth = 1
    let pos = start + 2
    let quote: '"' | "'" | null = null
    let escaping = false
    while (pos < inner.length && depth > 0) {
      const ch = inner[pos]
      if (escaping) {
        escaping = false
      } else if (quote) {
        if (ch === '\\') escaping = true
        else if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
      pos++
    }

    if (depth !== 0) {
      cursor = start + 2
      continue
    }

    expressions.push({
      start,
      end: pos,
      source: inner.slice(start + 2, pos)
    })
    cursor = pos + 1
  }

  return expressions.length > 0 ? expressions : null
}

function compileTextTemplate(rawValue: string, label: string): TextTemplate | null {
  const expressions = scanTextTemplateExpressions(rawValue)
  if (!expressions) {
    return null
  }

  const inner = rawValue.slice(1, -1)
  const parts: TextTemplatePart[] = []
  let cursor = 0

  for (const expression of expressions) {
    if (expression.start > cursor) {
      parts.push({
        type: 'text',
        value: inner.slice(cursor, expression.start)
      })
    }

    parts.push({
      type: 'expression',
      source: expression.source,
      compiled: compileMathExpression(expression.source, label)
    })
    cursor = expression.end + 1
  }

  if (cursor < inner.length) {
    parts.push({
      type: 'text',
      value: inner.slice(cursor)
    })
  }

  return { parts }
}

function renderTextTemplate(
  template: TextTemplate,
  params: {
    index: number
    quantity: number
    startVal: number
    endVal: number
    fieldSeries: FieldSeriesMap
    screenSize?: { width: number; height: number }
    label: string
  }
): string {
  return template.parts.map((part) => {
    if (part.type === 'text') {
      return part.value
    }

    const result = evaluateCompiledExpression(part.compiled, params)
    if (typeof result === 'function') {
      throw new Error(`${params.label}模板表达式不能返回函数`)
    }
    return String(result ?? '')
  }).join('')
}

function compileMathExpression(expression: string, label: string): { evaluate: (scope: Record<string, any>) => unknown } {
  try {
    return parseMathExpression(expression).compile()
  } catch (error) {
    throw new Error(`${label}表达式解析失败: ${getErrorMessage(error)}`)
  }
}

function resolveStaticMemberPath(node: any): string | null {
  if (!node || typeof node !== 'object') {
    return null
  }
  if (node.isSymbolNode && typeof node.name === 'string') {
    return node.name
  }
  if (
    node.isAccessorNode &&
    node.index?.isIndexNode &&
    Array.isArray(node.index.dimensions) &&
    node.index.dimensions.length === 1
  ) {
    const dim = node.index.dimensions[0]
    if (dim?.isConstantNode && typeof dim.value === 'string') {
      const parent = resolveStaticMemberPath(node.object)
      return parent ? `${parent}.${dim.value}` : null
    }
  }
  return null
}

function extractExpressionDependencies(expression: string, label: string): Set<DependencyNode> {
  try {
    const node = parseMathExpression(expression) as any
    const dependencies = new Set<DependencyNode>()

    node.traverse((childNode: any) => {
      if (childNode?.isSymbolNode && isMeasurementVariableName(childNode.name)) {
        dependencies.add(childNode.name)
        return
      }
      const memberPath = resolveStaticMemberPath(childNode)
      if (memberPath && isAllFieldPath(memberPath)) {
        dependencies.add(memberPath)
      }
    })

    return dependencies
  } catch (error) {
    throw new Error(`${label}表达式解析失败: ${getErrorMessage(error)}`)
  }
}

function resolveScreenDimensions(): { width: number; height: number } {
  try {
    const store = useEditorStore()
    return {
      width: Number.isFinite(store.screenWidth) && store.screenWidth > 0 ? store.screenWidth : 800,
      height: Number.isFinite(store.screenHeight) && store.screenHeight > 0 ? store.screenHeight : 450
    }
  } catch {
    return { width: 800, height: 450 }
  }
}

function evaluateCompiledExpression(
  compiledExpression: any,
  params: {
    index: number
    quantity: number
    startVal: number
    endVal: number
    fieldSeries?: FieldSeriesMap
    measurementSeries?: MeasurementSeriesMap
    screenSize?: { width: number; height: number }
    label?: string
  }
): unknown {
  try {
    const scope = createExpressionScope(params)
    if (compiledExpression && typeof compiledExpression.evaluate === 'function') {
      return compiledExpression.evaluate(scope)
    }
    return evaluateMathExpressionValue(String(compiledExpression), scope)
  } catch (error) {
    if (params.label !== undefined) {
      throw new Error(`${params.label}表达式解析失败: ${getErrorMessage(error)}`)
    }
    throw error
  }
}

function createExpressionScope(params: {
  index: number
  quantity: number
  startVal: number
  endVal: number
  fieldSeries?: FieldSeriesMap
  measurementSeries?: MeasurementSeriesMap
  screenSize?: { width: number; height: number }
}) {
  const screenSize = params.screenSize ?? resolveScreenDimensions()
  const t = params.quantity <= 1 ? 0 : params.index / (params.quantity - 1)
  const scope: Record<string, any> = {
    S: params.startVal,
    E: params.endVal,
    i: params.index,
    n: params.quantity,
    t,
    bezier: evaluateBezier,
    seededRandom: (seed: number, index: number = params.index) => evaluateSeededRandom(seed, index),
    width: screenSize.width,
    height: screenSize.height
  }

  for (const [path, series] of Object.entries(params.fieldSeries || {}) as Array<[AllFieldPath, unknown[]]>) {
    assignScopePath(scope, path, series[params.index])
  }

  for (const [name, series] of Object.entries(params.measurementSeries || {}) as Array<[MeasurementVariableName, number[]]>) {
    if (Array.isArray(series)) {
      scope[name] = series[params.index]
    }
  }

  return scope
}

function assignScopePath(scope: Record<string, any>, path: AllFieldPath, value: unknown) {
  const segments = path.split('.')
  let target = scope

  while (segments.length > 1) {
    const segment = segments.shift() as string
    if (!isRecord(target[segment])) {
      target[segment] = {}
    }
    target = target[segment]
  }

  target[segments[0]] = value
}

function evaluateBezier(x1: number, y1: number, x2: number, y2: number, t: number) {
  if (
    typeof x1 !== 'number' || !Number.isFinite(x1) ||
    typeof y1 !== 'number' || !Number.isFinite(y1) ||
    typeof x2 !== 'number' || !Number.isFinite(x2) ||
    typeof y2 !== 'number' || !Number.isFinite(y2) ||
    typeof t !== 'number' || !Number.isFinite(t)
  ) {
    throw new Error('bezier 参数必须是有限数字')
  }
  const solver = createCubicBezierSolver(x1, y1, x2, y2)
  return solver(t)
}

function mergeDependencies(target: Set<DependencyNode>, source: Set<DependencyNode>) {
  for (const dependency of source) {
    target.add(dependency)
  }
}

function isNumericFieldPath(path: string): path is NumericFieldPath {
  return (NUMERIC_FIELD_PATHS as string[]).includes(path)
}

function isAllFieldPath(path: string): path is AllFieldPath {
  return CREATION_TOOL_FIELD_PATH_SET.has(path as AllFieldPath)
}

function isRawMeasurementVariableName(name: string): name is RawMeasurementVariableName {
  return RAW_MEASUREMENT_VARIABLE_SET.has(name)
}

function isBoxMeasurementVariableName(name: string): name is BoxMeasurementVariableName {
  return BOX_MEASUREMENT_VARIABLE_SET.has(name)
}

function isMeasurementVariableName(name: string): name is MeasurementVariableName {
  return MEASUREMENT_VARIABLE_SET.has(name)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

function parseStrictList(rawText: string): string[] {
  if (typeof rawText !== 'string' || !rawText) {
    return []
  }

  const strictRegex = /;\r?\n|;$/
  const list = rawText.split(strictRegex)

  if (rawText.endsWith(';') && list[list.length - 1] === '') {
    list.pop()
  }

  return list
}

function parseRequiredNumber(input: string, label: string): number {
  const parsed = Number(input.trim())
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}必须是数字`)
  }

  return parsed
}

function extractDanmakuDrafts(input: unknown): DanmakuDraft[] {
  if (Array.isArray(input)) {
    return input.filter(isDanmakuDraftLike) as DanmakuDraft[]
  }

  if (!isRecord(input)) {
    return []
  }

  if (Array.isArray(input.danmakus)) {
    return input.danmakus.filter(isDanmakuDraftLike) as DanmakuDraft[]
  }

  return isDanmakuDraftLike(input) ? [input as DanmakuDraft] : []
}

function isDanmakuDraftLike(value: unknown): value is DanmakuDraft {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.startTime !== undefined &&
    isRecord(value.content) &&
    isRecord(value.transform) &&
    isRecord(value.transform.start) &&
    isRecord(value.transform.end) &&
    isRecord(value.opacity) &&
    isRecord(value.animation)
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return 1
  }

  return Math.max(1, Math.min(MAX_GENERATE_QUANTITY, Math.round(quantity)))
}

function isOpacityPath(path: NumericFieldPath): path is 'opacity.from' | 'opacity.to' {
  return path === 'opacity.from' || path === 'opacity.to'
}

function parseOpacityOperation(input: string, path: NumericFieldPath) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) {
    throw new Error(`${path} 相对值不能为空`)
  }

  const compact = trimmed.replace(/\s+/g, '')
  if (/^[+\-*/]/.test(compact)) {
    const operator = compact[0]
    const rawValue = operator === '-' ? compact : compact.slice(1)
    const parsedValue = Number(rawValue)

    if (!Number.isFinite(parsedValue)) {
      throw new Error(`${path} 相对值无效: 无效的透明度数值`)
    }

    if (operator === '+') return { mode: 'add' as const, value: parsedValue }
    if (operator === '-') return { mode: 'add' as const, value: parsedValue }
    if (operator === '*') {
      if (parsedValue <= 0) {
        throw new Error(`${path} 相对值无效: 倍率必须是正数`)
      }
      return { mode: 'mul' as const, value: parsedValue }
    }
    if (operator === '/') {
      if (parsedValue <= 0) {
        throw new Error(`${path} 相对值无效: 除数必须是正数`)
      }
      return { mode: 'div' as const, value: parsedValue }
    }
  }

  const parsedValue = Number(compact)
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${path} 相对值无效: 无效的透明度数值`)
  }

  return { mode: 'set' as const, value: parsedValue }
}

function applyOpacityOperation(
  originalValue: number,
  operation: {
    mode: 'set' | 'add' | 'mul' | 'div'
    value: number
  }
): number {
  let result: number
  switch (operation.mode) {
    case 'set':
      result = operation.value
      break
    case 'add':
      result = originalValue + operation.value
      break
    case 'mul':
      result = originalValue * operation.value
      break
    case 'div':
      result = originalValue / operation.value
      break
  }
  return Number.isFinite(result) ? result : originalValue
}

function roundInteger(value: unknown, allowNegative: boolean = false): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(allowNegative ? parsed : Math.max(0, parsed)) : (allowNegative ? 0 : 0)
}

function clampNonNegativeInteger(value: unknown, allowNegative: boolean = false): number {
  if (allowNegative) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed) : 0
  }
  return Math.max(0, roundInteger(value, false))
}

function clampIntegerByRule(
  value: unknown,
  rule: {
    min: number
    max: number
  }
): number {
  const parsed = Number(value)
  const rounded = Number.isFinite(parsed) ? Math.round(parsed) : rule.min
  return Math.round(validateRange(rounded, rule.min, rule.max))
}

function clampOpacity(value: unknown): number {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) ? validateRange(parsed, 0, 1) : 1
  return Number(normalized.toFixed(2))
}

function normalizeStrokeValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return parseBooleanLike(value, '描边值')
  }

  return Boolean(value)
}

function normalizeEasingValue(value: unknown): DanmakuItem['animation']['easing'] {
  if (value === 'speeddown') {
    return 'speeddown'
  }

  return 'speedup'
}

function parseBooleanLike(value: string, label: string): boolean {
  const normalized = value.trim().toLowerCase()

  if (['true', '1', 'yes', 'on', '是'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'off', '否'].includes(normalized)) {
    return false
  }

  throw new Error(`${label}无效: ${value}`)
}

function parseEasingLike(value: string): DanmakuItem['animation']['easing'] {
  const normalized = value.trim()
  if (normalized === 'speedup' || normalized === 'speeddown') {
    return normalized
  }

  throw new Error(`缓动循环值无效: ${value}`)
}

// 标准三阶贝塞尔曲线缓动求解器 (Cubic Bezier Easing Solver)
export function createCubicBezierSolver(x1: number, y1: number, x2: number, y2: number) {
  const safeX1 = Number.isFinite(x1) ? validateRange(x1, 0, 1) : 0
  const safeY1 = Number.isFinite(y1) ? y1 : 0
  const safeX2 = Number.isFinite(x2) ? validateRange(x2, 0, 1) : 1
  const safeY2 = Number.isFinite(y2) ? y2 : 1

  // 贝塞尔曲线公式系数
  const ax = 3 * safeX1 - 3 * safeX2 + 1;
  const bx = 3 * safeX2 - 6 * safeX1;
  const cx = 3 * safeX1;

  const ay = 3 * safeY1 - 3 * safeY2 + 1;
  const by = 3 * safeY2 - 6 * safeY1;
  const cy = 3 * safeY1;

  function sampleCurveX(t: number) { return ((ax * t + bx) * t + cx) * t; }
  function sampleCurveY(t: number) { return ((ay * t + by) * t + cy) * t; }
  function sampleCurveDerivativeX(t: number) { return (3 * ax * t + 2 * bx) * t + cx; }

  // 给定 x 轴进度，求解曲线内部的参数 t_param
  return function solve(x: number): number {
    if (typeof x !== 'number' || !Number.isFinite(x)) return 0;
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // 1. 先用牛顿迭代法快速求解（通常 4-8 次即可精准收敛）
    let tParam = x;
    for (let i = 0; i < 8; i++) {
      const xSample = sampleCurveX(tParam) - x;
      if (Math.abs(xSample) < 1e-6) return sampleCurveY(tParam);
      const dX = sampleCurveDerivativeX(tParam);
      if (Math.abs(dX) < 1e-6) break;
      const nextT = tParam - xSample / dX;
      if (!Number.isFinite(nextT) || nextT < 0 || nextT > 1) break;
      tParam = nextT;
    }

    // 2. 如果牛顿法失效（导数趋近于0），退化到二分法兜底（限制最大迭代次数防止浮点停滞死循环）
    let lower = 0;
    let upper = 1;
    tParam = x;

    for (let i = 0; i < 64 && lower < upper; i++) {
      const xSample = sampleCurveX(tParam);
      if (Math.abs(xSample - x) < 1e-6) return sampleCurveY(tParam);
      if (x > xSample) lower = tParam;
      else upper = tParam;
      const mid = (upper + lower) / 2;
      if (mid === tParam) break;
      tParam = mid;
    }

    return sampleCurveY(tParam);
  };
}

/**
 * 范围模式下，根据数学表达式批量计算数值序列
 */
export function evaluateRangeExpression(params: RangeEvaluationParams): number[] {
  return evaluateRangeExpressionInternal(params, resolveScreenDimensions());
}

function evaluateRangeExpressionInternal(
  params: RangeEvaluationParams,
  screenSize: { width: number; height: number }
): number[] {
  const { expression, startVal, endVal, quantity, fieldSeries, measurementSeries } = params;
  const results: number[] = [];

  if (quantity <= 0) return [];

  try {
    const compiledExpr = compileMathExpression(expression, '表达式')

    // 循环为每条弹幕求值
    for (let i = 0; i < quantity; i++) {
      // 求值
      const evalResult = evaluateCompiledExpression(compiledExpr, {
        index: i,
        quantity,
        startVal,
        endVal,
        fieldSeries,
        measurementSeries,
        screenSize
      });
      
      if (typeof evalResult !== 'number' || Number.isNaN(evalResult) || !Number.isFinite(evalResult)) {
        throw new Error(`第 ${i} 条弹幕计算结果不合法 (NaN/Infinite)`);
      }

      results.push(evalResult);
    }

    return results;
  } catch (error: any) {
    // 向上游抛出 math.js 的语法或解析错误，方便 UI 拦截并用红字显示
    throw new Error(`表达式解析失败: ${error.message}`);
  }
}
