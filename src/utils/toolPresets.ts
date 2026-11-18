import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import type {
  ColorRuleState,
  NumericFieldPath,
  NumericRuleState,
  ToolWriteRequest,
  WriteMode
} from '@/utils/danmakuGenerator'

const PRESET_STORAGE_KEY = 'm7-editor.creation-tool-presets'
const PRESET_EXPORT_TYPE = 'm7-editor.creation-tool-presets'

export type CreationToolPanelState = {
  quantityInput: string
  expressionEnabled: boolean
  writeMode: WriteMode
  numericRules: Record<NumericFieldPath, NumericRuleState>
  colorRule: ColorRuleState
  directRules: ToolWriteRequest['directRules']
}

export type CreationToolPreset = {
  id: string
  name: string
  createdAt: number
  state: CreationToolPanelState
}

export type CreationToolPresetExport = {
  meta: {
    type: typeof PRESET_EXPORT_TYPE
    version: string
    exportedAt: number
  }
  presets: CreationToolPreset[]
}

export function loadCreationToolPresets(): CreationToolPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === 0) {
      return []
    }
    if (isRecord(parsed) && Array.isArray(parsed.presets) && parsed.presets.length === 0) {
      return []
    }

    return parsePresetList(parsed)
  } catch (error) {
    try {
      const notice = useNoticeStore()
      notice.alert('读取本地预设失败', 'error', '错误', error)
    } catch {
      console.warn('读取本地预设失败', error)
    }
    return []
  }
}

export function saveCreationToolPresets(presets: CreationToolPreset[]) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
  } catch (error) {
    try {
      const notice = useNoticeStore()
      notice.alert('保存本地预设失败（可能超出浏览器存储空间限制）', 'error', '错误', error)
    } catch {
      console.warn('保存本地预设失败', error)
    }
  }
}

export function serializePresetExport(presets: CreationToolPreset[]): CreationToolPresetExport {
  let version = '1.12.0'
  try {
    version = useEditorStore().version
  } catch {
    // fallback version outside active Pinia
  }
  return {
    meta: {
      type: PRESET_EXPORT_TYPE,
      version,
      exportedAt: Date.now()
    },
    presets: deepClone(presets)
  }
}

function parsePresetList(parsed: unknown): CreationToolPreset[] {
  const sourceList = extractPresetList(parsed)

  if (sourceList.length === 0) {
    throw new Error('导入数据中未找到可用预设')
  }

  return sourceList.map((item, index) => normalizePreset(item, index))
}

export function parsePresetImport(text: string): CreationToolPreset[] {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('预设文件内容为空')
  }
  const parsed: unknown = JSON.parse(text)
  return parsePresetList(parsed)
}

export function createPresetFromState(
  presets: CreationToolPreset[],
  state: CreationToolPanelState
): CreationToolPreset {
  const now = Date.now()

  return {
    id: createPresetId(),
    name: createDefaultPresetName(presets),
    createdAt: now,
    state: deepClone(state)
  }
}

export function mergeImportedPresets(
  existingPresets: CreationToolPreset[],
  importedPresets: CreationToolPreset[]
): CreationToolPreset[] {
  const existingIds = new Set(existingPresets.map((preset) => preset.id))

  const normalizedImported = importedPresets.map((preset) => {
    const nextPreset = deepClone(preset)
    if (existingIds.has(nextPreset.id)) {
      nextPreset.id = createPresetId()
    }
    existingIds.add(nextPreset.id)
    return nextPreset
  })

  return [...existingPresets, ...normalizedImported]
}

export function updatePresetName(
  presets: CreationToolPreset[],
  presetId: string,
  nextName: string
): CreationToolPreset[] {
  const trimmed = nextName.trim()
  if (!trimmed) {
    return presets
  }

  return presets.map((preset) => {
    if (preset.id !== presetId) {
      return preset
    }

    return {
      ...preset,
      name: trimmed
    }
  })
}

export function createDefaultPresetName(presets: CreationToolPreset[]): string {
  let nextNumber = 1
  const nameSet = new Set(presets.map((preset) => preset.name))

  while (nameSet.has(`新建预设${nextNumber}`)) {
    nextNumber++
  }

  return `新建预设${nextNumber}`
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

function isRuleMode(value: unknown): value is 'cycle' | 'range' | 'relative' {
  return value === 'cycle' || value === 'range' || value === 'relative'
}

function isDirectRuleMode(value: unknown): value is 'assign' | 'cycle' {
  return value === 'assign' || value === 'cycle'
}

function isNumericRuleLike(value: unknown): value is NumericRuleState {
  if (!isRecord(value)) return false
  return (
    isRuleMode(value.mode) &&
    typeof value.cycleList === 'string' &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    typeof value.step === 'string' &&
    (value.expression === undefined || typeof value.expression === 'string') &&
    (value.expressionPreset === undefined || typeof value.expressionPreset === 'string')
  )
}

function isColorRuleLike(value: unknown): value is ColorRuleState {
  if (!isRecord(value)) return false
  return (
    isRuleMode(value.mode) &&
    typeof value.cycleList === 'string' &&
    typeof value.start === 'string' &&
    typeof value.target === 'string' &&
    typeof value.alpha === 'string' &&
    (value.startText === undefined || typeof value.startText === 'string') &&
    (value.targetText === undefined || typeof value.targetText === 'string')
  )
}

function isDirectRuleStringLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDirectRuleMode(value.mode) &&
    typeof value.value === 'string' &&
    typeof value.cycleList === 'string'
  )
}

function isDirectRuleBooleanLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDirectRuleMode(value.mode) &&
    typeof value.value === 'boolean' &&
    typeof value.cycleList === 'string'
  )
}

function isDirectRuleEasingLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDirectRuleMode(value.mode) &&
    (value.value === 'speedup' || value.value === 'speeddown') &&
    typeof value.cycleList === 'string'
  )
}

function normalizePreset(input: unknown, index: number): CreationToolPreset {
  if (!isRecord(input)) {
    throw new Error(`第 ${index + 1} 个预设格式无效`)
  }

  const stateCandidate = isRecord(input.state) ? input.state : input
  if (!isPanelStateLike(stateCandidate)) {
    throw new Error(`第 ${index + 1} 个预设缺少或包含无效的工具面板状态`)
  }

  const now = Date.now()
  const clonedState = deepClone(stateCandidate as CreationToolPanelState)
  for (const key of REQUIRED_NUMERIC_RULE_KEYS) {
    const rule = clonedState.numericRules[key]
    if (typeof rule.expression !== 'string') rule.expression = 'S + (E - S) * t'
    if (typeof rule.expressionPreset !== 'string') rule.expressionPreset = 'linear'
  }
  if (typeof clonedState.colorRule.startText !== 'string') {
    clonedState.colorRule.startText = clonedState.colorRule.start
  }
  if (typeof clonedState.colorRule.targetText !== 'string') {
    clonedState.colorRule.targetText = clonedState.colorRule.target
  }

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : createPresetId(),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : `新建预设${index + 1}`,
    createdAt: typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : now,
    state: clonedState
  }
}

function isPanelStateLike(value: unknown): value is CreationToolPanelState {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.quantityInput !== 'string' ||
    typeof value.expressionEnabled !== 'boolean' ||
    (value.writeMode !== 'append' && value.writeMode !== 'replace') ||
    !isRecord(value.numericRules) ||
    !isColorRuleLike(value.colorRule) ||
    !isRecord(value.directRules)
  ) {
    return false
  }

  for (const key of REQUIRED_NUMERIC_RULE_KEYS) {
    if (!isNumericRuleLike(value.numericRules[key])) {
      return false
    }
  }

  return (
    isDirectRuleStringLike(value.directRules.text) &&
    isDirectRuleStringLike(value.directRules.font) &&
    isDirectRuleBooleanLike(value.directRules.stroke) &&
    isDirectRuleEasingLike(value.directRules.easing)
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function createPresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
