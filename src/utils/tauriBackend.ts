import { invoke } from '@tauri-apps/api/core'
import type { ExportQuality } from '@/core/videoExport/quality'

type TauriInternals = {
  invoke?: <T>(command: string, payload?: Record<string, unknown>) => Promise<T>
  convertFileSrc?: (filePath: string, protocol?: string) => string
}

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: TauriInternals
  isTauri?: boolean
}

export type RegisteredMediaFile = {
  path: string
  url: string
}

export type FolderProjectMediaConfig = {
  name?: string | null
  useExternalLink: boolean
  externalPath?: string | null
}

export type FolderProjectConfig = {
  version: string
  name: string
  createdAt: number
  lastChangeAt: number
  lastBackUpAt?: number | null
  projectFile: string
  media?: FolderProjectMediaConfig | null
  description: string
}

export type FolderProjectSummary = {
  path: string
  config: FolderProjectConfig
  projectExists: boolean
  mediaPath?: string | null
  mediaExists: boolean
}

export type FileSystemState = {
  configPath: string
  documentsDataDir: string
  logsDir: string
  defaultProjectsDir: string
  projects: FolderProjectSummary[]
  globalSettings: GlobalSettings
}

export type GlobalSettings = {
  playheadStepMs: number
  danmakuDuration: {
    mode: 'ms' | 'multiplier'
    value: number
  }
  aggressiveOptimization: boolean
  selectedDanmakuTemplateName?: string | null
  replaceDefaultDanmakuWithTemplate?: boolean
}

export type FolderProjectPayload = {
  path: string
  config: FolderProjectConfig
  project: any
  mediaFile?: BackendMediaFile | null
  warnings: string[]
}

export type FolderProjectCreateInput = {
  parentDir: string
  name: string
  fromProject?: any
  mediaPath?: string
  copyMedia: boolean
  description?: string
}

export type ProjectPathCheck = {
  path: string
  exists: boolean
}

export type BackendMediaFile = {
  path: string
}

export type DanmakuTemplateRecord = {
  name: string
  createdAt: number
  lastChangeAt: number
  danmakus: any[]
}

function getTauriInternals(): TauriInternals | undefined {
  return (window as TauriWindow).__TAURI_INTERNALS__
}

export function isTauriRuntime(): boolean {
  const tauriWindow = window as TauriWindow
  return Boolean(tauriWindow.isTauri && getTauriInternals()?.invoke)
}

export async function captureWebviewSnapshot(): Promise<Uint8Array> {
  const result = await invokeTauri<Uint8Array | ArrayBuffer | number[]>('capture_webview_snapshot')
  if (result instanceof Uint8Array) return result
  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  if (Array.isArray(result)) return new Uint8Array(result)
  throw new Error('Tauri 截图桥接返回了无效数据')
}

export async function chooseVideoExportPath(): Promise<string | null> {
  return invokeTauri<string | null>('choose_video_export_path')
}

export async function createVideoExportRenderWindow(jobId: string, job: unknown): Promise<void> {
  const record = job as Record<string, unknown>
  await invokeTauri<void>('create_video_export_render_window', {
    jobId,
    job,
    width: record.width,
    height: record.height
  })
}

export async function getVideoExportRenderJob(jobId: string): Promise<any> {
  return invokeTauri<any>('get_video_export_render_job', { jobId })
}

export async function finishVideoExportRenderWindow(jobId: string, keepOutput: boolean): Promise<void> {
  await invokeTauri<void>('finish_video_export_render_window', { jobId, keepOutput })
}

export async function startVideoExportFile(path: string): Promise<void> {
  await invokeTauri<void>('start_video_export_file', { path })
}

export async function writeVideoExportChunk(path: string, position: number, data: Uint8Array): Promise<void> {
  await invokeTauri<void>('write_video_export_chunk', { path, position, data })
}

export async function finishVideoExportFile(path: string, fileSize: number): Promise<void> {
  await invokeTauri<void>('finish_video_export_file', { path, fileSize })
}

export async function cancelVideoExportFile(path: string): Promise<void> {
  await invokeTauri<void>('cancel_video_export_file', { path })
}

export async function canUseFfmpegVideoEncoder(): Promise<boolean> {
  return invokeTauri<boolean>('can_use_ffmpeg_video_encoder')
}

export async function startFfmpegVideoExport(options: {
  outputPath: string
  mediaPath: string | null
  quality: ExportQuality
  fps: number
  startMs: number
  endMs: number
  frameCount: number
  width: number
  height: number
}): Promise<void> {
  await invokeTauri<void>('start_ffmpeg_video_export', options)
}

export async function writeFfmpegVideoFrame(outputPath: string, pngFrame: Uint8Array): Promise<void> {
  await invokeTauri<void>('write_ffmpeg_video_frame', { outputPath, pngFrame })
}

export async function finishFfmpegVideoExport(outputPath: string): Promise<void> {
  await invokeTauri<void>('finish_ffmpeg_video_export', { outputPath })
}

export async function cancelFfmpegVideoExport(outputPath: string): Promise<void> {
  await invokeTauri<void>('cancel_ffmpeg_video_export', { outputPath })
}

async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri invoke API 不可用')
  }

  return invoke<T>(command, payload)
}

function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const prefixed = /^[a-zA-Z]:\//.test(normalized) ? `/${normalized}` : normalized
  return `file://${encodeURI(prefixed)}`
}

export function normalizeMediaPath(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) return ''

  if (!trimmed.startsWith('file://')) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const pathname = decodeURIComponent(url.pathname)
    return pathname.replace(/^\/([a-zA-Z]:)/, '$1')
  } catch {
    return trimmed
      .replace(/^file:\/\/\//, '')
      .replace(/^file:\/\//, '')
  }
}

export function isPersistentMediaPath(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const normalized = normalizeMediaPath(value)
  return Boolean(normalized && !normalized.startsWith('blob:') && !/^https?:\/\//i.test(normalized))
}

export function getProjectMediaPath(media: unknown): string {
  if (!media || typeof media !== 'object') return ''

  const record = media as Record<string, unknown>

  if (isPersistentMediaPath(record.path)) {
    return normalizeMediaPath(record.path)
  }

  if (isPersistentMediaPath(record.url)) {
    return normalizeMediaPath(record.url)
  }

  return ''
}

export function getFileInputPath(file: File): string {
  const nativeFile = file as File & { path?: unknown }
  return typeof nativeFile.path === 'string' ? nativeFile.path : ''
}

export function convertMediaPathToUrl(path: string): string {
  const normalized = normalizeMediaPath(path)
  const convertFileSrc = getTauriInternals()?.convertFileSrc
  return convertFileSrc ? convertFileSrc(normalized, 'asset') : toFileUrl(normalized)
}

export async function registerMediaPath(path: string): Promise<RegisteredMediaFile> {
  const normalized = normalizeMediaPath(path)
  const media = await invokeTauri<BackendMediaFile>('register_media_file', { path: normalized })

  return {
    path: media.path,
    url: convertMediaPathToUrl(media.path)
  }
}

export async function openMediaFileWithTauri(): Promise<RegisteredMediaFile | null> {
  const media = await invokeTauri<BackendMediaFile | null>('open_media_file')

  if (!media) return null

  return {
    path: media.path,
    url: convertMediaPathToUrl(media.path)
  }
}

function withRegisteredMedia(payload: FolderProjectPayload): FolderProjectPayload {
  if (!payload.mediaFile?.path) {
    return payload
  }

  return {
    ...payload,
    project: {
      ...payload.project,
      media: {
        path: payload.mediaFile.path,
        url: convertMediaPathToUrl(payload.mediaFile.path)
      }
    }
  }
}

export async function getFileSystemState(): Promise<FileSystemState> {
  return invokeTauri<FileSystemState>('get_file_system_state')
}

export async function updateGlobalSettings(settings: GlobalSettings): Promise<void> {
  await invokeTauri<void>('update_global_settings', { settings })
}

export async function listDanmakuTemplates(): Promise<DanmakuTemplateRecord[]> {
  return invokeTauri<DanmakuTemplateRecord[]>('list_danmaku_templates')
}

export async function createDanmakuTemplate(name: string, danmakus: any[]): Promise<void> {
  await invokeTauri<void>('create_danmaku_template', { name, danmakus })
}

export async function updateDanmakuTemplate(name: string, danmakus: any[]): Promise<void> {
  await invokeTauri<void>('update_danmaku_template', { name, danmakus })
}

export async function renameDanmakuTemplate(name: string, newName: string): Promise<void> {
  await invokeTauri<void>('rename_danmaku_template', { name, newName })
}

export async function deleteDanmakuTemplate(name: string): Promise<void> {
  await invokeTauri<void>('delete_danmaku_template', { name })
}

export async function checkFolderProjectPath(parentDir: string, name: string): Promise<ProjectPathCheck> {
  return invokeTauri<ProjectPathCheck>('check_folder_project_path', { parentDir, name })
}

export async function createFolderProject(input: FolderProjectCreateInput): Promise<FolderProjectPayload> {
  const payload = await invokeTauri<FolderProjectPayload>('create_folder_project', { request: input })
  return withRegisteredMedia(payload)
}

export async function loadFolderProject(projectPath: string): Promise<FolderProjectPayload> {
  const payload = await invokeTauri<FolderProjectPayload>('load_folder_project', { projectPath })
  return withRegisteredMedia(payload)
}

export async function saveFolderProject(
  projectPath: string,
  project: any,
  pendingMediaPath?: string
): Promise<FolderProjectPayload> {
  const payload = await invokeTauri<FolderProjectPayload>('save_folder_project', {
    request: {
      projectPath,
      project,
      pendingMediaPath: pendingMediaPath || null
    }
  })
  return withRegisteredMedia(payload)
}

export async function backupFolderProject(
  projectPath: string,
  project: any,
  pendingMediaPath?: string
): Promise<FolderProjectPayload> {
  const payload = await invokeTauri<FolderProjectPayload>('backup_folder_project', {
    request: {
      projectPath,
      project,
      pendingMediaPath: pendingMediaPath || null
    }
  })
  return withRegisteredMedia(payload)
}

export async function updateFolderProjectConfig(
  projectPath: string,
  config: FolderProjectConfig
): Promise<FolderProjectSummary> {
  return invokeTauri<FolderProjectSummary>('update_folder_project_config', { request: { projectPath, config } })
}

export async function removeFolderProject(projectPath: string): Promise<void> {
  await invokeTauri<void>('remove_folder_project', { projectPath })
}

export async function chooseProjectFolder(): Promise<string | null> {
  return invokeTauri<string | null>('choose_project_folder')
}

export type EditFolderProjectInput = {
  projectPath: string
  name?: string
  newParentDir?: string
  mediaUseExternalLink?: boolean
  mediaExternalPath?: string
  description?: string
}

export async function importFolderProject(): Promise<FolderProjectPayload | null> {
  const payload = await invokeTauri<FolderProjectPayload | null>('import_folder_project')
  return payload ? withRegisteredMedia(payload) : null
}

export async function editFolderProject(input: EditFolderProjectInput): Promise<FolderProjectSummary> {
  return invokeTauri<FolderProjectSummary>('edit_folder_project', { request: input })
}

export async function openProjectFile(): Promise<any | null> {
  return invokeTauri<any | null>('open_project_file')
}

export async function appendLogToFile(line: string): Promise<void> {
  await invokeTauri<void>('append_log', { line })
}
