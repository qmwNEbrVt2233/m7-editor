import type { DanmakuItem } from '@/core/danmaku'
import { applyOperation, blendColor, parseColorWithAlpha, parseInput } from '@/utils/parser'
import { M7_RULES, normalizeColor, validateRange } from '@/utils/validation'
import { compileDependencies, create } from 'mathjs/number'

const math = create(compileDependencies)

math.import({
  add: (a: number, b: number) => a + b,
  subtract: (a: number, b: number) => a - b,
  multiply: (a: number, b: number) => a * b,
  divide: (a: number, b: number) => a / b,
  pow: (a: number, b: number) => a ** b,
  unaryMinus: (value: number) => -value,
  unaryPlus: (value: number) => +value,
  random: Math.random,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  log: Math.log,
  exp: Math.exp,
  pi: Math.PI,
  e: Math.E
}, {
  override: true,
  silent: true
})

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
    label: '标准 Ease In Out',
    expression: 'S + (E - S) * bezier(0.42, 0, 0.58, 1, t)'
  },
  {
    key: 'easeIn',
    label: 'Ease In',
    expression: 'S + (E - S) * bezier(0.42, 0, 1, 1, t)'
  },
  {
    key: 'easeOut',
    label: 'Ease Out',
    expression: 'S + (E - S) * bezier(0, 0, 0.58, 1, t)'
  },
  {
    key: 'overshoot',
    label: '轻微回弹',
    expression: 'S + (E - S) * (t + 0.18 * sin(pi * t) * (1 - t))'
  },
  {
    key: 'random',
    label: '随机',
    expression: 'S + (E - S) * random()'
  }
  
]

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

export function writeGeneratedDanmakusToPreview(request: ToolWriteRequest): GeneratedPreviewResult {
  const generatedDanmakus = generateDanmakuDraftsFromRules(request).map((draft) => {
    return normalizeGeneratedDraft(draft)
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

export function generateDanmakuDraftsFromRules(request: ToolWriteRequest): DanmakuDraft[] {
  const quantity = normalizeQuantity(request.quantity)
  const numericSeries = buildNumericSeriesMap(
    request.numericRules,
    quantity,
    request.expressionEnabled
  )
  const colorSeries = buildColorSeries(request.colorRule, quantity)
  const textSeries = buildDirectFieldSeries<string>('content.text', request.directRules.text, quantity)
  const fontSeries = buildDirectFieldSeries<string>('content.font', request.directRules.font, quantity)
  const strokeSeries = buildDirectFieldSeries<boolean>('content.stroke', request.directRules.stroke, quantity)
  const easingSeries = buildDirectFieldSeries<DanmakuItem['animation']['easing']>('animation.easing', request.directRules.easing, quantity)

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

  const drafts = extractDanmakuDrafts(parsed)
  if (drafts.length === 0) {
    throw new Error('未识别到可创建的弹幕数据')
  }

  return drafts
}

export function normalizeGeneratedDraft(draft: DanmakuDraft): Omit<DanmakuItem, 'id'> {
  const normalizedColorValue = normalizeColor(String(draft.content?.color ?? '#FFFFFF')) || '#FFFFFF'
  const easingValue = normalizeEasingValue(draft.animation?.easing)
  const strokeValue = normalizeStrokeValue(draft.content?.stroke)

  return {
    layer: clampIntegerByRule(draft.layer, M7_RULES.layer),
    startTime: clampNonNegativeInteger(draft.startTime),
    content: {
      text: String(draft.content?.text ?? ''),
      font: String(draft.content?.font ?? 'Microsoft YaHei'),
      size: clampIntegerByRule(draft.content?.size, M7_RULES.size),
      color: normalizedColorValue,
      stroke: strokeValue
    },
    transform: {
      start: {
        x: roundInteger(draft.transform?.start?.x),
        y: roundInteger(draft.transform?.start?.y)
      },
      end: {
        x: roundInteger(draft.transform?.end?.x),
        y: roundInteger(draft.transform?.end?.y)
      },
      zRotate: clampIntegerByRule(draft.transform?.zRotate, M7_RULES.rotate),
      yRotate: clampIntegerByRule(draft.transform?.yRotate, M7_RULES.rotate)
    },
    opacity: {
      from: clampOpacity(draft.opacity?.from),
      to: clampOpacity(draft.opacity?.to)
    },
    animation: {
      duration: clampIntegerByRule(draft.animation?.duration, M7_RULES.duration),
      moveDuration: clampNonNegativeInteger(draft.animation?.moveDuration),
      delay: clampNonNegativeInteger(draft.animation?.delay),
      easing: easingValue
    }
  }
}

function buildNumericSeriesMap(
  numericRules: Record<NumericFieldPath, NumericRuleState>,
  quantity: number,
  expressionEnabled: boolean
): Record<NumericFieldPath, number[]> {
  const result = {} as Record<NumericFieldPath, number[]>

  for (const path of NUMERIC_FIELD_PATHS) {
    result[path] = buildNumericSeries(path, numericRules[path], quantity, expressionEnabled)
  }

  return result
}

function buildNumericSeries(
  path: NumericFieldPath,
  rule: NumericRuleState,
  quantity: number,
  expressionEnabled: boolean
): number[] {
  if (rule.mode === 'cycle') {
    return buildCycleNumericSeries(path, rule.cycleList, quantity)
  }

  const startValue = parseRequiredNumber(rule.start, `${path} 起始值`)

  if (quantity <= 1) {
    return [startValue]
  }

  if (rule.mode === 'range') {
    const endValue = parseRequiredNumber(rule.end, `${path} 结束值`)
    if (expressionEnabled) {
      const expression = rule.expression?.trim() || RANGE_EXPRESSION_PRESETS[0].expression
      return evaluateRangeExpression({
        expression,
        startVal: startValue,
        endVal: endValue,
        quantity
      })
    }

    const step = (endValue - startValue) / (quantity - 1)
    return Array.from({ length: quantity }, (_, index) => startValue + (step * index))
  }

  if (isOpacityPath(path)) {
    const operation = parseOpacityOperation(rule.step, path)
    const values = [startValue]

    while (values.length < quantity) {
      const nextValue = applyOpacityOperation(values[values.length - 1], operation)
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
    values.push(applyOperation(values[values.length - 1], operation))
  }

  return values
}

function buildColorSeries(rule: ColorRuleState, quantity: number): string[] {
  if (rule.mode === 'cycle') {
    return buildCycleColorSeries(rule.cycleList, quantity)
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

function buildCycleNumericSeries(path: NumericFieldPath, cycleList: string, quantity: number): number[] {
  const entries = parseStrictList(cycleList)
  if (entries.length === 0) {
    throw new Error(`${path} 循环列表不能为空`)
  }

  return Array.from({ length: quantity }, (_, index) => {
    const rawValue = entries[index % entries.length]
    return parseRequiredNumber(rawValue, `${path} 循环值`)
  })
}

function buildCycleColorSeries(cycleList: string, quantity: number): string[] {
  const entries = parseStrictList(cycleList)
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

function buildDirectFieldSeries<T>(
  path: DirectFieldPath,
  rule: DirectRuleState<T>,
  quantity: number
): T[] {
  if (rule.mode === 'assign') {
    return Array.from({ length: quantity }, () => rule.value)
  }

  const entries = parseStrictList(rule.cycleList)
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

function parseStrictList(rawText: string): string[] {
  if (!rawText) {
    return []
  }

  const strictRegex = /;\n|;$/
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

  return Math.max(1, Math.round(quantity))
}

function isOpacityPath(path: NumericFieldPath): path is 'opacity.from' | 'opacity.to' {
  return path === 'opacity.from' || path === 'opacity.to'
}

function parseOpacityOperation(input: string, path: NumericFieldPath) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error(`${path} 相对值不能为空`)
  }

  if (/^[+\-*/]/.test(trimmed)) {
    const operator = trimmed[0]
    const rawValue = operator === '-' ? trimmed : trimmed.slice(1)
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

  const parsedValue = Number(trimmed)
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
  switch (operation.mode) {
    case 'set':
      return operation.value
    case 'add':
      return originalValue + operation.value
    case 'mul':
      return originalValue * operation.value
    case 'div':
      return originalValue / operation.value
  }
}

function roundInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function clampNonNegativeInteger(value: unknown): number {
  return Math.max(0, roundInteger(value))
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
  // 贝塞尔曲线公式系数
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;

  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  function sampleCurveX(t: number) { return ((ax * t + bx) * t + cx) * t; }
  function sampleCurveY(t: number) { return ((ay * t + by) * t + cy) * t; }
  function sampleCurveDerivativeX(t: number) { return (3 * ax * t + 2 * bx) * t + cx; }

  // 给定 x 轴进度，求解曲线内部的参数 t_param
  return function solve(x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // 1. 先用牛顿迭代法快速求解（通常 4-8 次即可精准收敛）
    let tParam = x;
    for (let i = 0; i < 8; i++) {
      const xSample = sampleCurveX(tParam) - x;
      if (Math.abs(xSample) < 1e-6) return sampleCurveY(tParam);
      const dX = sampleCurveDerivativeX(tParam);
      if (Math.abs(dX) < 1e-6) break;
      tParam -= xSample / dX;
    }

    // 2. 如果牛顿法失效（导数趋近于0），退化到二分法兜底
    let lower = 0;
    let upper = 1;
    tParam = x;

    while (lower < upper) {
      const xSample = sampleCurveX(tParam);
      if (Math.abs(xSample - x) < 1e-6) return sampleCurveY(tParam);
      if (x > xSample) lower = tParam;
      else upper = tParam;
      tParam = (upper + lower) / 2;
    }

    return sampleCurveY(tParam);
  };
}

/**
 * 范围模式下，根据数学表达式批量计算数值序列
 */
export function evaluateRangeExpression(params: RangeEvaluationParams): number[] {
  const { expression, startVal, endVal, quantity } = params;
  const results: number[] = [];

  if (quantity < 2) return [startVal];

  try {
    // 2. 提前编译表达式（编译一次，循环求值，大幅提升跑大批量弹幕时的性能）
    const compiledExpr = math.compile(expression);

    // 3. 构建一个自定义的数学函数：bezier
    // math.js 允许在 scope 中直接注入普通 JS 函数
    const bezierFunction = (x1: number, y1: number, x2: number, y2: number, t: number) => {
      const solver = createCubicBezierSolver(x1, y1, x2, y2);
      return solver(t);
    };

    // 4. 循环为每条弹幕求值
    for (let i = 0; i < quantity; i++) {
      const t = i / (quantity - 1); // 归一化进度 0.0 ~ 1.0

      // 5. 组装当前索引的上下文沙盒 (Scope)
      const scope = {
        S: startVal,
        E: endVal,
        i: i,
        n: quantity,
        t: t,
        pi: Math.PI, // 注入常用常量小写
        bezier: bezierFunction // 注入贝塞尔函数
      };

      // 6. 求值
      const evalResult = compiledExpr.evaluate(scope);
      
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
