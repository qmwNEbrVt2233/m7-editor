import {
  createDefaultColorRule,
  createDefaultDirectRules,
  createDefaultNumericRules,
  type ColorRuleState,
  type DirectRuleMode,
  type NumericFieldPath,
  type NumericRuleState,
  type RuleMode,
  type ToolWriteRequest,
  type WriteMode
} from './danmakuGenerator.ts'
import { normalizeColor } from './validation.ts'

export const PRESET_STORAGE_KEY = 'm7-editor.creation-tool-presets'
export const PRESET_LEGACY_BACKUP_KEY = 'm7-editor.creation-tool-presets.legacy-backup'
export const PRESET_EXPORT_TYPE = 'm7-editor.creation-tool-presets'
const MAX_CREATION_QUANTITY = 10000
const MAX_PRESET_NAME_CHARS = 180

const WINDOWS_RESERVED_NAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

export type CreationToolPanelState = {
  quantityInput: string
  expressionEnabled: boolean
  writeMode: WriteMode
  numericRules: Record<NumericFieldPath, NumericRuleState>
  colorRule: ColorRuleState
  directRules: ToolWriteRequest['directRules']
}

export type CreationToolPresetRecord = {
  name: string
  createdAt: number
  lastChangeAt: number
  state: CreationToolPanelState
}

export type CreationToolPresetExport = {
  meta: {
    type: typeof PRESET_EXPORT_TYPE
    version: string
    exportedAt: number
  }
  presets: CreationToolPresetRecord[]
}

const REQUIRED_NUMERIC_RULE_KEYS: NumericFieldPath[] = [
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

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRuleMode(value: unknown): value is RuleMode {
  return value === 'cycle' || value === 'range' || value === 'relative'
}

function isDirectRuleMode(value: unknown): value is DirectRuleMode {
  return value === 'assign' || value === 'cycle'
}

function toFullHexColor(value: string): string {
  const normalized = normalizeColor(value)
  if (!normalized) return '#FFFFFF'
  const shortMatch = normalized.match(/^#([0-9A-F]{3})$/)
  if (shortMatch) {
    const [r, g, b] = shortMatch[1]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return normalized
}

export function normalizeCreationPresetName(name: string): string {
  if (typeof name !== 'string') return ''
  let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '')
  sanitized = Array.from(sanitized).slice(0, MAX_PRESET_NAME_CHARS).join('')
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '')
  if (!sanitized) return ''
  const base = sanitized.split('.')[0]?.trim() || sanitized
  if (WINDOWS_RESERVED_NAME_PATTERN.test(base)) {
    const prefixed = `_${sanitized}`
    return Array.from(prefixed).slice(0, MAX_PRESET_NAME_CHARS).join('')
  }
  return sanitized
}

export function deduplicatePresetName(
  baseName: string,
  existingNames: Iterable<string>,
  excludeName?: string
): string {
  const normalizedBase = normalizeCreationPresetName(baseName) || '导入预设'
  const excludeLower = excludeName?.toLocaleLowerCase()
  const used = new Set<string>()
  for (const name of existingNames) {
    const lower = name.toLocaleLowerCase()
    if (excludeLower && lower === excludeLower) continue
    used.add(lower)
  }

  if (!used.has(normalizedBase.toLocaleLowerCase())) {
    return normalizedBase
  }

  let suffixIndex = 2
  while (true) {
    const suffix = ` (${suffixIndex})`
    const maxStemChars = Math.max(1, MAX_PRESET_NAME_CHARS - Array.from(suffix).length)
    const truncatedStem = Array.from(normalizedBase).slice(0, maxStemChars).join('').replace(/[\s.]+$/g, '') || '预设'
    const candidate = `${truncatedStem}${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) {
      return candidate
    }
    suffixIndex++
  }
}

export function createDefaultPresetName(presets: ReadonlyArray<{ name: string }>): string {
  const nameSet = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
  let nextNumber = 1
  while (nameSet.has(`新建预设${nextNumber}`)) {
    nextNumber++
  }
  return `新建预设${nextNumber}`
}

export function sanitizeCreationPanelState(raw: unknown, fallbackCurrentTime = 0): CreationToolPanelState {
  const defaultNumeric = createDefaultNumericRules(fallbackCurrentTime)
  const defaultColor = createDefaultColorRule()
  const defaultDirect = createDefaultDirectRules()
  const source = isRecord(raw) ? raw : {}

  const rawNumeric = isRecord(source.numericRules) ? source.numericRules : {}
  const nextNumeric = {} as Record<NumericFieldPath, NumericRuleState>
  for (const path of REQUIRED_NUMERIC_RULE_KEYS) {
    const fallback = defaultNumeric[path]
    const candidate = isRecord(rawNumeric[path]) ? rawNumeric[path] : {}
    nextNumeric[path] = {
      mode: isRuleMode(candidate.mode) ? candidate.mode : fallback.mode,
      cycleList: typeof candidate.cycleList === 'string' ? candidate.cycleList : fallback.cycleList,
      start: typeof candidate.start === 'string' ? candidate.start : fallback.start,
      end: typeof candidate.end === 'string' ? candidate.end : fallback.end,
      step: typeof candidate.step === 'string' ? candidate.step : fallback.step,
      expression: typeof candidate.expression === 'string' ? candidate.expression : fallback.expression,
      expressionPreset: typeof candidate.expressionPreset === 'string' ? candidate.expressionPreset : fallback.expressionPreset
    }
  }

  const rawColor = isRecord(source.colorRule) ? source.colorRule : {}
  const safeStart = normalizeColor(String(rawColor.start ?? rawColor.startText ?? ''))
    ? toFullHexColor(String(rawColor.start ?? rawColor.startText ?? ''))
    : defaultColor.start
  const safeTarget = normalizeColor(String(rawColor.target ?? rawColor.targetText ?? ''))
    ? toFullHexColor(String(rawColor.target ?? rawColor.targetText ?? ''))
    : defaultColor.target
  const nextColor: ColorRuleState = {
    mode: isRuleMode(rawColor.mode) ? rawColor.mode : defaultColor.mode,
    cycleList: typeof rawColor.cycleList === 'string' ? rawColor.cycleList : defaultColor.cycleList,
    start: safeStart,
    startText: typeof rawColor.startText === 'string' && normalizeColor(rawColor.startText)
      ? toFullHexColor(rawColor.startText)
      : safeStart,
    target: safeTarget,
    targetText: typeof rawColor.targetText === 'string' && normalizeColor(rawColor.targetText)
      ? toFullHexColor(rawColor.targetText)
      : safeTarget,
    alpha: typeof rawColor.alpha === 'string' ? rawColor.alpha : defaultColor.alpha
  }

  const rawDirect = isRecord(source.directRules) ? source.directRules : {}
  const rawText = isRecord(rawDirect.text) ? rawDirect.text : {}
  const rawFont = isRecord(rawDirect.font) ? rawDirect.font : {}
  const rawStroke = isRecord(rawDirect.stroke) ? rawDirect.stroke : {}
  const rawEasing = isRecord(rawDirect.easing) ? rawDirect.easing : {}

  const nextDirect: ToolWriteRequest['directRules'] = {
    text: {
      mode: isDirectRuleMode(rawText.mode) ? rawText.mode : defaultDirect.text.mode,
      value: typeof rawText.value === 'string' ? rawText.value : defaultDirect.text.value,
      cycleList: typeof rawText.cycleList === 'string' ? rawText.cycleList : defaultDirect.text.cycleList
    },
    font: {
      mode: isDirectRuleMode(rawFont.mode) ? rawFont.mode : defaultDirect.font.mode,
      value: typeof rawFont.value === 'string' ? rawFont.value : defaultDirect.font.value,
      cycleList: typeof rawFont.cycleList === 'string' ? rawFont.cycleList : defaultDirect.font.cycleList
    },
    stroke: {
      mode: isDirectRuleMode(rawStroke.mode) ? rawStroke.mode : defaultDirect.stroke.mode,
      value: typeof rawStroke.value === 'boolean' ? rawStroke.value : defaultDirect.stroke.value,
      cycleList: typeof rawStroke.cycleList === 'string' ? rawStroke.cycleList : defaultDirect.stroke.cycleList
    },
    easing: {
      mode: isDirectRuleMode(rawEasing.mode) ? rawEasing.mode : defaultDirect.easing.mode,
      value: rawEasing.value === 'speeddown' || rawEasing.value === 'speedup' ? rawEasing.value : defaultDirect.easing.value,
      cycleList: typeof rawEasing.cycleList === 'string' ? rawEasing.cycleList : defaultDirect.easing.cycleList
    }
  }

  const parsedQty = Number(source.quantityInput)
  const safeQuantity = Number.isFinite(parsedQty) && parsedQty >= 1
    ? String(Math.min(MAX_CREATION_QUANTITY, Math.round(parsedQty)))
    : '10'

  return {
    quantityInput: safeQuantity,
    expressionEnabled: typeof source.expressionEnabled === 'boolean' ? source.expressionEnabled : false,
    writeMode: source.writeMode === 'append' || source.writeMode === 'replace' ? source.writeMode : 'replace',
    numericRules: nextNumeric,
    colorRule: nextColor,
    directRules: nextDirect
  }
}

export function validateCreationPanelStateStrict(
  raw: unknown
): { valid: true; state: CreationToolPanelState } | { valid: false; message: string } {
  if (!isRecord(raw)) {
    return { valid: false, message: '预设内容必须是 JSON 对象' }
  }

  if (typeof raw.quantityInput !== 'string' || !/^\d+$/.test(raw.quantityInput.trim())) {
    return { valid: false, message: `quantityInput 必须是 "1"~"${MAX_CREATION_QUANTITY}" 的整数字符串` }
  }
  const qty = Number(raw.quantityInput.trim())
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_CREATION_QUANTITY) {
    return { valid: false, message: `quantityInput 必须在 1~${MAX_CREATION_QUANTITY} 之间` }
  }

  if (typeof raw.expressionEnabled !== 'boolean') {
    return { valid: false, message: 'expressionEnabled 必须是布尔值' }
  }

  if (raw.writeMode !== 'append' && raw.writeMode !== 'replace') {
    return { valid: false, message: 'writeMode 必须是 "append" 或 "replace"' }
  }

  if (!isRecord(raw.numericRules)) {
    return { valid: false, message: '缺少有效的 numericRules 对象' }
  }
  for (const key of REQUIRED_NUMERIC_RULE_KEYS) {
    const rule = raw.numericRules[key]
    if (!isRecord(rule)) {
      return { valid: false, message: `numericRules['${key}'] 必须是对象` }
    }
    if (!isRuleMode(rule.mode)) {
      return { valid: false, message: `numericRules['${key}'].mode 必须是 cycle、range 或 relative` }
    }
    if (
      typeof rule.cycleList !== 'string' ||
      typeof rule.start !== 'string' ||
      typeof rule.end !== 'string' ||
      typeof rule.step !== 'string'
    ) {
      return { valid: false, message: `numericRules['${key}'] 的 cycleList/start/end/step 必须是字符串` }
    }
    if (rule.expression !== undefined && typeof rule.expression !== 'string') {
      return { valid: false, message: `numericRules['${key}'].expression 必须是字符串` }
    }
    if (rule.expressionPreset !== undefined && typeof rule.expressionPreset !== 'string') {
      return { valid: false, message: `numericRules['${key}'].expressionPreset 必须是字符串` }
    }
  }

  const colorRule = raw.colorRule
  if (!isRecord(colorRule)) {
    return { valid: false, message: '缺少有效的 colorRule 对象' }
  }
  if (!isRuleMode(colorRule.mode)) {
    return { valid: false, message: 'colorRule.mode 必须是 cycle、range 或 relative' }
  }
  if (
    typeof colorRule.cycleList !== 'string' ||
    typeof colorRule.start !== 'string' ||
    typeof colorRule.target !== 'string' ||
    typeof colorRule.alpha !== 'string'
  ) {
    return { valid: false, message: 'colorRule 的 cycleList/start/target/alpha 必须是字符串' }
  }
  if (!normalizeColor(colorRule.start)) {
    return { valid: false, message: 'colorRule.start 颜色格式无效' }
  }
  if (!normalizeColor(colorRule.target)) {
    return { valid: false, message: 'colorRule.target 颜色格式无效' }
  }
  if (colorRule.startText !== undefined && typeof colorRule.startText !== 'string') {
    return { valid: false, message: 'colorRule.startText 必须是字符串' }
  }
  if (colorRule.targetText !== undefined && typeof colorRule.targetText !== 'string') {
    return { valid: false, message: 'colorRule.targetText 必须是字符串' }
  }

  const directRules = raw.directRules
  if (!isRecord(directRules)) {
    return { valid: false, message: '缺少有效的 directRules 对象' }
  }
  for (const field of ['text', 'font'] as const) {
    const rule = directRules[field]
    if (!isRecord(rule) || !isDirectRuleMode(rule.mode) || typeof rule.value !== 'string' || typeof rule.cycleList !== 'string') {
      return { valid: false, message: `directRules.${field} 格式无效` }
    }
  }
  const strokeRule = directRules.stroke
  if (
    !isRecord(strokeRule) ||
    !isDirectRuleMode(strokeRule.mode) ||
    typeof strokeRule.value !== 'boolean' ||
    typeof strokeRule.cycleList !== 'string'
  ) {
    return { valid: false, message: 'directRules.stroke 格式无效' }
  }
  const easingRule = directRules.easing
  if (
    !isRecord(easingRule) ||
    !isDirectRuleMode(easingRule.mode) ||
    (easingRule.value !== 'speedup' && easingRule.value !== 'speeddown') ||
    typeof easingRule.cycleList !== 'string'
  ) {
    return { valid: false, message: 'directRules.easing 格式无效（value 须为 speedup 或 speeddown）' }
  }

  return { valid: true, state: sanitizeCreationPanelState(raw) }
}

export function areCreationPanelStatesEqual(
  left: CreationToolPanelState,
  right: CreationToolPanelState
): boolean {
  return JSON.stringify(sanitizeCreationPanelState(left)) === JSON.stringify(sanitizeCreationPanelState(right))
}

function isPanelStateLike(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.quantityInput === 'string' &&
    typeof value.expressionEnabled === 'boolean' &&
    (value.writeMode === 'append' || value.writeMode === 'replace') &&
    isRecord(value.numericRules) &&
    isRecord(value.colorRule) &&
    isRecord(value.directRules)
  )
}

function extractPresetList(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input
  }
  if (!isRecord(input)) {
    return []
  }
  if (Array.isArray(input.presets)) {
    return input.presets
  }
  if (isRecord(input.state)) {
    return [input]
  }
  if (isPanelStateLike(input)) {
    return [{ state: input }]
  }
  return []
}

function normalizeImportedPresetRecord(
  input: unknown,
  index: number,
  fallbackName?: string
): CreationToolPresetRecord {
  if (!isRecord(input)) {
    throw new Error(`第 ${index + 1} 个预设格式无效`)
  }
  const stateCandidate = isRecord(input.state) ? input.state : input
  const validated = validateCreationPanelStateStrict(stateCandidate)
  if (!validated.valid) {
    throw new Error(`第 ${index + 1} 个预设无效：${validated.message}`)
  }

  const now = Date.now()
  const rawName = typeof input.name === 'string' ? normalizeCreationPresetName(input.name) : ''
  const resolvedFallback = fallbackName ? normalizeCreationPresetName(fallbackName) : ''
  const name = rawName || resolvedFallback || `新建预设${index + 1}`
  const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) && input.createdAt > 0
    ? Math.trunc(input.createdAt)
    : now
  const lastChangeAt = typeof input.lastChangeAt === 'number' && Number.isFinite(input.lastChangeAt) && input.lastChangeAt > 0
    ? Math.trunc(input.lastChangeAt)
    : createdAt

  return {
    name,
    createdAt,
    lastChangeAt,
    state: validated.state
  }
}

export function parsePresetImport(text: string, fallbackName?: string): CreationToolPresetRecord[] {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('预设文件内容为空')
  }
  const cleaned = text.replace(/^\uFEFF/, '')
  const parsed: unknown = JSON.parse(cleaned)
  const sourceList = extractPresetList(parsed)
  if (sourceList.length === 0) {
    throw new Error('导入数据中未找到可用预设')
  }
  return sourceList.map((item, index) => normalizeImportedPresetRecord(
    item,
    index,
    sourceList.length === 1 ? fallbackName : undefined
  ))
}

export function serializePresetExport(
  presets: CreationToolPresetRecord[],
  version = '1.13.0'
): CreationToolPresetExport {
  return {
    meta: {
      type: PRESET_EXPORT_TYPE,
      version,
      exportedAt: Date.now()
    },
    presets: deepClone(presets)
  }
}

export function readRawLegacyLocalPresets(): {
  raw: string
  presets: CreationToolPresetRecord[]
  hadLegacyFieldsOrDuplicates: boolean
} | null {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw || !raw.trim()) {
      return null
    }
    const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (Array.isArray(parsed) && parsed.length === 0) {
      return null
    }
    if (isRecord(parsed) && Array.isArray(parsed.presets) && parsed.presets.length === 0) {
      return null
    }

    const sourceList = extractPresetList(parsed)
    if (sourceList.length === 0) {
      return null
    }

    const presets: CreationToolPresetRecord[] = []
    const usedNames: string[] = []
    let hadLegacyFieldsOrDuplicates = !Array.isArray(parsed)
    const now = Date.now()

    sourceList.forEach((item, index) => {
      if (!isRecord(item)) return
      const stateCandidate = isRecord(item.state) ? item.state : item
      if (!isPanelStateLike(stateCandidate)) return

      const sanitizedState = sanitizeCreationPanelState(stateCandidate)
      const rawName = typeof item.name === 'string' ? item.name.trim() : ''
      const normalized = normalizeCreationPresetName(rawName) || `新建预设${index + 1}`
      const dedupedName = deduplicatePresetName(normalized, usedNames)

      if (
        'id' in item ||
        typeof item.lastChangeAt !== 'number' ||
        dedupedName !== rawName
      ) {
        hadLegacyFieldsOrDuplicates = true
      }

      const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 0
        ? Math.trunc(item.createdAt)
        : now
      const lastChangeAt = typeof item.lastChangeAt === 'number' && Number.isFinite(item.lastChangeAt) && item.lastChangeAt > 0
        ? Math.trunc(item.lastChangeAt)
        : createdAt

      usedNames.push(dedupedName)
      presets.push({
        name: dedupedName,
        createdAt,
        lastChangeAt,
        state: sanitizedState
      })
    })

    if (presets.length === 0) {
      return null
    }

    return { raw, presets, hadLegacyFieldsOrDuplicates }
  } catch (error) {
    console.warn('读取本地预设失败', error)
    return null
  }
}

export function writeLocalCreationToolPresets(presets: CreationToolPresetRecord[]): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
  } catch (error) {
    throw new Error(`保存本地预设失败（可能超出浏览器存储空间限制）: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function clearLocalCreationToolPresets(): void {
  try {
    localStorage.removeItem(PRESET_STORAGE_KEY)
  } catch {
    // ignore storage removal failures
  }
}

export function backupAndClearLegacyLocalPresets(raw: string): void {
  try {
    if (!localStorage.getItem(PRESET_LEGACY_BACKUP_KEY)) {
      localStorage.setItem(PRESET_LEGACY_BACKUP_KEY, raw)
    }
  } catch {
    // best-effort backup if quota is tight
  }
  clearLocalCreationToolPresets()
}
