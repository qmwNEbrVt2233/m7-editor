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

type BackendMediaFile = {
  path: string
}

function getTauriInternals(): TauriInternals | undefined {
  return (window as TauriWindow).__TAURI_INTERNALS__
}

export function isTauriRuntime(): boolean {
  const tauriWindow = window as TauriWindow
  return Boolean(tauriWindow.isTauri && getTauriInternals()?.invoke)
}

async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const invoke = getTauriInternals()?.invoke

  if (!invoke) {
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

export function getProjectVideoPath(video: unknown): string {
  if (!video || typeof video !== 'object') return ''

  const record = video as Record<string, unknown>

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
