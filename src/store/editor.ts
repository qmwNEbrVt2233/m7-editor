import { defineStore } from 'pinia'
import { useNoticeStore } from './notice'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import type { DanmakuItem } from '@/core/danmaku'
import { saveProject, loadProject, clearProject } from '@/localStorage/projectStorage'
import { historyManager } from '@/core/history'
import { parseXML, toXML } from '@/core/converter'
import { applyEditorApi, rotatedBox, type EditorApiMethod, type EditorApiResult } from '@/core/editorApi'
import { measureDanmakus } from '@/core/danmakuMeasurement'
import {
  runVideoExportInRenderWindow,
  type ExportProgress
} from '@/core/videoExport/exportCoordinator'
import type { ExportOutputDelivery } from '@/core/videoExport/outputSink'
import type { ExportQuality } from '@/core/videoExport/quality'
import { formatDuration } from '@/utils/time'
import {
  backupFolderProject,
  checkFolderProjectPath,
  convertMediaPathToUrl,
  createFolderProject,
  editFolderProject,
  getFileSystemState,
  importFolderProject,
  isSameFsPath,
  loadFolderProject,
  readProjectJsonFile,
  readXmlFile,
  removeFolderProject,
  type EditFolderProjectInput,
  type FileSystemState,
  type GlobalSettings,
  type FolderProjectConfig,
  type FolderProjectPayload,
  type ProjectPathCheck,
  getProjectMediaPath,
  isTauriRuntime,
  prepareVideoExportPath,
  registerMediaPath,
  saveFolderProject,
  updateGlobalSettings,
  listDanmakuTemplates,
  createDanmakuTemplate,
  updateDanmakuTemplate,
  renameDanmakuTemplate,
  deleteDanmakuTemplate,
  type DanmakuTemplateRecord
} from '@/utils/tauriBackend'

export type VideoExportStatus = 'running' | 'completed' | 'failed' | 'canceled'

export type VideoExportOptions = {
  outputPath?: string
  startMs?: number
  endMs?: number
  width?: number
  height?: number
  fps?: number
  quality?: ExportQuality
  useWebgl?: boolean
  waitMs?: number
}

export type VideoExportJobSnapshot = {
  jobId: string
  source: 'ui' | 'mcp'
  status: VideoExportStatus
  outputPath: string | null
  delivery: ExportOutputDelivery | null
  encoder: 'webcodecs' | 'ffmpeg' | null
  startMs: number
  endMs: number
  durationMs: number
  fps: number
  quality: ExportQuality
  width: number
  height: number
  useWebgl: boolean
  startedAt: string
  finishedAt: string | null
  elapsedMs: number
  completedFrames: number
  totalFrames: number
  percent: number
  stage: ExportProgress['stage']
  detail: string | null
  averageFrameMs: number | null
  estimatedRemainingMs: number | null
  error: string | null
}

type VideoExportSpec = {
  source: 'ui' | 'mcp'
  outputPath?: string
  startMs: number
  endMs: number
  fps: number
  quality: ExportQuality
  width: number
  height: number
  useWebgl: boolean
}

type ActiveVideoExportRuntime = {
  jobId: string
  abortController: AbortController
  renderTimer: number | undefined
  renderStartedAt: number
  completionPromise: Promise<VideoExportJobSnapshot>
  resolveCompletion: (snapshot: VideoExportJobSnapshot) => void
}

const MAX_VIDEO_EXPORT_HISTORY = 20
const VALID_EXPORT_FPS = new Set([24, 30, 60, 120])
const VALID_EXPORT_QUALITIES = new Set<ExportQuality>(['low', 'high', 'very-high', 'near-lossless'])

let activeVideoExportRuntime: ActiveVideoExportRuntime | null = null
let videoExportPreflightBusy = false
const videoExportJobs = new Map<string, VideoExportJobSnapshot>()
let latestVideoExportJobId: string | null = null
let nextVideoExportSequence = 0

export function computeVideoExportStats(progress: ExportProgress, elapsedMs: number) {
  const averageFrameMs = progress.completedFrames > 0
    ? elapsedMs / progress.completedFrames
    : null
  let estimatedRemainingMs: number | null = null
  if (
    progress.stage !== 'preparing' &&
    progress.stage !== 'finalizing' &&
    progress.totalFrames > 0 &&
    progress.completedFrames > 0 &&
    averageFrameMs !== null
  ) {
    estimatedRemainingMs = progress.completedFrames >= progress.totalFrames
      ? 0
      : Math.max(0, averageFrameMs * (progress.totalFrames - progress.completedFrames))
  }
  return { averageFrameMs, estimatedRemainingMs }
}

export function normalizeEvenVideoDimension(value: number, min = 16): number {
  return Math.max(min, Math.round(value / 2) * 2)
}

export function resolveVideoExportDimensions(
  screenWidth: number,
  screenHeight: number,
  widthInput?: number,
  heightInput?: number
): { width: number; height: number } {
  const aspectRatio = screenWidth / screenHeight
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error('当前工程画布尺寸无效')
  }

  let width: number
  let height: number
  if (widthInput === undefined && heightInput === undefined) {
    width = normalizeEvenVideoDimension(screenWidth)
    height = normalizeEvenVideoDimension(screenHeight)
  } else if (widthInput !== undefined && heightInput === undefined) {
    if (!Number.isInteger(widthInput) || widthInput < 16 || widthInput > 7680) {
      throw new Error('导出宽度必须是 16 到 7680 之间的整数')
    }
    if (widthInput % 2 !== 0) {
      throw new Error('H.264 视频的宽度和高度需要是偶数')
    }
    width = widthInput
    height = normalizeEvenVideoDimension(widthInput / aspectRatio)
  } else if (widthInput === undefined && heightInput !== undefined) {
    if (!Number.isInteger(heightInput) || heightInput < 16 || heightInput > 4320) {
      throw new Error('导出高度必须是 16 到 4320 之间的整数')
    }
    if (heightInput % 2 !== 0) {
      throw new Error('H.264 视频的宽度和高度需要是偶数')
    }
    height = heightInput
    width = normalizeEvenVideoDimension(heightInput * aspectRatio)
  } else {
    width = widthInput!
    height = heightInput!
  }

  if (!Number.isInteger(width) || width < 16 || width > 7680) {
    throw new Error('导出宽度必须是 16 到 7680 之间的偶数')
  }
  if (!Number.isInteger(height) || height < 16 || height > 4320) {
    throw new Error('导出高度必须是 16 到 4320 之间的偶数')
  }
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error('H.264 视频的宽度和高度需要是偶数')
  }
  const outputAspectRatio = width / height
  if (Math.abs(outputAspectRatio - aspectRatio) / aspectRatio > 0.002) {
    throw new Error('导出宽高比例需要与工程画布一致')
  }
  return { width, height }
}

function recordVideoExportSnapshot(snapshot: VideoExportJobSnapshot) {
  if (videoExportJobs.has(snapshot.jobId)) {
    videoExportJobs.delete(snapshot.jobId)
  }
  videoExportJobs.set(snapshot.jobId, snapshot)
  latestVideoExportJobId = snapshot.jobId
  while (videoExportJobs.size > MAX_VIDEO_EXPORT_HISTORY) {
    const oldestKey = videoExportJobs.keys().next().value as string | undefined
    if (!oldestKey) break
    if (oldestKey === activeVideoExportRuntime?.jobId) {
      const active = videoExportJobs.get(oldestKey)!
      videoExportJobs.delete(oldestKey)
      videoExportJobs.set(oldestKey, active)
      continue
    }
    videoExportJobs.delete(oldestKey)
  }
}

async function waitForPromiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  if (timeoutMs <= 0) return null
  let timer: number | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
  }
}

let editorApiQueue: Promise<void> = Promise.resolve()

async function withEditorOperationLock<T>(task: () => Promise<T>): Promise<T> {
  const previousOperation = editorApiQueue
  let releaseOperation!: () => void
  editorApiQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve
  })
  await previousOperation
  try {
    return await task()
  } finally {
    releaseOperation()
  }
}

type SavePickerAcceptType = {
  description: string
  accept: Record<string, string[]>
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: SavePickerAcceptType[]
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

export async function saveBlobWithFallback(
  blob: Blob,
  filename: string,
  acceptType: SavePickerAcceptType
) {
  const notice = useNoticeStore()
  const savePickerWindow = window as SavePickerWindow

  if (typeof savePickerWindow.showSaveFilePicker !== 'function') {
    triggerBlobDownload(blob, filename)
    return
  }

  try {
    const fileHandle = await savePickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [acceptType]
    })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    notice.log(`'[保存] File System Access API 保存失败，回退到 Blob 下载'`, 'warn', error)
    triggerBlobDownload(blob, filename)
  }
}

function isDanmakuLike(value: unknown): value is DanmakuItem {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, any>
  return (
    candidate.startTime !== undefined &&
    candidate.content &&
    candidate.transform &&
    candidate.opacity &&
    candidate.animation
  )
}

function extractDanmakusFromParsedJson(parsed: unknown): DanmakuItem[] | null {
  if (Array.isArray(parsed)) {
    const danmakus = parsed.filter(isDanmakuLike)
    return danmakus.length > 0 ? (danmakus as DanmakuItem[]) : null
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, any>

    if (Array.isArray(record.danmakus)) {
      const danmakus = record.danmakus.filter(isDanmakuLike)
      return danmakus.length > 0 ? (danmakus as DanmakuItem[]) : null
    }

    if (isDanmakuLike(record)) {
      return [record as DanmakuItem]
    }
  }

  return null
}

function tryParseDanmakusJson(text: string): DanmakuItem[] | null {
  const parsed = JSON.parse(text)
  return extractDanmakusFromParsedJson(parsed)
}

const DANMAKU_TEMPLATES_STORAGE_KEY = 'm7-editor-danmaku-templates'
const GLOBAL_SETTINGS_STORAGE_KEY = 'm7-editor-global-settings'
const LEGACY_TEMPLATE_REPLACEMENT_KEY = 'm7-editor-danmaku-template-replacement'
let globalSettingsSaveQueue = Promise.resolve()

function readLocalDanmakuTemplates(): DanmakuTemplateRecord[] {
  try {
    const saved = localStorage.getItem(DANMAKU_TEMPLATES_STORAGE_KEY)
    const parsed: unknown = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed as DanmakuTemplateRecord[] : []
  } catch {
    return []
  }
}

function writeLocalDanmakuTemplates(templates: DanmakuTemplateRecord[]) {
  localStorage.setItem(DANMAKU_TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
}

function readLocalGlobalSettings(): Partial<GlobalSettings> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const settings = parsed as Partial<GlobalSettings>
    if (typeof settings.replaceDefaultDanmakuWithTemplate !== 'boolean') {
      settings.replaceDefaultDanmakuWithTemplate = localStorage.getItem(LEGACY_TEMPLATE_REPLACEMENT_KEY) === 'true'
    }
    return settings
  } catch {
    return {
      replaceDefaultDanmakuWithTemplate: localStorage.getItem(LEGACY_TEMPLATE_REPLACEMENT_KEY) === 'true'
    }
  }
}

function normalizeDanmakuTemplateName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '')
}

function isValidTemplateDanmaku(value: unknown): value is DanmakuItem {
  if (!isDanmakuLike(value)) return false
  const danmaku = value as Record<string, any>
  const isFiniteNumber = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate)
  const content = danmaku.content
  const transform = danmaku.transform
  const opacity = danmaku.opacity
  const animation = danmaku.animation

  return typeof danmaku.id === 'string' && isFiniteNumber(danmaku.startTime) && isFiniteNumber(danmaku.layer) &&
    typeof content.text === 'string' && typeof content.font === 'string' &&
    isFiniteNumber(content.size) && typeof content.color === 'string' && typeof content.stroke === 'boolean' &&
    isFiniteNumber(transform.start?.x) && isFiniteNumber(transform.start?.y) &&
    isFiniteNumber(transform.end?.x) && isFiniteNumber(transform.end?.y) &&
    isFiniteNumber(transform.zRotate) && isFiniteNumber(transform.yRotate) &&
    isFiniteNumber(opacity.from) && isFiniteNumber(opacity.to) &&
    (animation.duration === undefined || isFiniteNumber(animation.duration)) &&
    isFiniteNumber(animation.moveDuration) && isFiniteNumber(animation.delay) &&
    (animation.easing === 'speedup' || animation.easing === 'speeddown')
}

function normalizeMcpDanmakuDrafts(input: unknown, defaultDuration: number): DanmakuItem[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('请提供至少一条弹幕对象')
  return input.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`第 ${index + 1} 条弹幕必须是对象`)
    }
    let draft: Record<string, any>
    try {
      draft = JSON.parse(JSON.stringify(value)) as Record<string, any>
    } catch {
      throw new Error(`第 ${index + 1} 条弹幕无法序列化`)
    }
    if (!draft.animation || typeof draft.animation !== 'object' || Array.isArray(draft.animation)) {
      throw new Error(`第 ${index + 1} 条弹幕缺少 animation 对象`)
    }
    if (!Number.isFinite(draft.animation.duration)) draft.animation.duration = defaultDuration
    draft.id = '__mcp_pending_id__'
    if (!isValidTemplateDanmaku(draft)) {
      throw new Error(`第 ${index + 1} 条弹幕结构无效；需要 content、transform、opacity 和完整的 animation 字段`)
    }
    if (draft.startTime < 0 || draft.layer < 0 || draft.animation.duration <= 0) {
      throw new Error(`第 ${index + 1} 条弹幕的时间、层级和持续时间必须是有效的非负值，持续时间须大于 0`)
    }
    draft.id = ''
    draft.startTime = Math.round(draft.startTime)
    draft.layer = Math.round(draft.layer)
    return draft as DanmakuItem
  })
}

export function parsePastedDanmakusText(text: string): DanmakuItem[] {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  if (!trimmed) {
    throw new Error('剪贴板内容为空')
  }

  const sanitized = trimmed.replace(/,\s*([}\]])/g, '$1')
  const wrappedAsArray = `[${sanitized.replace(/^\s*,+|,+\s*$/g, '')}]`

  const candidates = Array.from(new Set([
    trimmed,
    sanitized,
    wrappedAsArray
  ]))

  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const danmakus = tryParseDanmakusJson(candidate)
      if (danmakus && danmakus.length > 0) {
        return JSON.parse(JSON.stringify(danmakus)) as DanmakuItem[]
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('粘贴数据中未找到可用的弹幕')
}

export const useEditorStore = defineStore('editor', {
  state: () => {
    const saved = isTauriRuntime() ? null : loadProject()
    const savedGlobalSettings = isTauriRuntime() ? null : readLocalGlobalSettings()
    const savedMediaPath = getProjectMediaPath(saved?.media)
    historyManager.recordSnapshot(saved?.danmakus || [], `加载工程(${(saved?.danmakus || []).length}条弹幕)`)

    return {
      version: '1.11.0',
      InitializationPhase: isTauriRuntime(),
      showProjectManager: isTauriRuntime(),
      projectMode: 'single' as 'single' | 'folder',
      activeFolderProjectPath: '',
      activeFolderProjectConfig: null as FolderProjectConfig | null,
      pendingFolderMediaPath: '',
      fileSystemState: null as FileSystemState | null,
      mediaUrl: savedMediaPath ? '' : saved?.media?.url || '',
      mediaDuration: 0,
      mediaElement: null as HTMLMediaElement | null,
      mediaFilePath: savedMediaPath,

      danmakus: saved?.danmakus || [
        {
          id: '1',
          layer: 0,
          startTime: 0,
          content: {
            text: '欢迎使用m7编辑器',
            font: 'Microsoft YaHei',
            size: 60,
            color: '#ffffff',
            stroke: false
          },
          transform: {
            start: { x: 130, y: 180 },
            end: { x: 130, y: 180 },
            zRotate: 0,
            yRotate: 0
          },
          opacity: { from: 1, to: 1 },
          animation: {
            duration: 2000,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        },
        {
          id: '2',
          layer: 0,
          startTime: 2000,
          content: {
            text: '欢迎使用m7编辑器',
            font: 'Microsoft YaHei',
            size: 60,
            color: '#ffffff',
            stroke: false
          },
          transform: {
            start: { x: 130, y: 180 },
            end: { x: 800, y: 180 },
            zRotate: 0,
            yRotate: 0
          },
          opacity: { from: 1, to: 0 },
          animation: {
            duration: 500,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        }
      ],
      selectedIds: [] as string[],
      currentTime: saved?.timeline?.currentTime || 0,
      timelineScale: saved?.timeline?.scale || 0.1,
      timelineOffset: saved?.timeline?.offset || 0,
      timelineScrollTop: saved?.timeline?.scrollTop || 0,
      playing: false,
      aggressiveOptimization: false,
      // 屏幕录制模式
      screenRecordingMode: false,
      // 快捷键配置：播放头移动的步长（毫秒）
      playheadStepMs: 16.666667,  // 默认60fps对应的毫秒值
      globalSettingsLoaded: false,
      // 弹幕生存时间配置
      danmakuDuration: {
        mode: 'ms' as 'ms' | 'multiplier',
        value: 1000
      },
      // 播放器与 XML 导出设置
      screenWidth: saved?.player?.screenWidth || 800,
      screenHeight: saved?.player?.screenHeight || 450,
      screenScale: saved?.player?.screenScale || Math.round(window.innerHeight / (saved?.player?.screenHeight || 450) * 100 * 0.55),
      maxLayers: saved?.player?.maxLayers || 100,
      exportXmlAsRatio: false,
      importXmlDurationOffsetEnabled: true,
      exportXmlDurationOffsetEnabled: true,
      allowNegativeValues: saved?.preprocess?.allowNegativeValues || false,
      showCreationTools: false,
      showTemplateManager: false,
      danmakuTemplates: [] as DanmakuTemplateRecord[],
      selectedDanmakuTemplateName: savedGlobalSettings?.selectedDanmakuTemplateName || '',
      replaceDefaultDanmakuWithTemplate: savedGlobalSettings?.replaceDefaultDanmakuWithTemplate || false,
      useWebglVideoExport: typeof savedGlobalSettings?.useWebglVideoExport === 'boolean'
        ? savedGlobalSettings.useWebglVideoExport
        : true,
      videoExport: {
        activeJobId: null as string | null,
        source: null as 'ui' | 'mcp' | null,
        status: 'idle' as 'idle' | VideoExportStatus,
        outputPath: '' as string,
        delivery: null as ExportOutputDelivery | null,
        encoder: null as 'webcodecs' | 'ffmpeg' | null,
        useWebgl: true,
        startMs: 0,
        endMs: 0,
        fps: 60,
        quality: 'very-high' as ExportQuality,
        width: 1920,
        height: 1080,
        progress: {
          completedFrames: 0,
          totalFrames: 0,
          percent: 0,
          stage: 'preparing'
        } as ExportProgress,
        elapsedMs: 0,
        startedAt: 0,
        finishedAt: 0,
        error: ''
      },
      danmakuTemplatesLoaded: false,
      showSpectrogram: saved?.timeline?.showSpectrogram || false,
      spectrogramColorScheme: saved?.timeline?.spectrogramColorScheme || 'default',
      spectrogramCustomColor: saved?.timeline?.spectrogramCustomColor || '#00bbff',
      danmakuColorForBlock: saved?.timeline?.danmakuColorForBlock || false,
      // 导入完成时间戳：用于触发缓冲池重构
      importTimestamp: 0,
      // _applyDeepPatch 防抖计时器
      _applyDeepPatchDebounceTimer: null as ReturnType<typeof setTimeout> | null,
      // moveSelectedLayers 防抖计时器
      _moveSelectedLayersDebounceTimer: null as ReturnType<typeof setTimeout> | null
    }
  },

  getters: {
    /**
     * 获取选中的弹幕列表
     */
    getSelectedDanmakus(): DanmakuItem[] {
      return this.danmakus.filter((d: DanmakuItem) => this.selectedIds.includes(d.id))
    },

    /**
     * 获取选中弹幕的数量
     */
    selectedCount(): number {
      return this.selectedIds.length
    }
  },

  actions: {
    async applyFieldUpdate(field: string, method: EditorApiMethod): Promise<EditorApiResult> {
      return withEditorOperationLock(async () => {
      const emptyResult = { changedIds: [], createdIds: [], selectedIds: [...this.selectedIds], warnings: [] as string[] }

      if (field === '@history.undo' || field === '@history.redo') {
        const historyState = historyManager.getState()
        if (field === '@history.undo' && !historyState.canUndo) {
          return { ok: false, code: 'NO_UNDO', message: '没有可撤销的操作', ...emptyResult }
        }
        if (field === '@history.redo' && !historyState.canRedo) {
          return { ok: false, code: 'NO_REDO', message: '没有可重做的操作', ...emptyResult }
        }
        const before = new Map<string, string>(this.danmakus.map((item: DanmakuItem) => [item.id, JSON.stringify(item)] as [string, string]))
        field === '@history.undo' ? this.undo() : this.redo()
        const after = new Map<string, string>(this.danmakus.map((item: DanmakuItem) => [item.id, JSON.stringify(item)] as [string, string]))
        const changedIds = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id))
        return { ok: true, changedIds, createdIds: [...after.keys()].filter((id) => !before.has(id)), selectedIds: [...this.selectedIds], warnings: [] }
      }

      try {
        const methodParams = method && typeof method === 'object' ? method as Record<string, unknown> : {}

        if (field === '@danmaku.create') {
          if (typeof methodParams.relativeToCurrentTime !== 'boolean') {
            throw new Error('relativeToCurrentTime 必须明确传入 true 或 false')
          }
          const drafts = normalizeMcpDanmakuDrafts(methodParams.danmakus, this.getDefaultDanmakuDuration())
          historyManager.ensureBaseline(this.danmakus, 'MCP 编辑前的状态')
          const relativeToCurrentTime = methodParams.relativeToCurrentTime === true
          let created: DanmakuItem[]
          if (relativeToCurrentTime) {
            created = this.insertDanmakus(drafts, 'MCP 创建弹幕', true)
          } else {
            let nextId = this.danmakus.reduce((max: number, item: DanmakuItem) => {
              const numericId = Number.parseInt(item.id, 10)
              return Number.isFinite(numericId) ? Math.max(max, numericId) : max
            }, 0)
            created = drafts.map((draft) => ({ ...draft, id: String(++nextId) }))
            this.danmakus.push(...created)
            this.selectedIds = created.map((item) => item.id)
            historyManager.recordSnapshot(this.danmakus, `MCP 创建弹幕${created.length}条`, true)
          }
          return {
            ok: true,
            changedIds: [],
            createdIds: created.map((item) => item.id),
            selectedIds: [...this.selectedIds],
            warnings: []
          }
        }

        if (field === '@danmaku.delete') {
          const requestedIds = methodParams.ids === undefined
            ? [...this.selectedIds]
            : Array.isArray(methodParams.ids) && methodParams.ids.every((id) => typeof id === 'string')
              ? [...new Set(methodParams.ids as string[])]
              : null
          if (requestedIds === null) throw new Error('弹幕 ID 必须是字符串数组')
          if (!requestedIds.length) throw new Error('没有指定要删除的弹幕，也没有选中弹幕')
          const requested = new Set(requestedIds)
          const found = this.danmakus.filter((item: DanmakuItem) => requested.has(item.id))
          if (found.length !== requested.size) throw new Error('指定的部分弹幕不存在，未删除任何弹幕')
          historyManager.ensureBaseline(this.danmakus, 'MCP 删除前的状态')
          this.danmakus = this.danmakus.filter((item: DanmakuItem) => !requested.has(item.id))
          this.selectedIds = this.selectedIds.filter((id: string) => !requested.has(id))
          historyManager.recordSnapshot(this.danmakus, `MCP 删除弹幕${found.length}条`, true)
          return {
            ok: true,
            changedIds: found.map((item: DanmakuItem) => item.id),
            createdIds: [],
            selectedIds: [...this.selectedIds],
            warnings: []
          }
        }

        if (field === '@editor.currentTime') {
          if (typeof method !== 'number' || !Number.isFinite(method)) throw new Error('currentTime 必须是有限数字')
          const nextTime = Math.max(0, Math.round(method))
          this.currentTime = nextTime
          this.timelineOffset = nextTime
          return { ok: true, ...emptyResult, warnings: nextTime === method ? [] : ['currentTime 已四舍五入并限制为非负值'] }
        }

        if (field === '@editor.settings') {
          if (!method || typeof method !== 'object' || Array.isArray(method)) throw new Error('编辑器设置必须是对象')
          const settings = method as Record<string, unknown>
          const allowedKeys = new Set(['screenWidth', 'screenHeight', 'maxLayers'])
          const unknownKey = Object.keys(settings).find((key) => !allowedKeys.has(key))
          if (unknownKey) throw new Error(`不支持的编辑器设置：${unknownKey}`)
          if (!Object.keys(settings).length) throw new Error('请至少提供 screenWidth、screenHeight 或 maxLayers')
          for (const [key, value] of Object.entries(settings)) {
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} 必须是有限数字`)
          }

          const warnings: string[] = []
          const width = typeof settings.screenWidth === 'number' ? settings.screenWidth : this.screenWidth
          const height = typeof settings.screenHeight === 'number' ? settings.screenHeight : this.screenHeight
          if (width < 10 || height < 10) warnings.push('屏幕宽高最小值为 10')
          this.setScreenSize(width, height)
          if (typeof settings.maxLayers === 'number') {
            if (settings.maxLayers < 1) warnings.push('最大层数最小值为 1')
            this.setMaxLayers(settings.maxLayers)
            if (this.maxLayers > Math.max(1, Math.round(settings.maxLayers))) {
              warnings.push(`当前已有弹幕使用到第 ${this.maxLayers} 层，最大层数未能调低到请求值`)
            }
          }
          return { ok: true, ...emptyResult, warnings }
        }

        const awaitsMeasurement = field === '@toolbar.center'
          || (field === '@toolbar.split' && methodParams.mode === 'letter')
        const startingDanmakus = awaitsMeasurement ? JSON.stringify(this.danmakus) : null
        const startingSelection = awaitsMeasurement ? JSON.stringify(this.selectedIds) : null
        const outcome = await applyEditorApi({
          danmakus: this.danmakus,
          selectedIds: [...this.selectedIds],
          currentTime: this.currentTime,
          screenWidth: this.screenWidth,
          screenHeight: this.screenHeight,
          maxLayers: this.maxLayers,
          allowNegativeValues: this.allowNegativeValues,
          generateId: () => this.generateNewId(),
          measureDanmakus
        }, field, method)

        if (awaitsMeasurement && (
          JSON.stringify(this.danmakus) !== startingDanmakus
          || JSON.stringify(this.selectedIds) !== startingSelection
        )) {
          return {
            ok: false,
            code: 'CONCURRENT_MODIFICATION',
            message: '编辑期间工程或选择发生变化，请重试',
            changedIds: [],
            createdIds: [],
            selectedIds: [...this.selectedIds],
            warnings: []
          }
        }

        if (outcome.changedIds.length > 0 || outcome.createdIds.length > 0) {
          historyManager.ensureBaseline(this.danmakus)
          historyManager.recordSnapshot(this.danmakus, '统一 API 操作前的编辑', true)
          this.danmakus = outcome.danmakus
          historyManager.recordSnapshot(this.danmakus, outcome.historyLabel || `字段更新：${field}`, true)
          const fieldsToCheck = outcome.changedFields?.length
            ? outcome.changedFields
            : outcome.changedField
              ? [outcome.changedField]
              : []
          if (fieldsToCheck.length) {
            outcome.changedIds.forEach((id) => {
              const item = this.danmakus.find((danmaku: DanmakuItem) => danmaku.id === id)
              if (item) {
                const patch: Record<string, unknown> = {}
                for (const changedPath of fieldsToCheck) {
                  patch[changedPath] = changedPath.split('.').reduce((current: any, key) => current?.[key], item as any)
                }
                this._checkAndMovePlayhead(patch, id)
              }
            })
          }
        }
        this.selectedIds = outcome.selectedIds
        return {
          ok: true,
          changedIds: outcome.changedIds,
          createdIds: outcome.createdIds,
          selectedIds: [...this.selectedIds],
          warnings: outcome.warnings
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = message.includes('测量')
          ? 'MEASUREMENT_FAILED'
          : message.includes('没有选中')
            ? 'NO_SELECTION'
            : message.includes('表达式')
              ? 'INVALID_EXPRESSION'
              : message.includes('字段或操作') || message.includes('字段不存在') || message.includes('字段不支持') || message.includes('不支持的字段') || message.includes('不支持的编辑操作')
                ? 'INVALID_FIELD'
                : field === '@selection.filter'
                  ? 'INVALID_FILTER'
                  : 'INVALID_OPERATION'
        return { ok: false, code, message, ...emptyResult }
      }
      })
    },

    getMcpEditorState() {
      const history = historyManager.getState()
      let timelineRange: { minStartTime: number; maxEndTime: number; spanMs: number } | null = null
      if (this.danmakus.length > 0) {
        let minStartTime = Infinity
        let maxEndTime = -Infinity
        for (const item of this.danmakus as DanmakuItem[]) {
          if (item.startTime < minStartTime) minStartTime = item.startTime
          const endTime = item.startTime + item.animation.duration
          if (endTime > maxEndTime) maxEndTime = endTime
        }
        timelineRange = {
          minStartTime,
          maxEndTime,
          spanMs: Math.max(0, maxEndTime - minStartTime)
        }
      }
      return {
        version: this.version,
        ready: !this.InitializationPhase,
        projectMode: this.projectMode,
        activeFolderProject: this.projectMode === 'folder' && this.activeFolderProjectPath
          ? {
              path: this.activeFolderProjectPath,
              name: this.activeFolderProjectConfig?.name || ''
            }
          : null,
        showProjectManager: this.showProjectManager,
        danmakuCount: this.danmakus.length,
        timelineRange,
        selectedIds: [...this.selectedIds],
        selectedCount: this.selectedIds.length,
        currentTime: this.currentTime,
        screen: { width: this.screenWidth, height: this.screenHeight },
        maxLayers: this.maxLayers,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        media: {
          hasMedia: Boolean(this.mediaUrl),
          filePath: this.mediaFilePath || null,
          durationMs: this.getCachedMediaDurationMs()
        },
        useWebglVideoExport: this.useWebglVideoExport,
        videoExport: this.getVideoExportJobSnapshot() ?? { status: 'idle' as const }
      }
    },

    async measureTextForMcp(items: Array<{ text: string; font?: string; size?: number; zRotate?: number; stroke?: boolean }>) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('测量条目不能为空')
      }
      const normalized = items.map((entry, index) => {
        if (!entry || typeof entry !== 'object') throw new Error('测量条目无效')
        if (typeof entry.text !== 'string') throw new Error('测量文本必须是字符串')
        const font = typeof entry.font === 'string' && entry.font.trim() ? entry.font : 'Microsoft YaHei'
        const size = entry.size ?? 60
        if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
          throw new Error('字号 size 必须是大于 0 的有限数字')
        }
        const zRotate = entry.zRotate ?? 0
        if (typeof zRotate !== 'number' || !Number.isFinite(zRotate)) {
          throw new Error('zRotate 必须是有限数字')
        }
        const stroke = Boolean(entry.stroke ?? false)
        const danmaku: DanmakuItem = {
          id: `mcp-measure-${index}`,
          layer: 0,
          startTime: 0,
          content: {
            text: entry.text,
            font,
            size: Math.round(size),
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
        }
        return { danmaku, zRotate }
      })

      const measurements = await measureDanmakus(normalized.map((entry) => entry.danmaku))
      const results = normalized.map(({ danmaku, zRotate }) => {
        const measure = measurements[danmaku.id]
        if (!measure) throw new Error(`文字测量结果缺失：${danmaku.id}`)
        const box = rotatedBox(measure.rawWidth, measure.rawHeight, zRotate)
        const round2 = (value: number) => Math.round(value * 100) / 100
        return {
          rawWidth: measure.rawWidth,
          rawHeight: measure.rawHeight,
          width: round2(measure.width),
          height: round2(measure.height),
          centerX: Math.round(((this.screenWidth - box.width) / 2) - box.minX),
          centerY: Math.round(((this.screenHeight - box.height) / 2) - box.minY)
        }
      })

      return {
        screen: { width: this.screenWidth, height: this.screenHeight },
        items: results
      }
    },

    getMcpDanmakus(options: { ids?: string[]; selectedOnly?: boolean; offset?: number; limit?: number } = {}) {
      const ids = options.ids ? new Set(options.ids) : null
      const selected = new Set(this.selectedIds)
      const filtered = this.danmakus.filter((item: DanmakuItem) => {
        if (ids) return ids.has(item.id)
        if (options.selectedOnly !== false) return selected.has(item.id)
        return true
      })
      const offset = Math.max(0, Math.trunc(options.offset || 0))
      const limit = Math.max(1, Math.min(500, Math.trunc(options.limit || 100)))
      return { total: filtered.length, offset, items: JSON.parse(JSON.stringify(filtered.slice(offset, offset + limit))) as DanmakuItem[] }
    },

    getMcpLogs(options: { type?: string; offset?: number; limit?: number } = {}) {
      const logs = useNoticeStore().logList.filter((entry) => !options.type || entry.type === options.type)
      const offset = Math.max(0, Math.trunc(options.offset || 0))
      const limit = Math.max(1, Math.min(500, Math.trunc(options.limit || 100)))
      const newestFirst = [...logs].reverse()
      const items = newestFirst.slice(offset, offset + limit).map((entry) => {
        let additionalInfo: unknown = entry.AdditionalInfo
        if (additionalInfo !== undefined) {
          try {
            additionalInfo = JSON.parse(JSON.stringify(additionalInfo)) as unknown
          } catch {
            additionalInfo = String(additionalInfo)
          }
        }
        return {
          id: entry.id,
          timestamp: entry.timestamp,
          type: entry.type || 'info',
          message: entry.message,
          ...(additionalInfo !== undefined ? { additionalInfo } : {})
        }
      })
      return { total: logs.length, offset, items }
    },

    getMcpHistorySnapshots() {
      return historyManager.listSnapshots()
    },

    getMcpHistorySnapshot(snapshotId: string, options: { offset?: number; limit?: number } = {}) {
      return historyManager.getSnapshotDanmakus(snapshotId, options.offset, options.limit)
    },

    getCachedMediaDurationMs(): number {
      if (!this.mediaUrl) return 0
      if (Number.isFinite(this.mediaDuration) && this.mediaDuration > 0) {
        return this.mediaDuration
      }
      const elementDuration = this.mediaElement?.duration
      if (typeof elementDuration === 'number' && Number.isFinite(elementDuration) && elementDuration > 0) {
        this.mediaDuration = elementDuration * 1000
        return this.mediaDuration
      }
      return 0
    },

    async resolveEffectiveMediaDurationMs(timeoutMs = 5000): Promise<number> {
      const cached = this.getCachedMediaDurationMs()
      if (cached > 0 || !this.mediaUrl) return cached

      const element = this.mediaElement
      if (!element) return 0

      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          element.removeEventListener('loadedmetadata', finish)
          element.removeEventListener('error', finish)
          resolve()
        }
        const timer = window.setTimeout(finish, timeoutMs)
        element.addEventListener('loadedmetadata', finish)
        element.addEventListener('error', finish)
        if (
          element.readyState >= 1 &&
          Number.isFinite(element.duration) &&
          element.duration > 0
        ) {
          finish()
        }
      })

      return this.getCachedMediaDurationMs()
    },

    getDefaultVideoExportEndMs(
      this: { getCachedMediaDurationMs: () => number; danmakus: DanmakuItem[]; mediaUrl: string },
      mediaDurationMs = this.getCachedMediaDurationMs()
    ): number {
      return this.danmakus.reduce((latest: number, danmaku: any) => Math.max(
        latest,
        danmaku.startTime + danmaku.animation.duration,
        this.mediaUrl ? mediaDurationMs : 0
      ), 0)
    },

    buildVideoExportSnapshot(): VideoExportJobSnapshot | null {
      const state = this.videoExport
      if (!state.activeJobId || state.status === 'idle') return null
      const liveElapsedMs = activeVideoExportRuntime &&
        activeVideoExportRuntime.jobId === state.activeJobId &&
        activeVideoExportRuntime.renderStartedAt > 0 &&
        state.status === 'running'
        ? Date.now() - activeVideoExportRuntime.renderStartedAt
        : state.elapsedMs
      const progress: ExportProgress = {
        completedFrames: state.progress.completedFrames,
        totalFrames: state.progress.totalFrames,
        percent: state.progress.percent,
        stage: state.progress.stage,
        ...(state.progress.detail ? { detail: state.progress.detail } : {})
      }
      const { averageFrameMs, estimatedRemainingMs } = computeVideoExportStats(progress, liveElapsedMs)
      return {
        jobId: state.activeJobId,
        source: state.source ?? 'ui',
        status: state.status as VideoExportStatus,
        outputPath: state.outputPath || null,
        delivery: state.delivery,
        encoder: state.encoder,
        startMs: state.startMs,
        endMs: state.endMs,
        durationMs: Math.max(0, state.endMs - state.startMs),
        fps: state.fps,
        quality: state.quality,
        width: state.width,
        height: state.height,
        useWebgl: state.useWebgl,
        startedAt: state.startedAt > 0 ? new Date(state.startedAt).toISOString() : new Date().toISOString(),
        finishedAt: state.finishedAt > 0 ? new Date(state.finishedAt).toISOString() : null,
        elapsedMs: liveElapsedMs,
        completedFrames: progress.completedFrames,
        totalFrames: progress.totalFrames,
        percent: progress.percent,
        stage: progress.stage,
        detail: progress.detail ?? null,
        averageFrameMs,
        estimatedRemainingMs,
        error: state.error || null
      }
    },

    getVideoExportJobSnapshot(jobId?: string): VideoExportJobSnapshot | null {
      if (jobId) {
        if (activeVideoExportRuntime && activeVideoExportRuntime.jobId === jobId) {
          return this.buildVideoExportSnapshot()
        }
        return videoExportJobs.get(jobId) ?? null
      }
      if (activeVideoExportRuntime) {
        return this.buildVideoExportSnapshot()
      }
      if (latestVideoExportJobId) {
        return videoExportJobs.get(latestVideoExportJobId) ?? null
      }
      return null
    },

    startVideoExportJob(spec: VideoExportSpec): ActiveVideoExportRuntime {
      if (activeVideoExportRuntime) {
        throw new Error('已有视频导出任务正在进行中，请等待完成或先取消后再试')
      }

      const notice = useNoticeStore()
      const jobId = `export_${Date.now()}_${++nextVideoExportSequence}`
      const abortController = new AbortController()
      let resolveCompletion!: (snapshot: VideoExportJobSnapshot) => void
      const completionPromise = new Promise<VideoExportJobSnapshot>((resolve) => {
        resolveCompletion = resolve
      })

      const runtime: ActiveVideoExportRuntime = {
        jobId,
        abortController,
        renderTimer: undefined,
        renderStartedAt: 0,
        completionPromise,
        resolveCompletion
      }
      activeVideoExportRuntime = runtime

      this.videoExport = {
        activeJobId: jobId,
        source: spec.source,
        status: 'running',
        outputPath: spec.outputPath ?? '',
        delivery: null,
        encoder: null,
        useWebgl: spec.useWebgl,
        startMs: spec.startMs,
        endMs: spec.endMs,
        fps: spec.fps,
        quality: spec.quality,
        width: spec.width,
        height: spec.height,
        progress: {
          completedFrames: 0,
          totalFrames: 0,
          percent: 0,
          stage: 'preparing'
        },
        elapsedMs: 0,
        startedAt: Date.now(),
        finishedAt: 0,
        error: ''
      }
      recordVideoExportSnapshot(this.buildVideoExportSnapshot()!)
      notice.log('开始导出视频', 'info')

      const mediaDuration = this.mediaUrl ? this.getCachedMediaDurationMs() : 0
      let exportPromise: ReturnType<typeof runVideoExportInRenderWindow>
      try {
        exportPromise = runVideoExportInRenderWindow({
          startMs: spec.startMs,
          endMs: spec.endMs,
          fps: spec.fps,
          quality: spec.quality,
          width: spec.width,
          height: spec.height,
          screenWidth: this.screenWidth,
          screenHeight: this.screenHeight,
          mediaUrl: this.mediaUrl,
          mediaFilePath: this.mediaUrl ? this.mediaFilePath : '',
          mediaDuration,
          danmakus: this.danmakus,
          outputPath: spec.outputPath,
          useWebgl: spec.useWebgl
        }, abortController.signal, (progress) => {
          if (activeVideoExportRuntime?.jobId !== jobId) return
          this.videoExport.progress = progress
          if (progress.stage === 'preparing' && runtime.renderStartedAt === 0) {
            runtime.renderStartedAt = Date.now()
            this.videoExport.elapsedMs = 0
            runtime.renderTimer = window.setInterval(() => {
              if (activeVideoExportRuntime?.jobId !== jobId || runtime.renderStartedAt <= 0) return
              this.videoExport.elapsedMs = Date.now() - runtime.renderStartedAt
            }, 500)
          }
        })
      } catch (error) {
        exportPromise = Promise.reject(error)
      }

      void (async () => {
        try {
          const result = await exportPromise
          if (runtime.renderTimer !== undefined) {
            window.clearInterval(runtime.renderTimer)
            runtime.renderTimer = undefined
          }
          if (runtime.renderStartedAt > 0) {
            this.videoExport.elapsedMs = Date.now() - runtime.renderStartedAt
            runtime.renderStartedAt = 0
          }
          this.videoExport.finishedAt = Date.now()

          if (result.canceledByUser) {
            this.videoExport.status = 'canceled'
            this.videoExport.error = ''
            if (abortController.signal.aborted) {
              notice.log('视频导出已取消', 'info')
            }
          } else {
            const finalTotalFrames = result.totalFrames ?? this.videoExport.progress.totalFrames
            this.videoExport.status = 'completed'
            this.videoExport.outputPath = result.path ?? this.videoExport.outputPath
            this.videoExport.delivery = result.delivery
            this.videoExport.encoder = result.encoder === 'ffmpeg' ? 'ffmpeg' : 'webcodecs'
            this.videoExport.error = ''
            if (finalTotalFrames > 0) {
              this.videoExport.progress = {
                completedFrames: finalTotalFrames,
                totalFrames: finalTotalFrames,
                percent: 1,
                stage: 'finalizing'
              }
            } else {
              this.videoExport.progress = {
                ...this.videoExport.progress,
                percent: 1,
                stage: 'finalizing'
              }
            }
            const durationText = formatDuration(this.videoExport.elapsedMs)
            const doneMessage = result.delivery === 'download'
              ? `视频导出完成，已触发浏览器下载：${this.videoExport.outputPath} 耗时：${durationText}`
              : `视频导出完成：${this.videoExport.outputPath} 耗时：${durationText}`
            notice.log(doneMessage, 'success')
            if (spec.source === 'ui') {
              notice.alert(doneMessage, 'success', '视频导出成功', result)
            }
          }
        } catch (error) {
          if (runtime.renderTimer !== undefined) {
            window.clearInterval(runtime.renderTimer)
            runtime.renderTimer = undefined
          }
          if (runtime.renderStartedAt > 0) {
            this.videoExport.elapsedMs = Date.now() - runtime.renderStartedAt
            runtime.renderStartedAt = 0
          }
          this.videoExport.finishedAt = Date.now()

          if (error instanceof DOMException && error.name === 'AbortError') {
            this.videoExport.status = 'canceled'
            this.videoExport.error = ''
            notice.log('视频导出已取消', 'info')
          } else {
            const message = error instanceof Error ? error.message : String(error)
            this.videoExport.status = 'failed'
            this.videoExport.error = message
            notice.log(`视频导出失败：${message}`, 'error')
            if (spec.source === 'ui') {
              notice.alert(message, 'error', '视频导出失败')
            }
          }
        } finally {
          const finalSnapshot = this.buildVideoExportSnapshot()!
          recordVideoExportSnapshot(finalSnapshot)
          if (activeVideoExportRuntime?.jobId === jobId) {
            activeVideoExportRuntime = null
          }
          resolveCompletion(finalSnapshot)
        }
      })()

      return runtime
    },

    startVideoExportFromDialog(options: {
      startMs: number
      endMs: number
      fps: number
      quality: ExportQuality
      width: number
      height: number
      useWebgl: boolean
    }): Promise<VideoExportJobSnapshot> {
      if (activeVideoExportRuntime || videoExportPreflightBusy) {
        throw new Error('已有视频导出任务正在进行中，请等待完成或先取消后再试')
      }
      const runtime = this.startVideoExportJob({
        source: 'ui',
        startMs: options.startMs,
        endMs: options.endMs,
        fps: options.fps,
        quality: options.quality,
        width: options.width,
        height: options.height,
        useWebgl: options.useWebgl
      })
      return runtime.completionPromise
    },

    async exportVideoForMcp(options: VideoExportOptions = {}) {
      if (this.InitializationPhase) {
        throw new Error('编辑器尚未加载工程，暂不能导出视频')
      }
      if (!isTauriRuntime()) {
        throw new Error('MCP 视频导出仅支持桌面端（Tauri）运行环境')
      }
      if (activeVideoExportRuntime || videoExportPreflightBusy) {
        throw new Error('已有视频导出任务正在进行中，请等待完成或先取消后再试')
      }
      if (typeof options.outputPath !== 'string' || !options.outputPath.trim()) {
        throw new Error('outputPath 不能为空')
      }

      const useWebgl = typeof options.useWebgl === 'boolean' ? options.useWebgl : this.useWebglVideoExport
      if (!useWebgl && this.mediaUrl && !this.mediaFilePath) {
        throw new Error('独立渲染窗口需要本地媒体文件路径，请从本地文件重新导入视频后再导出')
      }

      const fps = options.fps ?? 60
      if (!VALID_EXPORT_FPS.has(fps)) {
        throw new Error('导出帧率仅支持 24、30、60 或 120 fps')
      }

      const quality = options.quality ?? 'very-high'
      if (!VALID_EXPORT_QUALITIES.has(quality)) {
        throw new Error('不支持的导出画质选项')
      }

      const startMs = options.startMs ?? 0
      if (!Number.isFinite(startMs) || startMs < 0) {
        throw new Error('导出开始时间必须为大于等于 0 的有限数字')
      }

      if (options.endMs !== undefined && (!Number.isFinite(options.endMs) || options.endMs <= startMs)) {
        throw new Error('导出结束时间必须大于开始时间')
      }

      const waitMs = options.waitMs ?? 15000
      if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 60000) {
        throw new Error('waitMs 必须在 0 到 60000 毫秒之间')
      }

      const { width, height } = resolveVideoExportDimensions(
        this.screenWidth,
        this.screenHeight,
        options.width,
        options.height
      )

      videoExportPreflightBusy = true
      let runtime: ActiveVideoExportRuntime
      try {
        const effectiveMediaDuration = this.mediaUrl
          ? await this.resolveEffectiveMediaDurationMs()
          : 0

        let endMs: number
        if (options.endMs !== undefined) {
          endMs = options.endMs
        } else {
          if (this.mediaUrl && effectiveMediaDuration <= 0) {
            throw new Error('未能获取当前视频时长，请确认媒体已加载完成或显式传入 endMs')
          }
          endMs = this.getDefaultVideoExportEndMs(effectiveMediaDuration)
          if (!Number.isFinite(endMs) || endMs <= startMs) {
            throw new Error('当前工程没有可用于推导默认时长的视频或弹幕范围，请显式传入 endMs')
          }
        }

        const preparedOutputPath = await prepareVideoExportPath(options.outputPath.trim())

        runtime = this.startVideoExportJob({
          source: 'mcp',
          outputPath: preparedOutputPath,
          startMs,
          endMs,
          fps,
          quality,
          width,
          height,
          useWebgl
        })
      } finally {
        videoExportPreflightBusy = false
      }

      const settled = waitMs > 0
        ? await waitForPromiseWithTimeout(runtime.completionPromise, waitMs)
        : null

      if (!settled) {
        return {
          ok: true,
          completed: false,
          ...(this.getVideoExportJobSnapshot(runtime.jobId)!)
        }
      }

      if (settled.status === 'failed') {
        throw new Error(settled.error || '视频导出失败')
      }

      return {
        ok: true,
        completed: settled.status === 'completed',
        ...settled
      }
    },

    async getVideoExportStatusForMcp(options: { jobId?: string; waitMs?: number } = {}) {
      const waitMs = options.waitMs ?? 0
      if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 60000) {
        throw new Error('waitMs 必须在 0 到 60000 毫秒之间')
      }

      if (options.jobId !== undefined) {
        if (typeof options.jobId !== 'string' || !options.jobId.trim()) {
          throw new Error('jobId 不能为空字符串')
        }
        const jobId = options.jobId.trim()
        let snapshot = this.getVideoExportJobSnapshot(jobId)
        if (!snapshot) {
          throw new Error(`未找到视频导出任务: ${jobId}`)
        }
        if (
          snapshot.status === 'running' &&
          waitMs > 0 &&
          activeVideoExportRuntime?.jobId === jobId
        ) {
          const finished = await waitForPromiseWithTimeout(activeVideoExportRuntime.completionPromise, waitMs)
          snapshot = finished ?? this.getVideoExportJobSnapshot(jobId)!
        }
        return {
          ok: true,
          hasActiveJob: activeVideoExportRuntime !== null,
          ...snapshot
        }
      }

      if (activeVideoExportRuntime && waitMs > 0) {
        const activeRuntime = activeVideoExportRuntime
        const finished = await waitForPromiseWithTimeout(activeRuntime.completionPromise, waitMs)
        const snapshot = finished ?? this.getVideoExportJobSnapshot(activeRuntime.jobId)
        if (!snapshot) {
          return {
            ok: true,
            hasActiveJob: false,
            status: 'idle' as const
          }
        }
        return {
          ok: true,
          hasActiveJob: activeVideoExportRuntime !== null,
          ...snapshot
        }
      }

      const snapshot = this.getVideoExportJobSnapshot()
      if (!snapshot) {
        return {
          ok: true,
          hasActiveJob: false,
          status: 'idle' as const
        }
      }

      return {
        ok: true,
        hasActiveJob: activeVideoExportRuntime !== null,
        ...snapshot
      }
    },

    async cancelVideoExport(jobId?: string) {
      if (jobId !== undefined) {
        if (typeof jobId !== 'string' || !jobId.trim()) {
          throw new Error('jobId 不能为空字符串')
        }
        const trimmed = jobId.trim()
        if (activeVideoExportRuntime && activeVideoExportRuntime.jobId === trimmed) {
          const runtime = activeVideoExportRuntime
          runtime.abortController.abort()
          const snapshot = await runtime.completionPromise
          return {
            ok: true,
            canceled: snapshot.status === 'canceled',
            alreadyFinished: false,
            ...snapshot
          }
        }
        const existing = videoExportJobs.get(trimmed)
        if (!existing) {
          throw new Error(`未找到视频导出任务: ${trimmed}`)
        }
        return {
          ok: true,
          canceled: false,
          alreadyFinished: true,
          ...existing
        }
      }

      if (!activeVideoExportRuntime) {
        const latest = this.getVideoExportJobSnapshot()
        return {
          ok: true,
          canceled: false,
          alreadyFinished: Boolean(latest),
          ...(latest ?? { status: 'idle' as const })
        }
      }

      const runtime = activeVideoExportRuntime
      runtime.abortController.abort()
      const snapshot = await runtime.completionPromise
      return {
        ok: true,
        canceled: snapshot.status === 'canceled',
        alreadyFinished: false,
        ...snapshot
      }
    },

    async cancelVideoExportForMcp(options: { jobId?: string } = {}) {
      return this.cancelVideoExport(options.jobId)
    },

    async saveFolderProjectForMcp(backup = false) {
      return withEditorOperationLock(async () => {
        if (this.projectMode !== 'folder' || !this.activeFolderProjectPath) {
          throw new Error('保存和备份仅支持已打开的文件夹工程')
        }
        const payload = backup
          ? await backupFolderProject(this.activeFolderProjectPath, this.exportProject(), this.pendingFolderMediaPath)
          : await saveFolderProject(this.activeFolderProjectPath, this.exportProject(), this.pendingFolderMediaPath)
        await this.applyFolderProjectPayload(payload, true)
        await this.refreshFileSystemState().catch((err) => console.warn('[MCP] 刷新工程列表失败:', err))
        const notice = useNoticeStore()
        notice.log(backup ? '[MCP] 文件夹工程已保存并备份' : '[MCP] 文件夹工程已保存', 'success')
        return {
          ok: true,
          projectMode: this.projectMode,
          projectPath: this.activeFolderProjectPath,
          projectName: this.activeFolderProjectConfig?.name || '',
          lastBackUpAt: this.activeFolderProjectConfig?.lastBackUpAt || null
        }
      })
    },

    async refreshFileSystemState(): Promise<FileSystemState> {
      const fsState = await getFileSystemState()
      this.fileSystemState = fsState
      if (!this.globalSettingsLoaded) {
        this.applyGlobalSettings(fsState.globalSettings)
      }
      return fsState
    },

    async checkFolderProjectPathState(name: string, parentDir?: string): Promise<ProjectPathCheck> {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('工程名称不能为空')
      }
      const trimmedParent = parentDir?.trim()
      const resolvedParent = trimmedParent || (this.fileSystemState ?? (await this.refreshFileSystemState())).defaultProjectsDir
      return checkFolderProjectPath(resolvedParent, trimmedName)
    },

    async activateFolderProjectPayload(
      payload: FolderProjectPayload,
      options: { logMessage: string; closeManager?: boolean }
    ) {
      this.pausePlayback()
      await this.applyFolderProjectPayload(payload)
      await this.refreshFileSystemState().catch((err) => console.warn('[工程] 刷新工程列表失败:', err))
      if (options.closeManager !== false) {
        this.showProjectManager = false
      }
      const notice = useNoticeStore()
      notice.log(options.logMessage, 'success')
      if (payload.warnings?.length) {
        for (const warning of payload.warnings) {
          notice.alert(warning, 'warn', '媒体文件警告')
        }
      }
      return {
        ok: true,
        projectMode: this.projectMode,
        projectPath: payload.path,
        projectName: payload.config.name,
        config: payload.config,
        mediaFile: payload.mediaFile ?? null,
        warnings: payload.warnings ?? [],
        danmakuCount: this.danmakus.length,
        screen: { width: this.screenWidth, height: this.screenHeight },
        ready: !this.InitializationPhase
      }
    },

    async createFolderProjectFromInput(input: {
      name: string
      parentDir?: string
      fromCurrent?: boolean
      fromProject?: any
      fromProjectPath?: string
      mediaPath?: string
      copyMedia?: boolean
      description?: string
      closeManager?: boolean
    }) {
      return withEditorOperationLock(async () => {
        const trimmedName = input.name?.trim() || ''
        if (!trimmedName) {
          throw new Error('工程名称不能为空')
        }
        const trimmedFromPath = input.fromProjectPath?.trim() || ''
        const sourceCount = (input.fromCurrent ? 1 : 0)
          + (input.fromProject !== undefined ? 1 : 0)
          + (trimmedFromPath ? 1 : 0)
        if (sourceCount > 1) {
          throw new Error('fromCurrent、fromProject 和 fromProjectPath 最多只能指定一个')
        }
        const resolvedParent = input.parentDir?.trim()
          || (this.fileSystemState ?? (await this.refreshFileSystemState())).defaultProjectsDir
        const fromProject = input.fromCurrent ? this.exportProject() : input.fromProject
        const payload = await createFolderProject({
          parentDir: resolvedParent,
          name: trimmedName,
          fromProject,
          fromProjectPath: trimmedFromPath || undefined,
          mediaPath: input.mediaPath?.trim() || undefined,
          copyMedia: input.copyMedia ?? true,
          description: input.description ?? ''
        })
        return this.activateFolderProjectPayload(payload, {
          logMessage: '[工程] 文件夹工程已创建',
          closeManager: input.closeManager
        })
      })
    },

    async loadFolderProjectFromPath(projectPath: string, closeManager = true) {
      return withEditorOperationLock(async () => {
        const trimmedPath = projectPath?.trim() || ''
        if (!trimmedPath) {
          throw new Error('工程路径不能为空')
        }
        const payload = await loadFolderProject(trimmedPath)
        return this.activateFolderProjectPayload(payload, {
          logMessage: '[工程] 文件夹工程已加载',
          closeManager
        })
      })
    },

    async importFolderProjectFromPath(projectPath?: string, closeManager = true) {
      return withEditorOperationLock(async () => {
        if (projectPath !== undefined && !projectPath.trim()) {
          throw new Error('工程路径不能为空')
        }
        const payload = await importFolderProject(projectPath?.trim() || undefined)
        if (!payload) {
          return null
        }
        return this.activateFolderProjectPayload(payload, {
          logMessage: '[工程] 文件夹工程已导入',
          closeManager
        })
      })
    },

    async editFolderProjectByInput(input: EditFolderProjectInput) {
      return withEditorOperationLock(async () => {
        if (!input.projectPath?.trim()) {
          throw new Error('工程路径不能为空')
        }
        const isEditingActive = this.projectMode === 'folder'
          && isSameFsPath(this.activeFolderProjectPath, input.projectPath)
        const prevMediaConfig = JSON.stringify(this.activeFolderProjectConfig?.media ?? null)
        const summary = await editFolderProject(input)
        if (isEditingActive) {
          this.activeFolderProjectPath = summary.path
          this.activeFolderProjectConfig = summary.config
          const mediaConfigChanged = input.mediaUseExternalLink !== undefined
            || input.mediaExternalPath !== undefined
            || prevMediaConfig !== JSON.stringify(summary.config.media ?? null)
          if (mediaConfigChanged) {
            this.pendingFolderMediaPath = ''
            if (summary.mediaPath) {
              await this.resolveMediaPath(summary.mediaPath)
            } else {
              this.setMediaSource('', '')
            }
          }
        }
        const fsState = await this.refreshFileSystemState()
        useNoticeStore().log('[工程] 工程配置已更新', 'success')
        return {
          ok: true,
          project: summary,
          isActiveProject: isEditingActive,
          projectsCount: fsState.projects.length
        }
      })
    },

    async deleteFolderProjectByPath(projectPath: string, requireRegistered = true) {
      return withEditorOperationLock(async () => {
        const trimmedPath = projectPath?.trim() || ''
        if (!trimmedPath) {
          throw new Error('工程路径不能为空')
        }
        let resolvedPath = trimmedPath
        if (requireRegistered) {
          const fsState = await this.refreshFileSystemState()
          const matched = fsState.projects.find((item) => isSameFsPath(item.path, trimmedPath))
          if (!matched) {
            throw new Error(`未在已注册工程列表中找到该文件夹工程：${trimmedPath}`)
          }
          resolvedPath = matched.path
        }
        await removeFolderProject(resolvedPath)
        const deletedActive = this.projectMode === 'folder'
          && isSameFsPath(this.activeFolderProjectPath, resolvedPath)
        if (deletedActive) {
          await this.enterSingleFileMode(false)
        }
        const fsState = await this.refreshFileSystemState()
        useNoticeStore().log(`[工程] 工程已删除：${resolvedPath}`, 'success')
        return {
          ok: true,
          deletedPath: resolvedPath,
          wasActiveProject: deletedActive,
          projectMode: this.projectMode,
          projectsCount: fsState.projects.length
        }
      })
    },

    async applyImportedProject(
      project: any,
      options: { closeManager?: boolean; logMessage?: string } = {}
    ) {
      if (!project || typeof project !== 'object' || Array.isArray(project)) {
        throw new Error('工程文件格式无效（根节点必须是对象）')
      }
      if (project.danmakus !== undefined && !Array.isArray(project.danmakus)) {
        throw new Error('工程文件格式无效（danmakus 必须是数组）')
      }
      this.pausePlayback()
      await this.enterSingleFileMode(false)
      await this.applyProject(project)
      historyManager.clear()
      historyManager.recordSnapshot(this.danmakus, `导入工程(${this.danmakus.length}条弹幕)`)
      // 标记导入完成，触发缓冲池重构
      this.importTimestamp = Date.now()
      if (options.closeManager) {
        this.showProjectManager = false
      }
      if (options.logMessage) {
        useNoticeStore().log(options.logMessage, 'success')
      }
      return {
        ok: true,
        projectMode: this.projectMode,
        danmakuCount: this.danmakus.length,
        screen: { width: this.screenWidth, height: this.screenHeight },
        mediaUrl: this.mediaUrl || null,
        ready: !this.InitializationPhase
      }
    },

    async importSingleProjectFromPath(jsonPath: string) {
      return withEditorOperationLock(async () => {
        const trimmedPath = jsonPath?.trim() || ''
        if (!trimmedPath) {
          throw new Error('工程文件路径不能为空')
        }
        const project = await readProjectJsonFile(trimmedPath)
        return this.applyImportedProject(project, {
          closeManager: true,
          logMessage: `[工程] 已导入单文件工程：${trimmedPath}`
        })
      })
    },

    async applyImportedXmlText(xml: string, options: { closeManager?: boolean } = {}) {
      const notice = useNoticeStore()
      const { danmakus, errors } = parseXML(xml, {
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        durationOffsetMs: this.importXmlDurationOffsetEnabled ? -50 : 0,
        maxLayers: this.maxLayers
      })

      this.pausePlayback()
      this.danmakus = danmakus
      this.selectedIds = []
      this.currentTime = 0

      await this.enterSingleFileMode(false)
      historyManager.clear()
      historyManager.recordSnapshot(this.danmakus)

      errors.forEach((error) => {
        notice.log('[XML 导入] 已跳过异常弹幕:' + error.message + '，导出日志以获取更多信息', 'warn', error.metadata)
      })

      if (errors.length > 0) {
        console.warn(`[XML 导入] 共跳过 ${errors.length} 条异常弹幕`)
      }

      // 标记导入完成，触发缓冲池重构
      this.importTimestamp = Date.now()
      if (options.closeManager) {
        this.showProjectManager = false
      }

      notice.alert(
        errors.length === 0 ? `共 ${danmakus.length} 条，未见异常弹幕` : `共 ${danmakus.length} 条，共跳过 ${errors.length} 条异常弹幕`,
        errors.length === 0 ? 'success' : 'warn',
        'XML导入成功'
      )

      return {
        ok: true,
        projectMode: this.projectMode,
        danmakuCount: danmakus.length,
        skippedCount: errors.length,
        screen: { width: this.screenWidth, height: this.screenHeight },
        ready: !this.InitializationPhase
      }
    },

    async importXmlFromPath(xmlPath: string) {
      return withEditorOperationLock(async () => {
        const trimmedPath = xmlPath?.trim() || ''
        if (!trimmedPath) {
          throw new Error('XML 文件路径不能为空')
        }
        const xml = await readXmlFile(trimmedPath)
        return this.applyImportedXmlText(xml, { closeManager: true })
      })
    },

    async skipProjectManager() {
      return withEditorOperationLock(async () => {
        const wasInitializationPhase = this.InitializationPhase
        if (wasInitializationPhase) {
          this.pausePlayback()
          await this.enterSingleFileMode(true)
          useNoticeStore().log('[工程] 已跳过文件夹工程并进入单文件模式', 'info')
        }
        this.showProjectManager = false
        return {
          ok: true,
          enteredSingleFileMode: wasInitializationPhase,
          projectMode: this.projectMode,
          danmakuCount: this.danmakus.length,
          ready: !this.InitializationPhase
        }
      })
    },

    setTime(time: number) {
      this.currentTime = time
    },

    applyGlobalSettings(settings: GlobalSettings) {
      this.playheadStepMs = settings.playheadStepMs
      this.danmakuDuration = { ...settings.danmakuDuration }
      this.aggressiveOptimization = settings.aggressiveOptimization
      this.selectedDanmakuTemplateName = settings.selectedDanmakuTemplateName || ''
      this.replaceDefaultDanmakuWithTemplate = settings.replaceDefaultDanmakuWithTemplate || false
      this.useWebglVideoExport = typeof settings.useWebglVideoExport === 'boolean'
        ? settings.useWebglVideoExport
        : true
      this.globalSettingsLoaded = true
      if (this.danmakuTemplatesLoaded && !this.danmakuTemplates.some(
        (template) => template.name === this.selectedDanmakuTemplateName
      )) {
        this.selectedDanmakuTemplateName = this.danmakuTemplates[0]?.name || ''
        this.persistGlobalSettings()
      }
    },

    persistGlobalSettings() {
      const settings: GlobalSettings = {
        playheadStepMs: this.playheadStepMs,
        danmakuDuration: { ...this.danmakuDuration },
        aggressiveOptimization: this.aggressiveOptimization,
        selectedDanmakuTemplateName: this.selectedDanmakuTemplateName || null,
        replaceDefaultDanmakuWithTemplate: this.replaceDefaultDanmakuWithTemplate,
        useWebglVideoExport: this.useWebglVideoExport
      }

      if (isTauriRuntime()) {
        globalSettingsSaveQueue = globalSettingsSaveQueue
          .then(() => updateGlobalSettings(settings))
          .catch((error) => useNoticeStore().log('[配置] 保存全局设置失败', 'error', error))
      } else {
        localStorage.setItem(GLOBAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      }
    },

    setPlayheadStepMs(value: number) {
      this.playheadStepMs = value
      this.persistGlobalSettings()
    },
     
    startPlayback() {
      this.playing = true
      const startTime = performance.now()
      const initialTime = this.currentTime

      const loop = () => {
        if (!this.playing) return
        // 计算当前播放头：暂停时的 currentTime + 本次播放经过的时间
        this.currentTime = initialTime + (performance.now() - startTime)
        requestAnimationFrame(loop)
      }
      loop()
    },

    pausePlayback() {
      this.playing = false
    },

    saveToLocal() {
      const notice = useNoticeStore()
      if (this.projectMode === 'folder') {
        notice.log('[缓存] 文件夹工程不会写入本地缓存，请使用保存工程', 'warn')
        return
      }

      const project = this.exportProject()
      saveProject(project)
      console.log('已保存到本地')
    },

    async loadFromLocal() {
      const notice = useNoticeStore()
      if (this.projectMode === 'folder') {
        notice.log('[缓存] 文件夹工程不会从本地缓存恢复', 'warn')
        return
      }

      const project = loadProject()

      if (!project) {
        console.warn('没有可加载的项目')
        return
      }

      await this.applyProject(project)
      historyManager.recordSnapshot(this.danmakus, `加载工程(${this.danmakus.length}条弹幕)`)

      console.log('加载完成')
    },

    async downloadProject() {
      if (this.projectMode === 'folder') {
        if (this.activeFolderProjectPath) {
          await this.saveActiveFolderProject()
        } else {
          useNoticeStore().log('[工程] 当前没有可保存的文件夹工程', 'warn')
        }
        return
      }

      const project = this.exportProject()

      const blob = new Blob(
        [JSON.stringify(project, null, 2)],
        { type: 'application/json' }
      )

      await saveBlobWithFallback(blob, 'project.json', {
        description: 'JSON 工程文件',
        accept: {
          'application/json': ['.json']
        }
      })
    },

    async downloadXml() {
      const xml = toXML(this.danmakus, {
        useRatioPosition: this.exportXmlAsRatio,
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        durationOffsetMs: this.exportXmlDurationOffsetEnabled ? 50 : 0
      })
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })

      await saveBlobWithFallback(blob, 'danmaku.xml', {
        description: 'XML 弹幕文件',
        accept: {
          'application/xml': ['.xml'],
          'text/xml': ['.xml']
        }
      })
    },

    async saveBlob(
      blob: Blob,
      filename: string,
      acceptType: SavePickerAcceptType
    ) {
      await saveBlobWithFallback(blob, filename, acceptType)
    },

    loadFromFile(file: File) {
      const notice = useNoticeStore()
      const reader = new FileReader()

      reader.onload = async () => {
        try {
          const project = JSON.parse(reader.result as string)
          await withEditorOperationLock(() => this.applyImportedProject(project))
          console.log('文件加载成功')
        } catch (e) {
          console.error('文件解析失败', e)
          notice.alert((e instanceof Error ? e.message : String(e)), 'error', '文件解析失败: ', e)
        }
      }

      reader.readAsText(file)
    },

    loadXmlFromFile(file: File) {
      const notice = useNoticeStore()
      const reader = new FileReader()

      reader.onload = async () => {
        try {
          const xml = String(reader.result ?? '')
          await withEditorOperationLock(() => this.applyImportedXmlText(xml))
        } catch (error) {
          notice.alert(error instanceof Error ? error.message : String(error), 'error', 'XML解析失败', error)
        }
      }

      reader.readAsText(file)
    },

    selectDanmaku(id: string, multi = false) {
      if (multi) {
        if (this.selectedIds.includes(id)) {
          this.selectedIds = this.selectedIds.filter(i => i !== id)
        } else {
          this.selectedIds.push(id)
        }
      } else {
        this.selectedIds = [id]
      }
    },

    clearSelection() {
      this.selectedIds = []
    },
    
    _applyDeepPatch(id: string, obj: any, patch: any) {
      for (const [key, value] of Object.entries(patch)) {
        // console.log('写入:', key, value, typeof value)

        // 情况1：路径写法（优先级最高）
        if (key.includes('.')) {
          const keys = key.split('.')
          let current = obj

          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i]
            if (!current[k] || typeof current[k] !== 'object') {
              current[k] = {}
            }
            current = current[k]
          }

          current[keys[keys.length - 1]] = value
          continue
        }

        // 情况2：value 是对象 → 递归 merge
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          if (!obj[key] || typeof obj[key] !== 'object') {
            obj[key] = {}
          }

          this._applyDeepPatch(id, obj[key], value)
          continue
        }

        // 情况3：普通值
        obj[key] = value
      }

      // 防抖处理：清除之前的计时器，设置新的100ms延迟
      if (this._applyDeepPatchDebounceTimer) {
        clearTimeout(this._applyDeepPatchDebounceTimer)
      }

      this._applyDeepPatchDebounceTimer = setTimeout(() => {
        historyManager.recordSnapshot(this.danmakus)
        this._checkAndMovePlayhead(patch, id)
        this._applyDeepPatchDebounceTimer = null
      }, 100)
    },

    updateDanmaku(id: string, patch: any) {
      // console.log('正在更新弹幕:', id, '补丁内容:', patch);
      const d = this.danmakus.find((d: any) => d.id === id)
      if (!d) return

      this._applyDeepPatch(id, d, patch)
    },

    updateSelectedDanmakus(patch: any) {
      this.danmakus.forEach((d: any) => {
        if (this.selectedIds.includes(d.id)) {
          this._applyDeepPatch(d.id, d, patch)
        }
      })
    },
    
    /**
     * 检查是否需要移动播放头
     */
    _checkAndMovePlayhead(patch: any, danmakuId: string): void {
      const hasDuration = patch['animation.duration'] !== undefined || 
                      (patch.animation?.duration !== undefined)
      const hasStartTime = patch['startTime'] !== undefined || 
                      (patch.startTime !== undefined)
      const hasChangedGrop1 = patch['transform.end.x'] !== undefined || 
                      (patch.transform?.end?.x !== undefined) ||
                      patch['transform.end.y'] !== undefined || 
                      (patch.transform?.end?.y !== undefined) ||
                      patch['opacity.to'] !== undefined || 
                      (patch.opacity?.to !== undefined)
      const hasChangedGrop2 = !(hasChangedGrop1 || hasDuration || hasStartTime)
      if (hasChangedGrop1) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const endTime = danmaku.startTime + danmaku.animation.duration
          this.setTime(endTime)
          // console.log('移动播放头到弹幕结束位置:', endTime)
        }
      }
      if (hasChangedGrop2) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const startTime = danmaku.startTime
          this.setTime(startTime)
          // console.log('移动播放头到弹幕开始位置:', startTime)
        }
      }
      if (hasDuration) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const endTime = danmaku.startTime + danmaku.animation.duration
            this.setTime(endTime)
            // console.log('移动播放头到弹幕结束位置:', endTime)
          }
        }, 10)
      }
      if (hasStartTime) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const startTime = danmaku.startTime
            this.setTime(startTime)
            // console.log('移动播放头到弹幕开始位置:', startTime)
          }
        }, 10)
      }
    },

    setMediaSource(url: string, path = '') {
      if (!url || this.mediaUrl !== url) {
        this.mediaDuration = 0
      }
      this.mediaUrl = url
      this.mediaFilePath = path
    },

    setImportedMediaSource(url: string, path = '') {
      this.setMediaSource(url, path)
      if (this.projectMode === 'folder' && path) {
        this.pendingFolderMediaPath = path
      }
    },

    setMediaDuration(duration: number) {
      this.mediaDuration = duration
    },

    setMediaFilePath(path: string) {
      this.mediaFilePath = path
    },

    async resolveMediaPath(path?: string) {
      const notice = useNoticeStore()
      path = path ?? this.mediaFilePath
      if (!path) return

      this.mediaFilePath = path

      if (!isTauriRuntime()) {
        if (path.startsWith('file://')) {
          this.setMediaSource(path, path)
        }
        return
      }

      try {
        const media = await registerMediaPath(path)
        this.setMediaSource(media.url, media.path)
        notice.log('成功读取媒体文件', 'success')
      } catch (error) {
        notice.alert('无法读取工程中指向的媒体文件，请重新选择', 'error', '错误', path + error)
        this.setMediaSource('', this.mediaFilePath)
      }
    },

    setMediaElement(element: HTMLMediaElement | null) {
      this.mediaElement = element
    },

    async enterSingleFileMode(loadCached = true): Promise<void> {
      this.InitializationPhase = false
      this.projectMode = 'single'
      this.activeFolderProjectPath = ''
      this.activeFolderProjectConfig = null
      this.pendingFolderMediaPath = ''

      if (loadCached) {
        const project = loadProject()
        if (project) {
          await this.applyProject(project)
        }
      }
    },

    async applyFolderProjectPayload(payload: FolderProjectPayload, isEditing = false) {
      this.InitializationPhase = false
      this.projectMode = 'folder'
      this.activeFolderProjectPath = payload.path
      this.activeFolderProjectConfig = payload.config
      this.pendingFolderMediaPath = ''

      await this.applyProject(payload.project, isEditing)

      if (payload.mediaFile?.path) {
        this.setMediaSource(convertMediaPathToUrl(payload.mediaFile.path), payload.mediaFile.path)
      }

      historyManager.clear()
      historyManager.recordSnapshot(this.danmakus, `加载文件夹工程(${this.danmakus.length}条弹幕)`)
      this.importTimestamp = Date.now()
    },

    async saveActiveFolderProject() {
      const notice = useNoticeStore()
      if (this.projectMode !== 'folder' || !this.activeFolderProjectPath) {
        notice.log('[工程] 当前没有可保存的文件夹工程', 'warn')
        return
      }

      try {
        const payload = await saveFolderProject(
          this.activeFolderProjectPath,
          this.exportProject(),
          this.pendingFolderMediaPath
        )
        await this.applyFolderProjectPayload(payload, true)
        void this.refreshFileSystemState().catch((err) => console.warn('[工程] 刷新工程列表失败:', err))
        notice.log('[工程] 文件夹工程已保存', 'success')
      } catch (error) {
        notice.alert(error instanceof Error ? error.message : String(error), 'error', '保存文件夹工程失败', error)
      }
    },

    async backupActiveFolderProject() {
      const notice = useNoticeStore()
      if (this.projectMode !== 'folder' || !this.activeFolderProjectPath) {
        notice.log('[工程] 单文件工程不支持文件夹备份', 'warn')
        return
      }

      try {
        const payload = await backupFolderProject(
          this.activeFolderProjectPath,
          this.exportProject(),
          this.pendingFolderMediaPath
        )
        await this.applyFolderProjectPayload(payload, true)
        void this.refreshFileSystemState().catch((err) => console.warn('[工程] 刷新工程列表失败:', err))
        notice.log('[工程] 文件夹工程已保存并备份', 'success')
      } catch (error) {
        notice.alert(error instanceof Error ? error.message : String(error), 'error', '备份文件夹工程失败', error)
      }
    },
    
    // 时间轴视图相关操作
    setTimelineView(scale: number, offset: number, scrollTop?: number) {
      if (Number.isFinite(scale)) {
        this.timelineScale = Math.max(0.01, Math.min(3, scale))
      }

      if (Number.isFinite(offset)) {
        this.timelineOffset = Math.max(0, offset)
      }

      if (Number.isFinite(scrollTop)) {
        this.timelineScrollTop = Math.max(0, scrollTop as number)
      }
    },

    // 工程参数加载
    async applyProject(project: any, isEditing = false) {
      this.danmakus = project.danmakus || []
      if (!isEditing) {
        this.selectedIds = []
      }

      const mediaPath = getProjectMediaPath(project.media)

      if (mediaPath) {
        await this.resolveMediaPath(mediaPath)
      } else if (project.media?.url) {
        this.setMediaSource(project.media.url, '')
      } else {
        this.setMediaSource('', '')
      }

      if (typeof project.player?.screenWidth === 'number') {
        this.screenWidth = project.player.screenWidth
      }
      if (typeof project.player?.screenHeight === 'number') {
        this.screenHeight = project.player.screenHeight
      }
      if (typeof project.player?.screenScale === 'number') {
        this.screenScale = project.player.screenScale
      }
      if (typeof project.player?.maxLayers === 'number') {
        this.setMaxLayers(project.player.maxLayers)
      }
      if (typeof project.preprocess?.allowNegativeValues === 'boolean') {
        this.allowNegativeValues = project.preprocess.allowNegativeValues
      }
      if (typeof project.timeline?.showSpectrogram === 'boolean') {
        this.showSpectrogram = project.timeline.showSpectrogram
      }
      if (typeof project.timeline?.spectrogramColorScheme === 'string') {
        this.spectrogramColorScheme = project.timeline.spectrogramColorScheme
      }
      if (typeof project.timeline?.spectrogramCustomColor === 'string') {
        this.spectrogramCustomColor = project.timeline.spectrogramCustomColor
      }
      if (typeof project.timeline?.danmakuColorForBlock === 'boolean') {
        this.danmakuColorForBlock = project.timeline.danmakuColorForBlock
      }

      this.currentTime = typeof project.timeline?.currentTime === 'number'
        ? Math.max(0, Math.round(project.timeline.currentTime))
        : 0

      this.setTimelineView(
        typeof project.timeline?.scale === 'number' ? project.timeline.scale : 0.1,
        typeof project.timeline?.offset === 'number' ? project.timeline.offset : 0,
        typeof project.timeline?.scrollTop === 'number' ? project.timeline.scrollTop : 0,
      )
    },

    // 导出时包含视频信息
    exportProject() {
      return {
        meta: {
          version: this.version,
          createdAt: Date.now()
        },
        timeline: {
          currentTime: this.currentTime,
          scale: this.timelineScale,
          offset: this.timelineOffset,
          scrollTop: this.timelineScrollTop,
          showSpectrogram: this.showSpectrogram,
          spectrogramColorScheme: this.spectrogramColorScheme,
          spectrogramCustomColor: this.spectrogramCustomColor,
          danmakuColorForBlock: this.danmakuColorForBlock
        },
        media: {
          path: this.mediaFilePath,
          url: this.mediaFilePath || this.mediaUrl,
        },
        player: {
          screenWidth: this.screenWidth,
          screenHeight: this.screenHeight,
          screenScale: this.screenScale,
          maxLayers: this.maxLayers
        },
        preprocess: {
          allowNegativeValues: this.allowNegativeValues
        },
        danmakus: this.danmakus
      }
    },

    /**
     * 设置播放器 screen 尺寸
     */
    setScreenSize(width: number, height: number) {
      this.screenWidth = Math.max(10, Math.round(width))
      this.screenHeight = Math.max(10, Math.round(height))
    },

    setScreenScale(scale: number) {
      this.screenScale = Math.max(10, Math.round(scale))
    },

    /**
     * 设置 XML 导出是否使用比例坐标
     */
    setExportXmlAsRatio(enabled: boolean) {
      this.exportXmlAsRatio = enabled
    },

    setImportXmlDurationOffsetEnabled(enabled: boolean) {
      this.importXmlDurationOffsetEnabled = enabled
    },

    setExportXmlDurationOffsetEnabled(enabled: boolean) {
      this.exportXmlDurationOffsetEnabled = enabled
    },

    setAllowNegativeValues(enabled: boolean) {
      this.allowNegativeValues = enabled
    },

    setMaxLayers(value: number) {
      const normalized = Math.max(1, Math.round(value))
      const maxUsedLayer = this.danmakus.reduce((max: number, danmaku: any) => {
        return Math.max(max, danmaku.layer)
      }, -1)
      const minimumAllowed = Math.max(1, maxUsedLayer + 1)

      this.maxLayers = Math.max(normalized, minimumAllowed)
    },

    setAggressiveOptimization(enabled: boolean) {
      this.aggressiveOptimization = enabled
      this.persistGlobalSettings()
    },

    setUseWebglVideoExport(enabled: boolean) {
      this.useWebglVideoExport = enabled
      this.persistGlobalSettings()
    },

    setShowSpectrogram(enabled: boolean) {
      this.showSpectrogram = enabled
    },

    setSpectrogramColorScheme(scheme: string) {
      this.spectrogramColorScheme = scheme
    },

    setSpectrogramCustomColor(color: string) {
      this.spectrogramCustomColor = color
    },

    setdanmakuColorForBlock(enabled: boolean) {
      this.danmakuColorForBlock = enabled
    },

    /**
     * 生成新的弹幕ID
     * 确保ID在所有弹幕中是唯一的
     */
    generateNewId(): string {
      let maxId = 0
      this.danmakus.forEach((d: DanmakuItem) => {
        const id = parseInt(d.id)
        if (!isNaN(id) && id > maxId) {
          maxId = id
        }
      })
      return String(maxId + 1)
    },

    /**
     * 检查给定的时间段在某个layer上是否与其他弹幕冲突
     * 冲突判断：startTime1 < startTime2 + duration2 && startTime2 < startTime1 + duration1
     */
    isTimeConflict(startTime: number, duration: number, layer: number, excludeIds: string[] = []): boolean {
      return this.danmakus.some((d: DanmakuItem) => {
        if (d.layer !== layer || excludeIds.includes(d.id)) return false
        return startTime < d.startTime + d.animation.duration && d.startTime < startTime + duration
      })
    },

    /**
     * 为多条弹幕分配合适的layer值，避免时间冲突
     * @param danmakusToAdd 要添加的弹幕数组
     */
    assignLayersForDanmakus(danmakusToAdd: DanmakuItem[]): void {
      danmakusToAdd.forEach((newDanmaku) => {
        let layer = newDanmaku.layer
        const maxLayers = this.maxLayers

        // 如果当前layer有冲突，则尝试更高的layer
        while (
          layer < maxLayers &&
          this.isTimeConflict(newDanmaku.startTime, newDanmaku.animation.duration, layer, [newDanmaku.id])
        ) {
          layer++
        }

        newDanmaku.layer = Math.min(layer, maxLayers - 1)
      })
    },

    /**
     * 处理多条弹幕的startTime偏移
     * 将所有要创建的弹幕中最小的startTime作为基准，计算与播放头的差值，应用于所有弹幕
     * @param danmakusToAdd 要添加的弹幕数组
     */
    adjustStartTimesForDanmakus(danmakusToAdd: DanmakuItem[]): void {
      if (danmakusToAdd.length === 0) return

      // 找最小的startTime
      const minStartTime = Math.min(...danmakusToAdd.map((d) => d.startTime))

      // 计算偏移量（播放头位置 - 最小startTime）
      const offset = this.currentTime - minStartTime

      // 应用偏移到所有弹幕
      danmakusToAdd.forEach((d) => {
        d.startTime = Math.round(Math.max(0, d.startTime + offset))
      })
    },

    /**
     * 创建单条弹幕
     */
    createSingleDanmaku(): void {
      const duration = this.getDefaultDanmakuDuration()

      const newDanmaku: DanmakuItem = {
        id: this.generateNewId(),
        layer: 0,
        startTime: Math.round(this.currentTime),
        content: {
          text: '',
          font: 'SimHei',
          size: 60,
          color: '#ffffff',
          stroke: false
        },
        transform: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          zRotate: 0,
          yRotate: 0
        },
        opacity: { from: 1, to: 1 },
        animation: {
          duration,
          moveDuration: 500,
          delay: 0,
          easing: 'speedup'
        }
      }

      // 检查layer冲突并分配合适的layer
      this.assignLayersForDanmakus([newDanmaku])

      // 添加弹幕
      this.danmakus.push(newDanmaku)

      // 清空选择，并将新弹幕ID加入选择
      this.selectedIds = [newDanmaku.id]

      // 记录历史
      historyManager.recordSnapshot(this.danmakus, '创建弹幕')

      console.log('创建单条弹幕:', newDanmaku.id)
    },

    getDefaultDanmakuDuration(): number {
      if (this.danmakuDuration.mode === 'multiplier') {
        const playheadStepMs = this.playheadStepMs || 16.666667
        return Math.round(Math.max(100, playheadStepMs * this.danmakuDuration.value))
      }
      return Math.max(100, this.danmakuDuration.value)
    },

    async loadDanmakuTemplates(): Promise<void> {
      if (this.danmakuTemplatesLoaded) return

      try {
        await this.refreshDanmakuTemplates()
      } catch (error) {
        this.danmakuTemplatesLoaded = false
        throw error
      }
    },

    async refreshDanmakuTemplates(): Promise<void> {
      const previousSelection = this.selectedDanmakuTemplateName
      this.danmakuTemplates = isTauriRuntime()
        ? await listDanmakuTemplates()
        : readLocalDanmakuTemplates()
      if (!this.danmakuTemplates.some((template) => template.name === previousSelection)) {
        this.selectedDanmakuTemplateName = this.danmakuTemplates[0]?.name || ''
      }
      this.danmakuTemplatesLoaded = true
      if (this.selectedDanmakuTemplateName !== previousSelection &&
          (!isTauriRuntime() || this.globalSettingsLoaded)) {
        this.persistGlobalSettings()
      }
    },

    selectDanmakuTemplate(name: string): void {
      if (!this.danmakuTemplates.some((template) => template.name === name)) return
      this.selectedDanmakuTemplateName = name
      this.persistGlobalSettings()
    },

    isValidDanmakuTemplateContent(danmakuList: unknown): boolean {
      return Array.isArray(danmakuList) && danmakuList.length > 0 && danmakuList.every(isValidTemplateDanmaku)
    },

    async createDanmakuTemplateFromSelection(): Promise<void> {
      const selected = this.getSelectedDanmakus
      if (selected.length === 0) throw new Error('请先选择要保存为模板的弹幕')
      await this.loadDanmakuTemplates()

      const baseName = `模板 ${Date.now()}`
      let name = normalizeDanmakuTemplateName(baseName)
      let suffix = 2
      while (this.danmakuTemplates.some((template) => template.name === name)) {
        name = `${baseName} (${suffix++})`
      }

      const now = Date.now()
      const template: DanmakuTemplateRecord = {
        name,
        createdAt: now,
        lastChangeAt: now,
        danmakus: JSON.parse(JSON.stringify(selected)) as DanmakuItem[]
      }
      if (isTauriRuntime()) {
        await createDanmakuTemplate(name, template.danmakus)
      } else {
        writeLocalDanmakuTemplates([...this.danmakuTemplates, template])
      }
      this.danmakuTemplates.push(template)
      this.selectedDanmakuTemplateName = name
      this.persistGlobalSettings()
    },

    async updateDanmakuTemplateContent(name: string, danmakus: unknown): Promise<void> {
      if (!Array.isArray(danmakus) || !danmakus.every(isValidTemplateDanmaku)) {
        throw new Error('模板内容必须是有效的弹幕对象数组')
      }
      const template = this.danmakuTemplates.find((item) => item.name === name)
      if (!template) throw new Error('模板不存在')

      const cloned = JSON.parse(JSON.stringify(danmakus)) as DanmakuItem[]
      if (isTauriRuntime()) {
        await updateDanmakuTemplate(name, cloned)
      } else {
        writeLocalDanmakuTemplates(this.danmakuTemplates.map((item) => item.name === name
          ? { ...item, danmakus: cloned, lastChangeAt: Date.now() }
          : item))
      }
      template.danmakus = cloned
      template.lastChangeAt = Date.now()
    },

    async renameDanmakuTemplateByName(name: string, newName: string): Promise<void> {
      const normalizedName = normalizeDanmakuTemplateName(newName)
      if (!normalizedName) throw new Error('模板名称不能为空')
      if (normalizedName === name) return
      if (this.danmakuTemplates.some((item) => item.name === normalizedName && item.name !== name)) {
        throw new Error('模板名称已存在')
      }
      if (isTauriRuntime()) {
        await renameDanmakuTemplate(name, normalizedName)
      }
      this.danmakuTemplates = this.danmakuTemplates.map((item) => item.name === name
        ? { ...item, name: normalizedName }
        : item)
      if (!isTauriRuntime()) writeLocalDanmakuTemplates(this.danmakuTemplates)
      if (this.selectedDanmakuTemplateName === name) {
        this.selectedDanmakuTemplateName = normalizedName
        this.persistGlobalSettings()
      }
    },

    async saveDanmakuTemplate(name: string, newName: string, danmakus: unknown): Promise<void> {
      if (!this.isValidDanmakuTemplateContent(danmakus)) {
        throw new Error('模板内容必须是有效的弹幕对象数组')
      }
      const normalizedName = normalizeDanmakuTemplateName(newName)
      if (!normalizedName) throw new Error('模板名称不能为空')
      if (this.danmakuTemplates.some((item) => item.name === normalizedName && item.name !== name)) {
        throw new Error('模板名称已存在')
      }
      const template = this.danmakuTemplates.find((item) => item.name === name)
      if (!template) throw new Error('模板不存在')
      const cloned = JSON.parse(JSON.stringify(danmakus)) as DanmakuItem[]

      if (isTauriRuntime()) {
        await updateDanmakuTemplate(name, cloned)
        template.danmakus = cloned
        template.lastChangeAt = Date.now()
        if (normalizedName !== name) {
          await renameDanmakuTemplate(name, normalizedName)
          template.name = normalizedName
        }
      } else {
        const now = Date.now()
        const updated = this.danmakuTemplates.map((item) => item.name === name
          ? { ...item, name: normalizedName, danmakus: cloned, lastChangeAt: now }
          : item)
        writeLocalDanmakuTemplates(updated)
        this.danmakuTemplates = updated
      }
      if (this.selectedDanmakuTemplateName === name) {
        this.selectedDanmakuTemplateName = normalizedName
        this.persistGlobalSettings()
      }
    },

    async deleteDanmakuTemplateByName(name: string): Promise<void> {
      if (isTauriRuntime()) {
        await deleteDanmakuTemplate(name)
      }
      this.danmakuTemplates = this.danmakuTemplates.filter((item) => item.name !== name)
      if (!isTauriRuntime()) writeLocalDanmakuTemplates(this.danmakuTemplates)
      if (this.selectedDanmakuTemplateName === name) {
        this.selectedDanmakuTemplateName = this.danmakuTemplates[0]?.name || ''
        this.persistGlobalSettings()
      }
    },

    setDanmakuTemplateReplacement(enabled: boolean): void {
      this.replaceDefaultDanmakuWithTemplate = enabled
      this.persistGlobalSettings()
    },

    insertDanmakus(drafts: DanmakuItem[], historyLabel = '插入弹幕', immediate = false): DanmakuItem[] {
      const danmakusToAdd = JSON.parse(JSON.stringify(drafts)) as DanmakuItem[]
      const duration = this.getDefaultDanmakuDuration()
      danmakusToAdd.forEach((danmaku) => {
        if (!Number.isFinite(danmaku.animation?.duration)) {
          danmaku.animation.duration = duration
        }
      })

      let currentMaxId = this.danmakus.reduce((max: number, danmaku: DanmakuItem) => {
        const id = Number.parseInt(danmaku.id, 10)
        return Number.isFinite(id) ? Math.max(max, id) : max
      }, 0)
      danmakusToAdd.forEach((danmaku) => {
        danmaku.id = String(++currentMaxId)
      })

      this.adjustStartTimesForDanmakus(danmakusToAdd)
      this.assignLayersForDanmakusSequentially(danmakusToAdd)
      this.danmakus.push(...danmakusToAdd)
      this.selectedIds = danmakusToAdd.map((danmaku) => danmaku.id)
      historyManager.recordSnapshot(this.danmakus, `${historyLabel}${danmakusToAdd.length}条`, immediate)
      return danmakusToAdd
    },

    insertSelectedDanmakuTemplate(): boolean {
      const template = this.danmakuTemplates.find((item) => item.name === this.selectedDanmakuTemplateName)
      if (!template) return false
      this.insertDanmakus(template.danmakus, '插入模板')
      return true
    },

    /**
     * 删除选中的弹幕
     */
    deleteSelectedDanmakus(): void {
      const idsToDelete = [...this.selectedIds]
      this.danmakus = this.danmakus.filter((d: DanmakuItem) => !idsToDelete.includes(d.id))
      this.selectedIds = []

      // 记录历史
      historyManager.recordSnapshot(this.danmakus, `删除${idsToDelete.length}条弹幕`)

      console.log('删除弹幕:', idsToDelete)
    },

    /**
     * 写入数据到剪贴板
     * 尝试使用Tauri剪贴板插件，回退到浏览器API
     */
    async _writeToClipboard(data: string): Promise<void> {
      const notice = useNoticeStore()
      try {
        // 尝试使用Tauri2剪贴板插件
        await writeText(data)
        console.log('[剪贴板] 已通过Tauri插件写入')
      } catch (error) {
        notice.log('[剪贴板] Tauri剪贴板插件不可用，回退到浏览器API', 'error', error)
        try {
          await navigator.clipboard.writeText(data)
          console.log('[剪贴板] 已通过浏览器API写入')
        } catch (fallbackError) {
          notice.alert('写入剪贴板的两种方法均失败，粘贴弹幕功能不可用', 'error', '剪贴板错误', fallbackError)
          throw new Error('复制到剪贴板失败')
        }
      }
    },

    /**
     * 从剪贴板读取数据
     * 尝试使用Tauri剪贴板插件，回退到浏览器API
     */
    async _readFromClipboard(): Promise<string> {
      const notice = useNoticeStore()
      try {
        // 尝试使用Tauri2剪贴板插件
        const data = await readText()
        console.log('[剪贴板] 已通过Tauri插件读取')
        return data
      } catch (error) {
        console.warn('[剪贴板] Tauri剪贴板插件不可用，回退到浏览器API', error)
        try {
          const data = await navigator.clipboard.readText()
          console.log('[剪贴板] 已通过浏览器API读取')
          return data
        } catch (fallbackError) {
          notice.alert('[剪贴板] 读取剪贴板的两种方法均失败，粘贴弹幕功能不可用', 'error', '剪贴板错误', fallbackError)
          throw new Error('从剪贴板读取失败')
        }
      }
    },

    /**
     * 复制当前帧弹幕
     */
    async copyCurrentFrameDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      const time = this.currentTime

      // 获取当前可见的弹幕（在当前时间区间内）
      let visibleDanmakus = this.danmakus.filter((d: DanmakuItem) => {
        return time >= d.startTime && time <= d.startTime + d.animation.duration
      })

      // 如果有选中的弹幕，进一步过滤
      if (this.selectedIds.length > 0) {
        visibleDanmakus = visibleDanmakus.filter((d: DanmakuItem) =>
          this.selectedIds.includes(d.id)
        )
      }

      if (visibleDanmakus.length === 0) {
        notice.log('当前帧没有可复制的弹幕', 'warn')
        return
      }

      // 计算渲染状态并创建新的弹幕对象
      const copiedDanmakus: DanmakuItem[] = visibleDanmakus.map((d: DanmakuItem) => {
        // 计算渲染进度
        const t = time - d.startTime
        const { delay, moveDuration, easing } = d.animation

        let progress = 0
        if (moveDuration <= 0) {
          progress = 1
        } else if (t <= delay) {
          progress = 0
        } else {
          progress = (t - delay) / moveDuration
        }

        progress = Math.max(0, Math.min(1, progress))

        // 应用 easing 函数
        if (easing === 'speedup') {
          progress = progress * progress
        } else {
          progress = 1 - (1 - progress) * (1 - progress)
        }

        // 计算当前位置
        const x =
          Math.round(d.transform.start.x +
          (d.transform.end.x - d.transform.start.x) * progress)
        const y =
          Math.round(d.transform.start.y +
          (d.transform.end.y - d.transform.start.y) * progress)

        // 计算当前透明度
        const lifeProgress = Math.max(
          0,
          Math.min(1, (time - d.startTime) / d.animation.duration)
        )
        const opacity =
          (d.opacity.from + (d.opacity.to - d.opacity.from) * lifeProgress).toFixed(2)
        const opacityValue = parseFloat(opacity)

        // 计算 duration（使用用户设置）
        let duration = 1000
        if (this.danmakuDuration.mode === 'ms') {
          duration = Math.round(Math.max(100, this.danmakuDuration.value))
        } else if (this.danmakuDuration.mode === 'multiplier') {
          const playheadStepMs = this.playheadStepMs || 16.666667
          duration = Math.round(
            Math.max(100, playheadStepMs * this.danmakuDuration.value)
          )
        }

        // 创建新的弹幕对象（没有变换，起始与结束相同）
        return {
          id: d.id,
          layer: d.layer,
          startTime: 0,
          content: d.content,
          transform: {
            start: { x, y },
            end: { x, y },
            zRotate: d.transform.zRotate,
            yRotate: d.transform.yRotate
          },
          opacity: { from: opacityValue, to: opacityValue },
          animation: {
            duration,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        }
      })

      const data = JSON.stringify(copiedDanmakus)
      try {
        await this._writeToClipboard(data)
        notice.log('复制当前帧弹幕:' + copiedDanmakus.length + '条', 'success')
      } catch (error) {
        notice.alert('复制到剪贴板失败:', 'error', '剪贴板错误', error)
      }
    },

    /**
     * 复制选中的弹幕数据到剪贴板
     */
    async copySelectedDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      const selectedDanmakus = this.getSelectedDanmakus
      if (selectedDanmakus.length === 0) {
        notice.log('没有选中的弹幕', 'warn')
        return
      }

      const data = JSON.stringify(selectedDanmakus)
      try {
        await this._writeToClipboard(data)
        notice.log('复制弹幕:' + selectedDanmakus.length + '条', 'success')
      } catch (error) {
        notice.alert('复制到剪贴板失败:', 'error', '剪贴板错误', error)
      }
    },

    /**
     * 粘贴弹幕
     * 从剪贴板读取并创建多条弹幕
     * 依次逐个分配ID和layer
     */
    async pasteDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      try {
        const text = await this._readFromClipboard()
        const danmakusToAdd = parsePastedDanmakusText(text)

        if (!Array.isArray(danmakusToAdd)) {
          notice.alert('粘贴数据格式错误: 未解析出弹幕数组', 'error', '剪贴板错误')
          return
        }

        this.insertDanmakus(danmakusToAdd, '粘贴')

        notice.log('粘贴弹幕:' + danmakusToAdd.length + '条', 'success')
      } catch (error) {
        notice.alert('粘贴失败:', 'error', '剪贴板错误', error)
      }
    },
    
    /**
     * 按layer排序后逐个分配layer
     * 这样可以确保粘贴的多条弹幕之间也能正确避让
     */
    assignLayersForDanmakusSequentially(danmakusToAdd: DanmakuItem[]): void {
      // 按layer排序
      const sorted = [...danmakusToAdd].sort((a, b) => a.layer - b.layer)
      
      sorted.forEach((danmakuToProcess) => {
        let layer = danmakuToProcess.layer
        const maxLayers = this.maxLayers
        
        // 对于每条弹幕，检查它与所有其他弹幕的冲突
        while (layer < maxLayers) {
          let hasConflict = false
          
          // 检查与既有弹幕的冲突
          for (const existing of this.danmakus) {
            if (existing.layer === layer) {
              const conflict = danmakuToProcess.startTime < existing.startTime + existing.animation.duration &&
                              existing.startTime < danmakuToProcess.startTime + danmakuToProcess.animation.duration
              if (conflict) {
                hasConflict = true
                break
              }
            }
          }
          
          // 检查与已处理弹幕的冲突
          if (!hasConflict) {
            for (const processed of sorted) {
              if (processed === danmakuToProcess) break // 只检查已处理的
              
              if (processed.layer === layer) {
                const conflict = danmakuToProcess.startTime < processed.startTime + processed.animation.duration &&
                                processed.startTime < danmakuToProcess.startTime + danmakuToProcess.animation.duration
                if (conflict) {
                  hasConflict = true
                  break
                }
              }
            }
          }
          
          if (!hasConflict) {
            break // 找到合适的layer
          }
          layer++
        }
        
        danmakuToProcess.layer = Math.min(layer, maxLayers - 1)
      })
    },

    /**
     * 撤销操作
     */
    undo(): void {
      const result = historyManager.undo()
      if (result) {
        this.danmakus = result.danmakus
        this.selectedIds = result.selectedIds
      }
    },

    /**
     * 重做操作
     */
    redo(): void {
      const result = historyManager.redo()
      if (result) {
        this.danmakus = result.danmakus
        this.selectedIds = result.selectedIds
      }
    },

    /**
     * 更新弹幕生存时间配置
     */
    setDanmakuDuration(mode: 'ms' | 'multiplier', value: number): void {
      this.danmakuDuration.mode = mode
      this.danmakuDuration.value = value
      this.persistGlobalSettings()
    },
    
    /**
     * 清空缓存工程
     */
    async clearCache(): Promise<void> {
      const notice = useNoticeStore()
      if (this.projectMode === 'folder') {
        notice.log('[缓存] 文件夹工程不使用本地缓存', 'warn')
        return
      }

      const confirmed = await notice.confirm('确定要清空本地缓存的工程吗？此操作不可撤销')
      if (confirmed) {
        clearProject()
        notice.log('已清空缓存工程', 'success')
      }
    },

    moveSelectedLayers(delta: number): void {
      if (!Number.isFinite(delta) || delta === 0 || this.selectedIds.length === 0) {
        return
      }

      const selectedDanmakus = this.danmakus.filter((d: DanmakuItem) => this.selectedIds.includes(d.id))
      if (selectedDanmakus.length === 0) {
        return
      }

      const minLayer = Math.min(...selectedDanmakus.map((d: any) => d.layer))
      const maxLayer = Math.max(...selectedDanmakus.map((d: any) => d.layer))

      let appliedDelta = Math.trunc(delta)
      if (appliedDelta < 0) {
        appliedDelta = Math.max(appliedDelta, -minLayer)
      } else {
        appliedDelta = Math.min(appliedDelta, (this.maxLayers - 1) - maxLayer)
      }

      if (appliedDelta === 0) {
        return
      }

      selectedDanmakus.forEach((danmaku: any) => {
        danmaku.layer += appliedDelta
      })

      // 防抖处理：清除之前的计时器，设置新的500ms延迟
      if (this._moveSelectedLayersDebounceTimer) {
        clearTimeout(this._moveSelectedLayersDebounceTimer)
      }

      this._moveSelectedLayersDebounceTimer = setTimeout(() => {
        historyManager.recordSnapshot(this.danmakus, '移动选中弹幕层级')
        this._moveSelectedLayersDebounceTimer = null
      }, 500)
    }
  }
})
