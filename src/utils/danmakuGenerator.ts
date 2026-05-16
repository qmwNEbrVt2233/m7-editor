import type { DanmakuItem } from '@/core/danmaku'
import { applyOperation, blendColor, parseColorWithAlpha, parseInput } from '@/utils/parser'
import { M7_RULES, normalizeColor, validateRange } from '@/utils/validation'

export type RuleMode = 'range' | 'relative'
export type WriteMode = 'append' | 'replace'

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
  start: string
  end: string
  step: string
}

export type ColorRuleState = {
  mode: RuleMode
  start: string
  startText: string
  target: string
  targetText: string
  alpha: string
}

export type ToolWriteRequest = {
  quantity: number
  writeMode: WriteMode
  previewText: string
  numericRules: Record<NumericFieldPath, NumericRuleState>
  colorRule: ColorRuleState
  directRules: {
    text: string
    font: string
    stroke: boolean
    easing: DanmakuItem['animation']['easing']
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
  const generatedDanmakus = generateDanmakuDraftsFromRules(request)
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
  const numericSeries = buildNumericSeriesMap(request.numericRules, quantity)
  const colorSeries = buildColorSeries(request.colorRule, quantity)

  const drafts: DanmakuDraft[] = []

  for (let index = 0; index < quantity; index++) {
    drafts.push(normalizeGeneratedDraft({
      layer: numericSeries.layer[index],
      startTime: numericSeries.startTime[index],
      content: {
        text: request.directRules.text,
        font: request.directRules.font,
        size: numericSeries['content.size'][index],
        color: colorSeries[index],
        stroke: request.directRules.stroke
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
        easing: request.directRules.easing
      }
    }))
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
  const easingValue = draft.animation?.easing === 'speeddown' ? 'speeddown' : 'speedup'

  return {
    layer: clampIntegerByRule(draft.layer, M7_RULES.layer),
    startTime: clampNonNegativeInteger(draft.startTime),
    content: {
      text: String(draft.content?.text ?? ''),
      font: String(draft.content?.font ?? 'Microsoft YaHei'),
      size: clampIntegerByRule(draft.content?.size, M7_RULES.size),
      color: normalizedColorValue,
      stroke: Boolean(draft.content?.stroke)
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
  quantity: number
): Record<NumericFieldPath, number[]> {
  const result = {} as Record<NumericFieldPath, number[]>

  for (const path of NUMERIC_FIELD_PATHS) {
    result[path] = buildNumericSeries(path, numericRules[path], quantity)
  }

  return result
}

function buildNumericSeries(
  path: NumericFieldPath,
  rule: NumericRuleState,
  quantity: number
): number[] {
  const startValue = parseRequiredNumber(rule.start, `${path} 起始值`)

  if (quantity <= 1) {
    return [startValue]
  }

  if (rule.mode === 'range') {
    const endValue = parseRequiredNumber(rule.end, `${path} 结束值`)
    const step = (endValue - startValue) / (quantity - 1)
    return Array.from({ length: quantity }, (_, index) => startValue + (step * index))
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
