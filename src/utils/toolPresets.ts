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

    return parsePresetImport(raw)
  } catch (error) {
    const notice = useNoticeStore()
    notice.alert('读取本地预设失败', 'error', '错误', error)
    return []
  }
}

export function saveCreationToolPresets(presets: CreationToolPreset[]) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
}

export function serializePresetExport(presets: CreationToolPreset[]): CreationToolPresetExport {
  const store = useEditorStore()
  return {
    meta: {
      type: PRESET_EXPORT_TYPE,
      version: store.version,
      exportedAt: Date.now()
    },
    presets: deepClone(presets)
  }
}

export function parsePresetImport(text: string): CreationToolPreset[] {
  const parsed = JSON.parse(text)
  const sourceList = extractPresetList(parsed)

  if (sourceList.length === 0) {
    throw new Error('导入数据中未找到可用预设')
  }

  return sourceList.map((item, index) => normalizePreset(item, index))
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

function normalizePreset(input: unknown, index: number): CreationToolPreset {
  if (!isRecord(input)) {
    throw new Error(`第 ${index + 1} 个预设格式无效`)
  }

  const stateCandidate = isRecord(input.state) ? input.state : input
  if (!isPanelStateLike(stateCandidate)) {
    throw new Error(`第 ${index + 1} 个预设缺少工具面板状态`)
  }

  const now = Date.now()

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : createPresetId(),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : `新建预设${index + 1}`,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    state: deepClone(stateCandidate as CreationToolPanelState)
  }
}

function isPanelStateLike(value: unknown): value is CreationToolPanelState {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.quantityInput === 'string' &&
    typeof value.expressionEnabled === 'boolean' &&
    (value.writeMode === 'append' || value.writeMode === 'replace') &&
    isRecord(value.numericRules) &&
    isRecord(value.colorRule) &&
    isRecord(value.directRules)
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object'
}

function createPresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
