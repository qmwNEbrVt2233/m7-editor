import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { compressIdList, expandIdList } from '../utils/idRange.ts'

type BridgeDescriptor = { port: number; token: string; pid?: number }
type CachedBridge = { descriptor: BridgeDescriptor; overridePath?: string }

const APP_IDENTIFIER = 'com.jerryeee.m7-editor'
const MAX_DANMAKU_JSON_BYTES = 900 * 1024
const MAX_INPUT_JSON_FILE_BYTES = 32 * 1024 * 1024
const MAX_DANMAKU_FILE_ITEMS = 10_000
const MAX_LOG_ADDITIONAL_INFO_CHARS = 16 * 1024

let activeBridgeCache: CachedBridge | null = null

function appMcpDescriptorDirectory(): string {
  let configDirectory: string
  if (process.platform === 'win32') {
    configDirectory = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  } else if (process.platform === 'darwin') {
    configDirectory = join(homedir(), 'Library', 'Application Support')
  } else {
    configDirectory = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  }
  return join(configDirectory, APP_IDENTIFIER, 'mcp')
}

function parseBridgeDescriptor(rawText: string): BridgeDescriptor | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (
    typeof record.port !== 'number' ||
    !Number.isInteger(record.port) ||
    record.port <= 0 ||
    record.port > 65535 ||
    typeof record.token !== 'string' ||
    record.token.length === 0
  ) {
    return null
  }
  if (record.pid !== undefined && (typeof record.pid !== 'number' || !Number.isInteger(record.pid) || record.pid <= 0)) {
    return null
  }
  return {
    port: record.port,
    token: record.token,
    ...(typeof record.pid === 'number' ? { pid: record.pid } : {})
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') {
      return false
    }
    return true
  }
}

class DescriptorOverrideError extends Error {}

async function readBridgeDescriptors(): Promise<BridgeDescriptor[]> {
  const override = process.env.M7_EDITOR_MCP_DESCRIPTOR?.trim()
  if (override) {
    let rawText: string
    try {
      rawText = await readFile(override, 'utf8')
    } catch (error) {
      throw new DescriptorOverrideError(
        `无法读取 M7_EDITOR_MCP_DESCRIPTOR 指定的桥接描述文件 (${override})：${error instanceof Error ? error.message : String(error)}`
      )
    }
    const descriptor = parseBridgeDescriptor(rawText)
    if (!descriptor) {
      throw new DescriptorOverrideError(`M7_EDITOR_MCP_DESCRIPTOR 指定的桥接描述文件格式无效 (${override})`)
    }
    return [descriptor]
  }

  const descriptorDirectories = [...new Set([appMcpDescriptorDirectory(), tmpdir()])]
  const namesByDirectory = await Promise.all(descriptorDirectories.map(async (directory) => {
    try {
      const names = await readdir(directory)
      return names
        .filter((name) => /^m7-editor-mcp-bridge-[a-f0-9]{24}\.json$/.test(name))
        .map((name) => ({ directory, name }))
    } catch {
      return []
    }
  }))
  const candidateResults = await Promise.all(namesByDirectory.flat().map(async ({ directory, name }) => {
    const path = join(directory, name)
    try {
      return { path, modifiedAt: (await stat(path)).mtimeMs }
    } catch {
      return null
    }
  }))
  const candidates = candidateResults.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)

  const descriptors: BridgeDescriptor[] = []
  for (const candidate of candidates) {
    try {
      const descriptor = parseBridgeDescriptor(await readFile(candidate.path, 'utf8'))
      if (!descriptor) continue
      if (descriptor.pid !== undefined && !isProcessAlive(descriptor.pid)) continue
      descriptors.push(descriptor)
    } catch {
      // Ignore partial or stale descriptor files and try the next recent editor session.
    }
  }
  return descriptors
}

const longBridgeMethods = new Set([
  'editor.captureFrame',
  'editor.exportVideo',
  'editor.getVideoExportStatus',
  'editor.cancelVideoExport'
])

type RpcAttemptResult =
  | { kind: 'ok'; result: unknown }
  | { kind: 'app_error'; message: string }
  | { kind: 'auth_failed' }
  | { kind: 'not_ready'; message: string }
  | { kind: 'bad_response'; message: string }
  | { kind: 'timeout' }
  | { kind: 'refused' }

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  return name === 'TimeoutError' || name === 'AbortError'
}

async function dispatchRpcToDescriptor(
  descriptor: BridgeDescriptor,
  method: string,
  requestBody: string
): Promise<RpcAttemptResult> {
  let response: Response
  try {
    response = await fetch('http://127.0.0.1:' + descriptor.port + '/rpc', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + descriptor.token,
        'content-type': 'application/json'
      },
      body: requestBody,
      signal: AbortSignal.timeout(longBridgeMethods.has(method) ? 95_000 : 35_000)
    })
  } catch (error) {
    return isTimeoutError(error) ? { kind: 'timeout' } : { kind: 'refused' }
  }

  let payload: { result?: unknown; error?: string }
  try {
    payload = await response.json() as { result?: unknown; error?: string }
  } catch {
    return { kind: 'bad_response', message: '编辑器桥接返回了无效响应（HTTP ' + response.status + '）' }
  }

  if (response.status === 401) {
    return { kind: 'auth_failed' }
  }
  if (response.status === 503) {
    return {
      kind: 'not_ready',
      message: payload?.error || '编辑器界面尚未连接 MCP 桥，请稍后重试'
    }
  }
  if (!response.ok || payload?.error) {
    return {
      kind: 'app_error',
      message: payload?.error || '编辑器桥接调用失败（HTTP ' + response.status + '）'
    }
  }
  return { kind: 'ok', result: payload.result }
}

async function callEditor(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const requestBody = JSON.stringify({ requestId: randomUUID(), method, params })
  if (Buffer.byteLength(requestBody, 'utf8') > MAX_DANMAKU_JSON_BYTES) {
    throw new Error('MCP 桥接请求超过 900 KiB，请减少弹幕数量或缩小 JSON 文件')
  }

  const currentOverride = process.env.M7_EDITOR_MCP_DESCRIPTOR?.trim() || undefined
  let skippedCacheKey: string | null = null
  let notReadyMessage: string | null = null
  let badResponseMessage: string | null = null
  let authFailedCount = 0

  if (activeBridgeCache && activeBridgeCache.overridePath === currentOverride) {
    const cachedDescriptor = activeBridgeCache.descriptor
    const attempt = await dispatchRpcToDescriptor(cachedDescriptor, method, requestBody)
    if (attempt.kind === 'ok') {
      return attempt.result
    }
    if (attempt.kind === 'app_error') {
      throw new Error(attempt.message)
    }
    if (attempt.kind === 'timeout') {
      throw new Error('编辑器服务无响应：桥接请求超时，请检查编辑器是否阻塞或正在处理长耗时任务')
    }
    if (attempt.kind === 'not_ready') {
      notReadyMessage = attempt.message
    } else if (attempt.kind === 'auth_failed') {
      authFailedCount++
    } else if (attempt.kind === 'bad_response') {
      badResponseMessage = attempt.message
    }
    skippedCacheKey = `${cachedDescriptor.port}:${cachedDescriptor.token}`
    activeBridgeCache = null
  }

  let descriptors: BridgeDescriptor[]
  try {
    descriptors = await readBridgeDescriptors()
  } catch (error) {
    if (error instanceof DescriptorOverrideError) throw error
    throw new Error('编辑器服务离线：请先启动 m7-editor 桌面应用；MCP 已检查应用配置目录和系统临时目录')
  }
  if (!descriptors.length) {
    throw new Error('编辑器服务离线：未在应用配置目录或系统临时目录找到会话描述文件；请启动 m7-editor')
  }

  for (const descriptor of descriptors) {
    const descriptorKey = `${descriptor.port}:${descriptor.token}`
    if (skippedCacheKey && descriptorKey === skippedCacheKey) {
      continue
    }

    const attempt = await dispatchRpcToDescriptor(descriptor, method, requestBody)
    if (attempt.kind === 'ok') {
      activeBridgeCache = { descriptor, overridePath: currentOverride }
      return attempt.result
    }
    if (attempt.kind === 'app_error') {
      activeBridgeCache = { descriptor, overridePath: currentOverride }
      throw new Error(attempt.message)
    }
    if (attempt.kind === 'timeout') {
      throw new Error('编辑器服务无响应：已连接到编辑器桥接端口，但请求超时；请检查编辑器是否阻塞或正在处理长耗时任务')
    }
    if (attempt.kind === 'not_ready') {
      notReadyMessage ??= attempt.message
      continue
    }
    if (attempt.kind === 'auth_failed') {
      authFailedCount++
      continue
    }
    if (attempt.kind === 'bad_response') {
      badResponseMessage ??= attempt.message
      continue
    }
  }

  if (notReadyMessage) {
    throw new Error(notReadyMessage)
  }
  if (authFailedCount > 0) {
    throw new Error('编辑器服务离线：找到桥接描述文件，但没有可用的鉴权会话；请重启 m7-editor')
  }
  if (badResponseMessage) {
    throw new Error(badResponseMessage)
  }
  throw new Error(
    `编辑器服务离线：找到 ${descriptors.length} 个过期的桥接描述文件，但对应的本机端口均未监听（m7-editor 可能未运行或上次异常退出）；请启动 m7-editor`
  )
}

function normalizeColorString(rawColor: string): string | null {
  const color = rawColor.trim()
  if (/^#[A-Fa-f0-9]{6}$/.test(color)) {
    return color.toUpperCase()
  }
  const shortHex = color.match(/^#([A-Fa-f0-9])([A-Fa-f0-9])([A-Fa-f0-9])$/)
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toUpperCase()
  }
  const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgbMatch) {
    const channels = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((part) => {
      const value = Number.parseInt(part, 10)
      return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0')
    })
    return `#${channels.join('')}`.toUpperCase()
  }
  return null
}

function isValidColorInput(value: string): boolean {
  return normalizeColorString(value) !== null
}

function isValidAlphaValue(value: number | string): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 1
  }
  const trimmed = value.trim()
  if (!trimmed) return false
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateAndNormalizeDanmakuDraft(raw: Record<string, unknown>, index: number): Record<string, unknown> {
  const label = `第 ${index + 1} 条弹幕`
  if (!isFiniteNumber(raw.startTime) || raw.startTime < 0) {
    throw new Error(`${label}的 startTime 必须是大于等于 0 的有限数字`)
  }
  if (!isFiniteNumber(raw.layer) || raw.layer < 0) {
    throw new Error(`${label}的 layer 必须是大于等于 0 的有限数字`)
  }
  if (!isRecord(raw.content)) {
    throw new Error(`${label}缺少有效的 content 对象`)
  }
  if (typeof raw.content.text !== 'string') {
    throw new Error(`${label}的 content.text 必须是字符串`)
  }
  if (typeof raw.content.font !== 'string' || !raw.content.font.trim()) {
    throw new Error(`${label}的 content.font 必须是非空字符串`)
  }
  if (!isFiniteNumber(raw.content.size) || raw.content.size <= 0 || raw.content.size > 2000) {
    throw new Error(`${label}的 content.size 必须是 0 到 2000 之间的有效数字`)
  }
  if (typeof raw.content.color !== 'string') {
    throw new Error(`${label}的 content.color 必须是颜色字符串`)
  }
  const normalizedColor = normalizeColorString(raw.content.color)
  if (!normalizedColor) {
    throw new Error(`${label}的 content.color 颜色格式无效（支持 #RGB、#RRGGBB 或 rgb(r,g,b)）`)
  }
  if (typeof raw.content.stroke !== 'boolean') {
    throw new Error(`${label}的 content.stroke 必须是布尔值`)
  }
  if (
    !isRecord(raw.transform) ||
    !isRecord(raw.transform.start) ||
    !isRecord(raw.transform.end) ||
    !isFiniteNumber(raw.transform.start.x) ||
    !isFiniteNumber(raw.transform.start.y) ||
    !isFiniteNumber(raw.transform.end.x) ||
    !isFiniteNumber(raw.transform.end.y) ||
    !isFiniteNumber(raw.transform.zRotate) ||
    !isFiniteNumber(raw.transform.yRotate)
  ) {
    throw new Error(`${label}的 transform 字段结构或坐标/角度数值无效`)
  }
  if (
    !isRecord(raw.opacity) ||
    !isFiniteNumber(raw.opacity.from) ||
    !isFiniteNumber(raw.opacity.to) ||
    raw.opacity.from < 0 || raw.opacity.from > 1 ||
    raw.opacity.to < 0 || raw.opacity.to > 1
  ) {
    throw new Error(`${label}的 opacity.from 与 opacity.to 必须是 0 到 1 之间的有限数字`)
  }
  if (!isRecord(raw.animation)) {
    throw new Error(`${label}缺少有效的 animation 对象`)
  }
  if (raw.animation.duration !== undefined && (!isFiniteNumber(raw.animation.duration) || raw.animation.duration <= 0)) {
    throw new Error(`${label}的 animation.duration 必须是大于 0 的有限数字`)
  }
  if (!isFiniteNumber(raw.animation.moveDuration) || raw.animation.moveDuration < 0) {
    throw new Error(`${label}的 animation.moveDuration 必须是非负有限数字`)
  }
  if (!isFiniteNumber(raw.animation.delay) || raw.animation.delay < 0) {
    throw new Error(`${label}的 animation.delay 必须是非负有限数字`)
  }
  if (raw.animation.easing !== 'speedup' && raw.animation.easing !== 'speeddown') {
    throw new Error(`${label}的 animation.easing 必须是 speedup 或 speeddown`)
  }

  return {
    ...raw,
    content: {
      ...raw.content,
      color: normalizedColor
    }
  }
}

function extractDanmakuDrafts(parsed: unknown, sourceLabel: string, maxCount = MAX_DANMAKU_FILE_ITEMS): Record<string, unknown>[] {
  let drafts: unknown[]
  if (Array.isArray(parsed)) {
    drafts = parsed
  } else if (isRecord(parsed)) {
    if (Array.isArray(parsed.danmakus)) drafts = parsed.danmakus
    else if (Array.isArray(parsed.items)) drafts = parsed.items
    else drafts = [parsed]
  } else {
    throw new Error(`${sourceLabel}必须包含弹幕对象、弹幕数组，或带 danmakus/items 数组的工程对象`)
  }
  if (drafts.length === 0 || drafts.some((item) => !isRecord(item))) {
    throw new Error(`${sourceLabel}中没有有效的弹幕对象`)
  }
  if (drafts.length > maxCount) {
    throw new Error(`${sourceLabel}包含的弹幕数量超过单次上限（${maxCount} 条）`)
  }
  return (drafts as Record<string, unknown>[]).map((draft, index) => validateAndNormalizeDanmakuDraft(draft, index))
}

async function readJsonFile(rawPath: string, label: string, maxBytes = MAX_INPUT_JSON_FILE_BYTES): Promise<{ path: string; parsed: unknown }> {
  const path = resolveRequiredPath(rawPath, label)
  let fileStat
  try {
    fileStat = await stat(path)
  } catch (error) {
    throw new Error(`无法读取 ${label} 文件：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!fileStat.isFile()) throw new Error(`${label} 必须指向一个文件`)
  if (fileStat.size > maxBytes) {
    throw new Error(`${label} 文件不能超过 ${Math.round(maxBytes / (1024 * 1024))} MiB`)
  }
  let parsed: unknown
  try {
    const raw = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    throw new Error(`${label} JSON 文件格式无效：${error instanceof Error ? error.message : String(error)}`)
  }
  return { path, parsed }
}

async function assertWritableOutputPath(rawPath: string, label = 'outputPath'): Promise<string> {
  const path = resolveRequiredPath(rawPath, label)
  try {
    const existing = await stat(path)
    if (existing.isDirectory()) {
      throw new Error(`${label} 不能指向已存在的目录`)
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return path
    }
    if (error instanceof Error && error.message.includes('不能指向已存在的目录')) {
      throw error
    }
    throw new Error(`无法检查 ${label} 路径：${error instanceof Error ? error.message : String(error)}`)
  }
  return path
}

async function writeFileAtomic(targetPath: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(targetPath)
  await mkdir(dir, { recursive: true })
  const tempPath = join(dir, `.m7-mcp-${process.pid}-${randomUUID()}.tmp`)
  try {
    await writeFile(tempPath, data)
    await rename(tempPath, targetPath)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

function resolveIdsArg(ids: string | string[], maxCount = 10_000): string[] {
  if (typeof ids === 'string') {
    return expandIdList(ids, maxCount)
  }
  const unique = [...new Set(ids.map((item) => item.trim()).filter(Boolean))]
  if (unique.length === 0) {
    throw new Error('弹幕 ID 列表不能为空')
  }
  if (unique.length > maxCount) {
    throw new Error(`弹幕 ID 数量超过上限（${maxCount} 个）`)
  }
  return unique
}

async function extractIdsFromFile(rawPath: string, label: string, maxCount = 10_000): Promise<string[]> {
  const { parsed } = await readJsonFile(rawPath, label)
  if (typeof parsed === 'string') {
    return expandIdList(parsed, maxCount)
  }
  const collectStringIds = (list: unknown[]) => {
    const ids: string[] = []
    const seen = new Set<string>()
    for (const item of list) {
      let id: string | null = null
      if (typeof item === 'string') {
        id = item.trim()
      } else if (isRecord(item) && typeof item.id === 'string') {
        id = item.id.trim()
      }
      if (!id) {
        throw new Error(`${label} 中的 ID 列表包含无效或空的条目`)
      }
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    if (ids.length === 0) throw new Error(`${label} 中未找到有效弹幕 ID`)
    if (ids.length > maxCount) throw new Error(`${label} 包含的 ID 数量超过上限（${maxCount} 个）`)
    return ids
  }
  if (Array.isArray(parsed)) {
    return collectStringIds(parsed)
  }
  if (isRecord(parsed)) {
    if (typeof parsed.ids === 'string') return expandIdList(parsed.ids, maxCount)
    if (Array.isArray(parsed.ids)) return collectStringIds(parsed.ids)
    if (Array.isArray(parsed.danmakus)) return collectStringIds(parsed.danmakus)
    if (Array.isArray(parsed.items)) return collectStringIds(parsed.items)
  }
  throw new Error(`${label} 必须包含 ID 范围字符串、ID 数组，或带 ids/danmakus/items 字段的对象`)
}

async function validateDanmakusJsonFile(jsonPath: string): Promise<string> {
  const { path, parsed } = await readJsonFile(jsonPath, 'jsonPath')
  extractDanmakuDrafts(parsed, 'JSON 文件', MAX_DANMAKU_FILE_ITEMS)
  return path
}

const emptyInput = z.strictObject({})
const scopeInput = z.enum(['S', 'E', 'B']).describe('S 仅起始坐标，E 仅结束坐标，B 两端坐标')

function resultForMcp(value: unknown) {
  const result = value as { ok?: boolean; code?: string; message?: string } | null
  const isError = result?.ok === false
  if (
    value && typeof value === 'object' &&
    typeof (value as Record<string, unknown>).dataBase64 === 'string' &&
    typeof (value as Record<string, unknown>).mimeType === 'string'
  ) {
    const frame = value as {
      dataBase64: string
      mimeType: string
      width: number
      height: number
      timeMs: number
      outputPath?: string
      returnImage?: boolean
    }
    const metadata: Record<string, unknown> = {
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
      timeMs: frame.timeMs,
      ...(frame.outputPath ? { outputPath: frame.outputPath } : {})
    }
    if (frame.outputPath && frame.returnImage === false) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(metadata) }]
      }
    }
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(metadata) },
        { type: 'image' as const, data: frame.dataBase64, mimeType: frame.mimeType }
      ]
    }
  }
  const errorMessage = result?.message || '编辑失败'
  const text = isError
    ? (result?.code ? `[${result.code}] ${errorMessage}` : errorMessage)
    : (JSON.stringify(value) ?? 'null')
  return isError
    ? { content: [{ type: 'text' as const, text }], isError: true }
    : { content: [{ type: 'text' as const, text }] }
}

function stripNullish<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && val !== undefined) {
      out[key] = val
    }
  }
  return out
}

function compactEditorApiResult(value: unknown): unknown {
  if (!isRecord(value) || value.ok === false) return value
  const changedIds = Array.isArray(value.changedIds) ? value.changedIds as string[] : []
  const createdIds = Array.isArray(value.createdIds) ? value.createdIds as string[] : []
  const selectedIds = Array.isArray(value.selectedIds) ? value.selectedIds as string[] : []
  const warnings = Array.isArray(value.warnings) ? value.warnings as string[] : []

  const compact: Record<string, unknown> = { ok: true }
  if (changedIds.length > 0) {
    compact.changedCount = changedIds.length
    compact.changedIds = compressIdList(changedIds)
  }
  if (createdIds.length > 0) {
    compact.createdCount = createdIds.length
    compact.createdIds = compressIdList(createdIds)
  }
  compact.selectedCount = selectedIds.length
  if (selectedIds.length > 0) {
    compact.selectedIds = compressIdList(selectedIds)
  }
  if (warnings.length > 0) {
    compact.warnings = warnings
  }
  return compact
}

function compactEditorState(value: unknown): unknown {
  if (!isRecord(value)) return value
  const compact: Record<string, unknown> = {
    version: value.version,
    ready: value.ready,
    projectMode: value.projectMode,
    ...(value.activeFolderProject ? { activeFolderProject: value.activeFolderProject } : {}),
    showProjectManager: value.showProjectManager,
    danmakuCount: value.danmakuCount,
    ...(value.timelineRange ? { timelineRange: value.timelineRange } : {}),
    selectedCount: value.selectedCount,
    selectedIds: Array.isArray(value.selectedIds) ? compressIdList(value.selectedIds as string[]) : '',
    screen: value.screen,
    maxLayers: value.maxLayers,
    canUndo: value.canUndo,
    canRedo: value.canRedo,
    media: isRecord(value.media)
      ? (value.media.hasMedia === false ? { hasMedia: false } : stripNullish(value.media))
      : value.media,
    useWebglVideoExport: value.useWebglVideoExport,
    videoExport: isRecord(value.videoExport) ? stripNullish(value.videoExport) : value.videoExport
  }
  return compact
}

function compactHistorySnapshots(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  let currentIndex = -1
  const snapshots = value.map((entry) => {
    if (!isRecord(entry)) return entry
    if (entry.isCurrent === true && typeof entry.index === 'number') {
      currentIndex = entry.index
    }
    const changed = Array.isArray(entry.changedIds) ? compressIdList(entry.changedIds as string[]) : ''
    const created = Array.isArray(entry.createdIds) ? compressIdList(entry.createdIds as string[]) : ''
    const deleted = Array.isArray(entry.deletedIds) ? compressIdList(entry.deletedIds as string[]) : ''
    return {
      snapshotId: entry.snapshotId,
      index: entry.index,
      createdAt: entry.createdAt,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.isCurrent === true ? { isCurrent: true } : {}),
      ...(changed ? { changedIds: changed } : {}),
      ...(created ? { createdIds: created } : {}),
      ...(deleted ? { deletedIds: deleted } : {})
    }
  })
  return { total: snapshots.length, currentIndex, snapshots }
}

function compactFileSystemState(value: unknown): unknown {
  if (!isRecord(value)) return value
  const projects = Array.isArray(value.projects)
    ? value.projects.map((proj) => {
        if (!isRecord(proj)) return proj
        const next: Record<string, unknown> = { ...stripNullish(proj) }
        if (isRecord(proj.config)) {
          const cfg = stripNullish(proj.config)
          if (cfg.description === '') delete cfg.description
          if (isRecord(cfg.media)) cfg.media = stripNullish(cfg.media)
          next.config = cfg
        }
        return next
      })
    : value.projects
  return {
    ...stripNullish(value),
    ...(projects !== undefined ? { projects } : {})
  }
}

function compactVideoExportResponse(value: unknown): unknown {
  return isRecord(value) ? stripNullish(value) : value
}

function compactGenericResult(value: unknown): unknown {
  if (!isRecord(value)) return value
  const cleaned = stripNullish(value)
  if (Array.isArray(cleaned.warnings) && cleaned.warnings.length === 0) {
    delete cleaned.warnings
  }
  return cleaned
}

function sanitizeLogsResult(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.items)) return value
  const items = value.items.map((item) => {
    if (!isRecord(item) || item.additionalInfo === undefined) return item
    let serialized: string
    try {
      serialized = JSON.stringify(item.additionalInfo) ?? ''
    } catch {
      serialized = String(item.additionalInfo)
    }
    if (serialized.length <= MAX_LOG_ADDITIONAL_INFO_CHARS) return item
    return {
      ...item,
      additionalInfo: {
        truncated: true,
        originalChars: serialized.length,
        preview: serialized.slice(0, 1024) + '...'
      }
    }
  })
  return { ...value, items }
}

function resolveRequiredPath(value: string, label: string): string {
  if (value.includes('\0')) {
    throw new Error(`${label}不能包含空字符`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label}不能为空`)
  }
  return resolve(trimmed)
}

function resolveOptionalPath(value?: string): string | undefined {
  if (value !== undefined && value.includes('\0')) {
    throw new Error('路径不能包含空字符')
  }
  const trimmed = value?.trim()
  return trimmed ? resolve(trimmed) : undefined
}

function createMcpServer() {
  const server = new McpServer({ name: 'm7-editor', version: '1.12.0' }, {
    capabilities: { tools: {} },
    instructions: '控制当前运行的 m7-editor 编辑会话。强烈建议采用“程序生成 + 外部文件”工作流：批量创建/读取/测量/更新/删除/查询日志或快照时，优先用脚本读写本机 JSON 文件并通过 jsonPath / inputPath / idsPath / outputPath 传参，避免在上下文中传输大段 JSON。返回的 ID 列表与 selectedIds 统一压缩为范围字符串（如 "1~3,7,19"），可直接用于 select_by_command（id:"1~3,7,19"）、list_danmakus.ids 与 delete_danmakus.ids。当 get_editor_state 返回 ready=false 时，可先调用工程工具打开或创建工程。get_frame 支持 outputPath 保存图片并默认省略 base64 返回以节省上下文。export_video 异步/短等待导出 .mp4 视频。保存/备份仅支持文件夹工程。reload_app 会清空内存历史快照与未保存状态，仅在需从本地更新工程信息时使用。'
  })

  function registerTool<Schema extends z.ZodType>(
    name: string,
    title: string,
    description: string,
    inputSchema: Schema,
    invoke: (input: z.output<Schema>) => Promise<unknown>,
    readOnly = false
  ) {
    server.registerTool(name, {
      title,
      description,
      inputSchema,
      ...(readOnly ? { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } } : {})
    }, async (input) => {
      try {
        return resultForMcp(await invoke(input as z.output<Schema>))
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
          isError: true
        }
      }
    })
  }

  registerTool(
    'get_editor_state',
    '读取编辑器状态',
    '读取当前运行的 m7-editor 会话、工程、画布、媒体信息（media）、时间轴弹幕范围（timelineRange）、视频导出设置与状态（useWebglVideoExport / videoExport）和选择状态（selectedIds 为压缩范围字符串，如 "1~3,7,19"）。',
    emptyInput,
    async () => compactEditorState(await callEditor('editor.getState')),
    true
  )
  const measureTextEntryInput = z.strictObject({
    text: z.string().max(10_000).describe('要测量的弹幕文本（支持 \\n 换行）'),
    font: z.string().trim().min(1, '字体名称不能为空').default('Microsoft YaHei').describe('字体名称，默认 Microsoft YaHei'),
    size: z.number().finite().min(1, '字号 size 不能小于 1').max(2000, '字号 size 不能超过 2000').default(60).describe('字号（像素），默认 60'),
    zRotate: z.number().finite().default(0).describe('Z 轴旋转角度（度），默认 0'),
    stroke: z.boolean().default(false).describe('是否开启描边，默认 false')
  })
  registerTool(
    'measure_text',
    '测量文字渲染尺寸',
    '只读测量弹幕文本在当前编辑器渲染层的实际像素宽高（rawWidth/rawHeight）、Z 轴旋转后包围盒宽高（width/height）以及居中参考坐标（centerX/centerY）。支持 text（单条）、items（数组）或 inputPath（本机 JSON 文件，最多 2000 条）三选一，并支持 outputPath 将测量结果写入 JSON 文件仅返回摘要。',
    z.strictObject({
      text: z.string().max(10_000).optional().describe('单条测量时的文本；与 items、inputPath 三选一'),
      font: z.string().trim().min(1, '字体名称不能为空').optional().describe('单条测量时的字体，默认 Microsoft YaHei'),
      size: z.number().finite().min(1, '字号 size 不能小于 1').max(2000, '字号 size 不能超过 2000').optional().describe('单条测量时的字号（像素），默认 60'),
      zRotate: z.number().finite().optional().describe('单条测量时的 Z 轴旋转角度（度），默认 0'),
      stroke: z.boolean().optional().describe('单条测量时是否开启描边，默认 false'),
      items: z.array(measureTextEntryInput).min(1).max(100).optional().describe('批量测量的条目数组；与 text、inputPath 三选一'),
      inputPath: z.string().trim().min(1, 'inputPath 不能为空').optional().describe('本机 JSON 文件路径（支持条目数组、{ items: [...] } 或单条对象，最多 2000 条）；与 text、items 三选一'),
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选输出 JSON 文件路径；传入时将测量结果写入文件并仅返回摘要')
    }).superRefine((input, context) => {
      const sourceCount = (input.text !== undefined ? 1 : 0) + (input.items !== undefined ? 1 : 0) + (input.inputPath !== undefined ? 1 : 0)
      if (sourceCount !== 1) {
        context.addIssue({ code: 'custom', message: '请在 text、items 和 inputPath 中三选一' })
      }
      if (
        (input.items !== undefined || input.inputPath !== undefined) &&
        (input.font !== undefined || input.size !== undefined || input.zRotate !== undefined || input.stroke !== undefined)
      ) {
        context.addIssue({
          code: 'custom',
          message: '使用 items 或 inputPath 批量测量时，请将 font、size、zRotate、stroke 写在每个条目内，不要与顶层单条参数混用'
        })
      }
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      let response: Record<string, unknown>

      if (input.inputPath !== undefined) {
        const { parsed } = await readJsonFile(input.inputPath, 'inputPath')
        const rawEntries = Array.isArray(parsed)
          ? parsed
          : (isRecord(parsed) && Array.isArray(parsed.items))
            ? parsed.items
            : isRecord(parsed)
              ? [parsed]
              : null
        if (!rawEntries) {
          throw new Error('inputPath 必须包含测量条目数组、{ items: [...] } 或单条测量对象')
        }
        const validatedItems = z.array(measureTextEntryInput)
          .min(1, '测量条目不能为空')
          .max(2000, '单次最多测量 2000 条')
          .parse(rawEntries)

        let screen: unknown = null
        const allResults: unknown[] = []
        for (let offset = 0; offset < validatedItems.length; offset += 500) {
          const chunk = validatedItems.slice(offset, offset + 500)
          const batchRes = await callEditor('editor.measureText', { items: chunk }) as { screen?: unknown; items?: unknown[] }
          if (screen === null && batchRes.screen !== undefined) screen = batchRes.screen
          if (Array.isArray(batchRes.items)) allResults.push(...batchRes.items)
        }
        response = { screen, items: allResults }
      } else if (input.items !== undefined) {
        response = await callEditor('editor.measureText', { items: input.items }) as Record<string, unknown>
      } else {
        response = await callEditor('editor.measureText', {
          text: input.text,
          font: input.font ?? 'Microsoft YaHei',
          size: input.size ?? 60,
          zRotate: input.zRotate ?? 0,
          stroke: input.stroke ?? false
        }) as Record<string, unknown>
      }

      if (outPath) {
        const screen = response.screen
        const items = Array.isArray(response.items)
          ? response.items
          : [(() => {
              const { screen: _ignored, ...rest } = response
              return rest
            })()]
        await writeFileAtomic(outPath, JSON.stringify({ screen, items }))
        return { ok: true, outputPath: outPath, count: items.length, screen }
      }
      return response
    },
    true
  )
  registerTool(
    'get_frame',
    '获取指定时间帧',
    '在指定时间渲染当前工程画面（JPEG）。可传入 outputPath 将图像保存到本地文件（推荐 .jpg/.jpeg），此时默认不返回内联图片（returnImage=false）以节省上下文；不传 outputPath 时默认返回图片内容供视觉检查。不会移动主窗口播放头或修改工程；maxDimension 默认 1280，最大 1920。',
    z.strictObject({
      timeMs: z.number().finite().nonnegative().describe('时间轴位置，单位毫秒'),
      maxDimension: z.number().int().min(16).max(1920).default(1280).describe('输出图像最长边像素；超过工程画布尺寸时会等比缩小'),
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选本地保存路径（推荐 .jpg/.jpeg，输出格式为 JPEG）'),
      returnImage: z.boolean().optional().describe('是否在响应中返回图片；不传 outputPath 时默认 true，传入 outputPath 时默认 false')
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      const frame = await callEditor('editor.captureFrame', {
        timeMs: input.timeMs,
        maxDimension: input.maxDimension
      }) as { dataBase64: string; mimeType: string; width: number; height: number; timeMs: number }
      const returnImage = input.returnImage ?? (outPath === undefined)
      if (outPath) {
        await writeFileAtomic(outPath, Buffer.from(frame.dataBase64, 'base64'))
        return { ...frame, outputPath: outPath, returnImage }
      }
      return frame
    },
    true
  )
  registerTool(
    'list_danmakus',
    '读取弹幕',
    '读取当前选择或全部弹幕（selectedOnly=false）。支持 ids 压缩范围字符串（如 "1~3,7,19"）、数组或 idsPath 文件白名单，支持 idsOnly 仅返回压缩 ID 列表，强烈推荐传入 outputPath 直接导出全量弹幕 JSON 到磁盘供脚本分析（不受 500 条分页上限限制）。',
    z.strictObject({
      ids: z.union([
        z.string().trim().min(1, '弹幕 ID 列表不能为空'),
        z.array(z.string().trim().min(1, '弹幕 ID 不能为空')).min(1).max(10_000)
      ]).optional().describe('可选弹幕 ID 白名单，支持压缩范围字符串（如 "1~3,7,19"）或字符串数组；与 idsPath 互斥，传入时忽略 selectedOnly'),
      idsPath: z.string().trim().min(1, 'idsPath 不能为空').optional().describe('本机 JSON 文件路径，读取弹幕 ID 白名单；与 ids 互斥'),
      selectedOnly: z.boolean().default(true).describe('是否只读当前选择'),
      offset: z.number().int().nonnegative().max(1_000_000).default(0),
      limit: z.number().int().min(1).max(100_000).optional().describe('读取条数；直接返回时默认 100（上限 500），传入 outputPath 且省略时导出全部匹配项'),
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选输出 JSON 文件路径；传入时由桌面端直接写出弹幕文件并仅返回摘要'),
      idsOnly: z.boolean().optional().describe('为 true 时仅返回匹配弹幕总数与压缩 ID 范围字符串；与 outputPath 互斥')
    }).superRefine((input, context) => {
      if (input.ids !== undefined && input.idsPath !== undefined) {
        context.addIssue({ code: 'custom', message: 'ids 与 idsPath 不能同时传入' })
      }
      if (input.idsOnly === true && input.outputPath !== undefined) {
        context.addIssue({ code: 'custom', message: 'idsOnly 与 outputPath 不能同时使用' })
      }
      if (input.outputPath === undefined && input.limit !== undefined && input.limit > 500) {
        context.addIssue({ code: 'custom', message: '未使用 outputPath 时 limit 不能超过 500' })
      }
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      const resolvedIds = input.ids !== undefined
        ? resolveIdsArg(input.ids, 10_000)
        : input.idsPath !== undefined
          ? await extractIdsFromFile(input.idsPath, 'idsPath', 10_000)
          : undefined

      if (outPath) {
        const res = await callEditor('editor.getDanmakus', {
          ...(resolvedIds ? { ids: resolvedIds } : {}),
          selectedOnly: input.selectedOnly,
          offset: input.offset,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          outputPath: outPath
        }) as Record<string, unknown>
        return {
          ok: true,
          outputPath: res.outputPath ?? outPath,
          total: res.total,
          offset: res.offset,
          exportedCount: res.exportedCount,
          ...(Array.isArray(res.ids) ? { ids: compressIdList(res.ids as string[]) } : {})
        }
      }

      if (input.idsOnly === true) {
        const res = await callEditor('editor.getDanmakus', {
          ...(resolvedIds ? { ids: resolvedIds } : {}),
          selectedOnly: input.selectedOnly,
          idsOnly: true
        }) as { total: number; ids: string[] }
        return {
          total: res.total,
          ids: compressIdList(res.ids)
        }
      }

      return callEditor('editor.getDanmakus', {
        ...(resolvedIds ? { ids: resolvedIds } : {}),
        selectedOnly: input.selectedOnly,
        offset: input.offset,
        limit: input.limit ?? 100
      })
    },
    true
  )

  const UPDATABLE_FIELD_PATHS = [
    'layer', 'startTime', 'content.text', 'content.font', 'content.size', 'content.color', 'content.stroke',
    'transform.start.x', 'transform.start.y', 'transform.end.x', 'transform.end.y',
    'transform.zRotate', 'transform.yRotate', 'opacity.from', 'opacity.to',
    'animation.duration', 'animation.moveDuration', 'animation.delay', 'animation.easing'
  ] as const
  const updatableFieldInput = z.enum(UPDATABLE_FIELD_PATHS)
  const upsetMethodInput = z.strictObject({
    op: z.literal('upset'),
    seed: z.number().finite().optional().describe('可选随机种子；传入后可复现相同的打乱顺序')
  }).describe('在当前选择内随机打乱该字段现有值（仅限传此对象，不能与表达式或赋值混用；避免与文本内容 "upset" 混淆）')
  const fieldMethodInput = z.union([z.string(), z.number().finite(), z.boolean(), upsetMethodInput])

  registerTool(
    'apply_field_update',
    '更新弹幕字段',
    '通过统一编辑 API 修改当前选择的单个字段。支持文本/颜色/字体/描边/缓动/数值赋值、相对运算、随机值、$ 数学表达式，或传入 { "op": "upset", "seed?": 数字 } 在当前选择内随机打乱该字段值（与赋值/表达式互斥；对文本字段需显式传此对象，纯字符串 "upset" 会按字面文本写入）。',
    z.strictObject({
      field: updatableFieldInput.describe('字段路径，例如 transform.start.x、content.text、opacity.from'),
      method: fieldMethodInput
        .describe('字段输入值/操作方法（数字字段支持 +2、* 等规则及 $表达式），或 { "op": "upset", "seed?": 数字 }')
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', input))
  )
  const fieldUpdateItemInput = z.strictObject({
    field: updatableFieldInput.describe('字段路径，例如 transform.start.x、content.text、opacity.from'),
    method: fieldMethodInput
      .describe('赋值/运算/随机/$表达式，或 { "op": "upset", "seed?": 数字 }（与表达式互斥）')
  })
  const stepsArraySchema = z.array(
    z.array(fieldUpdateItemInput).min(1).max(50).describe('同一执行步内的更新列表；同一步内共享步前原值快照，字段不可重复')
  ).min(1).max(50).describe('按顺序执行的步骤二维数组，例如 [[{field:"transform.start.x",method:"$endX"},{field:"transform.end.x",method:"$startX"}], [{field:"content.text",method:{op:"upset"}}]]')
    .superRefine((steps, context) => {
      const totalEntries = steps.reduce((total, step) => total + step.length, 0)
      if (totalEntries > 200) {
        context.addIssue({ code: 'custom', message: '所有步骤的更新条目总数不能超过 200' })
      }
      steps.forEach((step, stepIndex) => {
        const seen = new Set<string>()
        for (const item of step) {
          if (seen.has(item.field)) {
            context.addIssue({
              code: 'custom',
              message: `第 ${stepIndex + 1} 步中存在重复字段：${item.field}（如需先后多次修改同一字段，请拆到不同步骤）`
            })
            break
          }
          seen.add(item.field)
        }
      })
    })
  registerTool(
    'apply_field_updates',
    '批量分步更新多个弹幕字段',
    '在单次原子操作（单个撤销步骤）中，按二维数组 steps 分步更新当前选择的多个字段（支持数值、文本、字体、颜色、描边、缓动及 upset 打乱）。支持直接传 steps 或通过 inputPath 读取本机 JSON 文件（{ steps: [...] } 或二维数组）。外层 steps 串行执行，同一步内共享步前原值快照；任一项失败整批回滚。',
    z.strictObject({
      steps: stepsArraySchema.optional(),
      inputPath: z.string().trim().min(1, 'inputPath 不能为空').optional().describe('本机 JSON 文件路径（包含 { steps: [...] } 或步骤二维数组）；与 steps 二选一')
    }).superRefine((input, context) => {
      if ((input.steps !== undefined) === (input.inputPath !== undefined)) {
        context.addIssue({ code: 'custom', message: '请在 steps 和 inputPath 中二选一' })
      }
    }),
    async (input) => {
      let resolvedSteps = input.steps
      if (input.inputPath !== undefined) {
        const { parsed } = await readJsonFile(input.inputPath, 'inputPath')
        const rawSteps = Array.isArray(parsed)
          ? parsed
          : (isRecord(parsed) ? parsed.steps : undefined)
        resolvedSteps = stepsArraySchema.parse(rawSteps)
      }
      return compactEditorApiResult(await callEditor('editor.applyFieldUpdate', {
        field: '@danmaku.updateFields',
        method: { steps: resolvedSteps }
      }))
    }
  )
  const danmakuObjectInput = z.record(z.string(), z.unknown())
  const colorStringInput = z.string().trim().min(1, '颜色不能为空').refine(
    isValidColorInput,
    '颜色格式无效（支持 #RGB、#RRGGBB 或 rgb(r,g,b)）'
  )
  const numericGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('range'),
      start: z.number().finite(),
      end: z.number().finite(),
      expression: z.string().trim().min(1, 'expression 不能为空字符串').max(2000).optional().describe('可选数学表达式；支持 S、E、i、n、t、width、height、rawWidth、rawHeight、boxWidth、boxHeight、bezier(...)、seededRandom(seed, index?) 及其他字段路径（注意避免宽高变量的循环引用）')
    }),
    z.strictObject({
      mode: z.literal('relative'),
      start: z.number().finite(),
      step: z.union([z.number().finite(), z.string().trim().min(1, 'step 不能为空')]).describe('creationTools 相对步长，例如 +20、*1.1')
    }),
    z.strictObject({
      mode: z.literal('cycle'),
      values: z.array(z.union([z.number().finite(), z.string().trim().min(1, 'cycle 表达式不能为空').max(1000)])).min(1).max(10_000)
    })
  ])
  const colorGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('range'), start: colorStringInput, target: colorStringInput }),
    z.strictObject({
      mode: z.literal('relative'),
      start: colorStringInput,
      target: colorStringInput,
      alpha: z.union([z.number().finite(), z.string().trim().min(1)]).refine(
        isValidAlphaValue,
        'alpha 必须是 0 到 1 之间的数字'
      )
    }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(colorStringInput).min(1).max(10_000) })
  ])
  const textGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.string().max(10_000).describe('文字；可使用反引号模板，例如 `第 ${i + 1} 条`（模板内不允许引用 rawWidth/rawHeight/boxWidth/boxHeight）') }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.string().max(10_000)).min(1).max(10_000) })
  ])
  const fontGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.string().trim().min(1, '字体名称不能为空') }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.string().trim().min(1, '字体名称不能为空')).min(1).max(10_000) })
  ])
  const strokeGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.boolean() }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.boolean()).min(1).max(10_000) })
  ])
  const easingGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.enum(['speedup', 'speeddown']) }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.enum(['speedup', 'speeddown'])).min(1).max(10_000) })
  ])
  const generationRules = z.strictObject({
    layer: numericGenerationRule.optional(),
    startTime: numericGenerationRule.optional(),
    'content.size': numericGenerationRule.optional(),
    'transform.start.x': numericGenerationRule.optional(),
    'transform.start.y': numericGenerationRule.optional(),
    'transform.end.x': numericGenerationRule.optional(),
    'transform.end.y': numericGenerationRule.optional(),
    'transform.zRotate': numericGenerationRule.optional(),
    'transform.yRotate': numericGenerationRule.optional(),
    'opacity.from': numericGenerationRule.optional(),
    'opacity.to': numericGenerationRule.optional(),
    'animation.duration': numericGenerationRule.optional(),
    'animation.moveDuration': numericGenerationRule.optional(),
    'animation.delay': numericGenerationRule.optional(),
    'content.color': colorGenerationRule.optional(),
    'content.text': textGenerationRule.optional(),
    'content.font': fontGenerationRule.optional(),
    'content.stroke': strokeGenerationRule.optional(),
    'animation.easing': easingGenerationRule.optional()
  }).refine((rules) => Object.values(rules).some((rule) => rule !== undefined), 'rules 至少需要提供一个字段规则')
  const generatedRuleFileSchema = z.strictObject({
    quantity: z.number().int().min(1).max(10_000),
    alignToTimeMs: z.number().finite().nonnegative().optional(),
    rules: generationRules
  })

  registerTool(
    'create_generated_danmakus',
    '按 creationTools 规则生成弹幕',
    '用 creationTools 同一规则引擎批量生成并创建弹幕（单次最多 10000 条）。可直接传 quantity + rules，或通过 inputPath 从本机 JSON 文件读取 { quantity, rules, alignToTimeMs? }；未指定字段沿用默认值（未指定 startTime 规则时默认从 alignToTimeMs ?? 0 毫秒开始每条 +100 ms）。省略 alignToTimeMs 时保留规则生成的绝对 startTime；传入 alignToTimeMs（毫秒）时将整批最早的生成弹幕对齐到该时间点并自动分配层级。新弹幕会自动选中。',
    z.strictObject({
      quantity: z.number().int().min(1).max(10_000).optional(),
      alignToTimeMs: z.number().finite().nonnegative().optional().describe('可选目标对齐时间（毫秒）；传入时将整批最早的生成弹幕对齐到该时间点并按插入规则分配层级；省略时保留规则生成的绝对 startTime'),
      rules: generationRules.optional(),
      inputPath: z.string().trim().min(1, 'inputPath 不能为空').optional().describe('本机 JSON 文件路径（包含 { quantity, rules, alignToTimeMs? }）；与 quantity/rules 二选一')
    }).superRefine((input, context) => {
      if (input.inputPath !== undefined) {
        if (input.quantity !== undefined || input.rules !== undefined) {
          context.addIssue({ code: 'custom', message: '使用 inputPath 时不要同时传入 quantity 或 rules' })
        }
      } else if (input.quantity === undefined || input.rules === undefined) {
        context.addIssue({ code: 'custom', message: '未传入 inputPath 时，quantity 和 rules 均为必填项' })
      }
    }),
    async (input) => {
      let payload: { quantity: number; rules: z.output<typeof generationRules>; alignToTimeMs?: number }
      if (input.inputPath !== undefined) {
        const { parsed } = await readJsonFile(input.inputPath, 'inputPath')
        const spec = generatedRuleFileSchema.parse(parsed)
        const alignToTimeMs = input.alignToTimeMs ?? spec.alignToTimeMs
        payload = {
          quantity: spec.quantity,
          rules: spec.rules,
          ...(alignToTimeMs !== undefined ? { alignToTimeMs } : {})
        }
      } else {
        payload = {
          quantity: input.quantity!,
          rules: input.rules!,
          ...(input.alignToTimeMs !== undefined ? { alignToTimeMs: input.alignToTimeMs } : {})
        }
      }
      return compactEditorApiResult(await callEditor('editor.createGeneratedDanmakus', payload))
    }
  )

  registerTool(
    'create_danmakus',
    '创建弹幕',
    '从本机 JSON 文件（推荐，支持最多 32 MiB / 10000 条且由桌面端直接读取，不占上下文与桥接载荷）或直接传入的弹幕对象/数组创建弹幕。省略 alignToTimeMs 时保留输入弹幕的绝对 startTime；传入 alignToTimeMs（毫秒）时按 insertDanmakus 规则将整批最早的弹幕对齐到该时间点并自动分配层级。输入中的 id 会被忽略。',
    z.strictObject({
      danmaku: z.union([danmakuObjectInput, z.array(danmakuObjectInput).min(1).max(5000)]).optional().describe('一个弹幕对象或弹幕对象数组（大批量建议使用脚本写文件后改传 jsonPath）'),
      jsonPath: z.string().trim().min(1, 'jsonPath 不能为空').optional().describe('推荐：本机 JSON 文件路径；相对路径以 MCP 工作目录为基准。支持弹幕对象、弹幕数组或包含 danmakus/items 数组的工程 JSON（最大 32 MiB、10000 条）'),
      alignToTimeMs: z.number().finite().nonnegative().optional().describe('可选目标对齐时间（毫秒）；传入时将整批最早的弹幕对齐到该时间点并按插入规则分配层级；省略时保留输入弹幕的绝对 startTime')
    }).superRefine((input, context) => {
      if ((input.danmaku !== undefined) === (input.jsonPath !== undefined)) {
        context.addIssue({ code: 'custom', message: '请在 danmaku 对象和 jsonPath 路径中二选一' })
      }
    }),
    async (input) => {
      if (input.jsonPath !== undefined) {
        const resolvedPath = await validateDanmakusJsonFile(input.jsonPath)
        return compactEditorApiResult(await callEditor('editor.createDanmakusFromFile', {
          jsonPath: resolvedPath,
          ...(input.alignToTimeMs !== undefined ? { alignToTimeMs: input.alignToTimeMs } : {})
        }))
      }
      const danmakus = extractDanmakuDrafts(input.danmaku, 'danmaku 参数', 5000)
      return compactEditorApiResult(await callEditor('editor.applyFieldUpdate', {
        field: '@danmaku.create',
        method: {
          danmakus,
          ...(input.alignToTimeMs !== undefined ? { alignToTimeMs: input.alignToTimeMs } : {})
        }
      }))
    }
  )
  registerTool(
    'delete_danmakus',
    '删除弹幕',
    '删除指定 ID 的弹幕；支持数组、压缩范围字符串（如 "1~3,7,19"）或 inputPath 文件；都不传时删除当前选择。若任一指定 ID 不存在，会整批拒绝且不做部分删除。',
    z.strictObject({
      ids: z.union([
        z.string().trim().min(1, '弹幕 ID 列表不能为空'),
        z.array(z.string().trim().min(1, '弹幕 ID 不能为空')).min(1).max(10_000)
      ]).optional().describe('可选弹幕 ID 列表，支持压缩范围字符串（如 "1~3,7,19"）或数组；与 inputPath 互斥'),
      inputPath: z.string().trim().min(1, 'inputPath 不能为空').optional().describe('本机 JSON 文件路径（包含 ID 范围字符串、ID 数组或含 ids/danmakus 的对象）；与 ids 互斥')
    }).superRefine((input, context) => {
      if (input.ids !== undefined && input.inputPath !== undefined) {
        context.addIssue({ code: 'custom', message: 'ids 与 inputPath 不能同时传入' })
      }
    }),
    async (input) => {
      const resolvedIds = input.ids !== undefined
        ? resolveIdsArg(input.ids, 10_000)
        : input.inputPath !== undefined
          ? await extractIdsFromFile(input.inputPath, 'inputPath', 10_000)
          : undefined
      return compactEditorApiResult(await callEditor('editor.applyFieldUpdate', {
        field: '@danmaku.delete',
        method: resolvedIds ? { ids: resolvedIds } : {}
      }))
    }
  )
  registerTool(
    'update_editor_settings',
    '设置画布和层数',
    '更新画布屏幕宽高和/或最大层数。宽高最小为 10；最大层数决定自动分配层级的上限',
    z.strictObject({
      screenWidth: z.number().finite().positive().max(16384).optional(),
      screenHeight: z.number().finite().positive().max(16384).optional(),
      maxLayers: z.number().finite().positive().max(10000).optional()
    }).refine(
      (input) => input.screenWidth !== undefined || input.screenHeight !== undefined || input.maxLayers !== undefined,
      '请至少提供 screenWidth、screenHeight 或 maxLayers'
    ),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@editor.settings', method: input }))
  )
  registerTool(
    'save_folder_project',
    '保存文件夹工程',
    '将当前工程保存到已打开的文件夹工程目录。单文件工程会返回明确错误。',
    emptyInput,
    async () => compactGenericResult(await callEditor('editor.saveFolderProject'))
  )
  registerTool(
    'backup_folder_project',
    '备份文件夹工程',
    '保存当前工程并在文件夹工程的 backup 目录创建备份。单文件工程会返回明确错误。',
    emptyInput,
    async () => compactGenericResult(await callEditor('editor.backupFolderProject'))
  )
  registerTool(
    'get_file_system_state',
    '获取工程文件系统状态',
    '读取应用配置路径、日志目录、默认文件夹工程目录、全局设置以及已注册的文件夹工程列表，并同步刷新界面的工程管理列表；在 ready 为 false 时也可调用。',
    emptyInput,
    async () => compactFileSystemState(await callEditor('editor.getFileSystemState')),
    true
  )
  registerTool(
    'check_folder_project_path',
    '检查文件夹工程路径',
    '检查指定父目录（省略时使用默认工程目录）下按工程名称安全化后的文件夹工程路径是否已存在。',
    z.strictObject({
      name: z.string().trim().min(1),
      parentDir: z.string().optional()
    }),
    async (input) => compactGenericResult(await callEditor('editor.checkFolderProjectPath', {
      name: input.name,
      parentDir: resolveOptionalPath(input.parentDir)
    })),
    true
  )
  registerTool(
    'create_folder_project',
    '创建文件夹工程',
    '创建文件夹工程并立即加载到编辑器（同 UI 手动创建：切换到新工程、重置历史快照、刷新工程列表并关闭工程管理弹窗）。可通过 fromCurrent 从当前画布创建，或通过 fromProjectPath 从已有 JSON 工程文件创建，或留空创建默认空白工程；支持在 ready 为 false 时调用。',
    z.strictObject({
      name: z.string().trim().min(1),
      parentDir: z.string().optional(),
      fromCurrent: z.boolean().optional(),
      fromProjectPath: z.string().optional(),
      mediaPath: z.string().optional(),
      copyMedia: z.boolean().default(true),
      description: z.string().optional()
    }).superRefine((value, context) => {
      if (value.fromCurrent && value.fromProjectPath?.trim()) {
        context.addIssue({ code: 'custom', message: 'fromCurrent 与 fromProjectPath 不能同时指定' })
      }
    }),
    async (input) => compactGenericResult(await callEditor('editor.createFolderProject', {
      name: input.name,
      parentDir: resolveOptionalPath(input.parentDir),
      fromCurrent: input.fromCurrent ?? false,
      fromProjectPath: resolveOptionalPath(input.fromProjectPath),
      mediaPath: resolveOptionalPath(input.mediaPath),
      copyMedia: input.copyMedia,
      description: input.description
    }))
  )
  registerTool(
    'load_folder_project',
    '加载文件夹工程',
    '按工程文件夹路径加载已注册或有效的文件夹工程，重置历史快照、刷新工程列表并关闭工程管理弹窗（非阻塞，不弹确认框）；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    async (input) => compactGenericResult(await callEditor('editor.loadFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    }))
  )
  registerTool(
    'import_folder_project',
    '导入文件夹工程',
    '按本地文件夹路径导入外部文件夹工程，将其注册到应用工程列表并立即加载到编辑器（重置历史快照、刷新工程列表并关闭工程管理弹窗）；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    async (input) => compactGenericResult(await callEditor('editor.importFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    }))
  )
  registerTool(
    'edit_folder_project',
    '编辑文件夹工程配置',
    '编辑文件夹工程的名称、说明、父目录或媒体引用方式（内部拷贝 vs 外部链接），并刷新工程列表。若目标正是当前打开的文件夹工程，会同步更新内存中的工程路径、配置与媒体绑定，同时保留未保存的弹幕编辑；支持在 ready 为 false 时调用。',
    z.strictObject({
      projectPath: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      newParentDir: z.string().optional(),
      mediaUseExternalLink: z.boolean().optional(),
      mediaExternalPath: z.string().optional(),
      description: z.string().optional()
    }).superRefine((value, context) => {
      const hasUpdate = value.name !== undefined
        || value.newParentDir !== undefined
        || value.mediaUseExternalLink !== undefined
        || value.mediaExternalPath !== undefined
        || value.description !== undefined
      if (!hasUpdate) {
        context.addIssue({
          code: 'custom',
          message: '至少需要提供一个待更新字段（name、newParentDir、mediaUseExternalLink、mediaExternalPath 或 description）'
        })
      }
      if (value.newParentDir !== undefined && !value.newParentDir.trim()) {
        context.addIssue({ code: 'custom', message: 'newParentDir 不能为空字符串' })
      }
    }),
    async (input) => compactGenericResult(await callEditor('editor.editFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径'),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.newParentDir !== undefined ? { newParentDir: resolveRequiredPath(input.newParentDir, '目标父目录') } : {}),
      ...(input.mediaUseExternalLink !== undefined ? { mediaUseExternalLink: input.mediaUseExternalLink } : {}),
      ...(input.mediaExternalPath !== undefined ? { mediaExternalPath: resolveOptionalPath(input.mediaExternalPath) ?? '' } : {}),
      ...(input.description !== undefined ? { description: input.description } : {})
    }))
  )
  registerTool(
    'delete_folder_project',
    '删除文件夹工程',
    '将已注册的文件夹工程移入系统回收站并从工程列表中移除；若删除的正是当前打开的工程，会与界面一致地切换到单文件模式而不覆盖当前内存状态。仅允许删除已注册工程，不会弹出确认框。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    async (input) => compactGenericResult(await callEditor('editor.deleteFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    }))
  )
  registerTool(
    'import_single_project',
    '导入单文件工程（JSON）',
    '读取指定 .json 工程文件并进入单文件模式加载到编辑器（重置历史快照、触发缓冲重构并关闭工程管理弹窗），与工程管理界面顶部的“导入工程”行为一致；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    async (input) => compactGenericResult(await callEditor('editor.importSingleProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程文件路径')
    }))
  )
  registerTool(
    'import_xml_danmakus',
    '导入 XML 弹幕文件',
    '读取指定 Bilibili .xml 弹幕文件并按当前画布尺寸、XML 偏移设置与最大层数解析，切换到单文件模式、重置历史快照、触发缓冲重构并关闭工程管理弹窗，与工程管理界面顶部的“导入 XML”行为一致；支持在 ready 为 false 时调用。',
    z.strictObject({ xmlPath: z.string().trim().min(1) }),
    async (input) => compactGenericResult(await callEditor('editor.importXmlDanmakus', {
      xmlPath: resolveRequiredPath(input.xmlPath, 'XML 文件路径')
    }))
  )
  registerTool(
    'skip_folder_project',
    '跳过或关闭工程管理器',
    '与工程管理弹窗右上角“跳过/关闭”按钮行为一致：若当前处于启动初始化阶段（ready 为 false），则跳过文件夹工程并进入单文件模式（如有本地缓存则加载）；否则仅关闭工程管理弹窗。',
    emptyInput,
    async () => compactGenericResult(await callEditor('editor.skipFolderProject'))
  )
  registerTool(
    'get_editor_logs',
    '查询编辑器日志',
    '读取当前运行会话中最近的界面日志，按时间倒序返回；不会读取磁盘上的旧日志文件。可传入 outputPath 将日志写入 JSON 文件仅返回摘要。',
    z.strictObject({
      type: z.enum(['info', 'success', 'warn', 'error']).optional(),
      offset: z.number().int().nonnegative().max(1_000_000).default(0),
      limit: z.number().int().min(1).max(100_000).optional(),
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选输出 JSON 文件路径；传入时将日志写入文件并仅返回摘要')
    }).superRefine((input, context) => {
      if (input.outputPath === undefined && input.limit !== undefined && input.limit > 500) {
        context.addIssue({ code: 'custom', message: '未使用 outputPath 时 limit 不能超过 500' })
      }
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      if (!outPath) {
        return sanitizeLogsResult(await callEditor('editor.getLogs', {
          ...(input.type !== undefined ? { type: input.type } : {}),
          offset: input.offset,
          limit: input.limit ?? 100
        }))
      }
      const collected: unknown[] = []
      let total = 0
      let nextOffset = input.offset
      const maxToRead = input.limit ?? Infinity
      while (collected.length < maxToRead) {
        const pageLimit = Math.min(500, maxToRead - collected.length)
        const page = sanitizeLogsResult(await callEditor('editor.getLogs', {
          ...(input.type !== undefined ? { type: input.type } : {}),
          offset: nextOffset,
          limit: pageLimit
        })) as { total?: number; items?: unknown[] }
        total = typeof page.total === 'number' ? page.total : total
        const pageItems = Array.isArray(page.items) ? page.items : []
        if (pageItems.length === 0) break
        collected.push(...pageItems)
        nextOffset += pageItems.length
        if (nextOffset >= total) break
      }
      await writeFileAtomic(outPath, JSON.stringify({
        total,
        offset: input.offset,
        exportedCount: collected.length,
        items: collected
      }))
      return { ok: true, outputPath: outPath, total, offset: input.offset, exportedCount: collected.length }
    },
    true
  )
  registerTool(
    'list_history_snapshots',
    '列出历史快照',
    '列出当前内存撤销历史中的快照 ID、时间、说明和涉及的压缩弹幕 ID（如 "1~3,7,19"）。可传入 outputPath 将快照列表写入 JSON 文件。',
    z.strictObject({
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选输出 JSON 文件路径')
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      const compacted = compactHistorySnapshots(await callEditor('editor.getHistorySnapshots')) as {
        total?: number
        currentIndex?: number
        snapshots?: unknown[]
      }
      if (outPath) {
        await writeFileAtomic(outPath, JSON.stringify(compacted))
        return {
          ok: true,
          outputPath: outPath,
          total: compacted.total ?? 0,
          currentIndex: compacted.currentIndex ?? -1
        }
      }
      return compacted
    },
    true
  )
  registerTool(
    'get_history_snapshot',
    '查询历史快照弹幕',
    '按快照 ID 查询该历史状态中的弹幕详情，支持 offset/limit 分页或通过 outputPath 直接写出完整快照弹幕到 JSON 文件。先调用 list_history_snapshots 获取快照 ID。',
    z.strictObject({
      snapshotId: z.string().trim().min(1, 'snapshotId 不能为空'),
      offset: z.number().int().nonnegative().max(1_000_000).default(0),
      limit: z.number().int().min(1).max(100_000).optional(),
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').optional().describe('可选输出 JSON 文件路径；传入时由桌面端直接写出快照弹幕并仅返回摘要')
    }).superRefine((input, context) => {
      if (input.outputPath === undefined && input.limit !== undefined && input.limit > 500) {
        context.addIssue({ code: 'custom', message: '未使用 outputPath 时 limit 不能超过 500' })
      }
    }),
    async (input) => {
      const outPath = input.outputPath ? await assertWritableOutputPath(input.outputPath, 'outputPath') : undefined
      if (outPath) {
        return callEditor('editor.getHistorySnapshot', {
          snapshotId: input.snapshotId,
          offset: input.offset,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          outputPath: outPath
        })
      }
      return callEditor('editor.getHistorySnapshot', {
        snapshotId: input.snapshotId,
        offset: input.offset,
        limit: input.limit ?? 100
      })
    },
    true
  )
  registerTool(
    'select_by_command',
    '按条件筛选弹幕',
    '使用筛选命令语法更新选择范围（MCP 调用可省略开头的 /s）。id 与所有数值字段统一支持单值（如 id:"7"、startTime:"1000"）、范围（id:"1~3,7,19"、startTime:"1000~3000"）、半开区间（id:"10~"、startTime:"~5000"）以及引号精确匹配/正则；规则组支持 all、none、selecting；stroke/easing 支持直接写 true/false 或 speedup/speeddown。',
    z.strictObject({
      command: z.string().trim().min(1, '筛选命令不能为空').max(16_000).describe('筛选命令（可省略 /s），例如 id:"1~3,7,19"、startTime:"1000~3000" 或 all')
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@selection.filter', method: { command: input.command } }))
  )
  registerTool(
    'apply_stroke',
    '生成描边弹幕',
    '为当前选择生成描边副本。',
    z.strictObject({
      width: z.number().finite().min(1).max(1000),
      color: colorStringInput
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.stroke', method: input }))
  )
  registerTool(
    'center_danmakus',
    '弹幕居中',
    '按画布尺寸和文字测量结果居中当前选择的 X 或 Y 坐标（含 zRotate 旋转包围盒补偿）。测量失败时整次操作取消。axis=x 居中 X 坐标（将 transform.start.x / transform.end.x 设为 ((screenWidth - box.width) / 2) - box.minX，沿画布垂直中轴线左右居中）；axis=y 居中 Y 坐标（将 transform.start.y / transform.end.y 设为 ((screenHeight - box.height) / 2) - box.minY，沿画布水平中轴线上下居中）。',
    z.strictObject({
      axis: z.enum(['x', 'y']).describe('x：居中 X 坐标（左右居中，对应工具栏“垂直居中”）；y：居中 Y 坐标（上下居中，对应工具栏“水平居中”）'),
      scope: scopeInput.optional()
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.center', method: input }))
  )
  registerTool(
    'copy_coordinates',
    '复制弹幕坐标',
    '在每条当前选择的弹幕内部复制起始坐标或结束坐标（省略 direction 时默认 startToEnd）。',
    z.strictObject({
      direction: z.enum(['startToEnd', 'endToStart']).default('startToEnd').describe('复制方向：startToEnd（默认，起点复制到终点）或 endToStart（终点复制到起点）')
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.copy', method: input }))
  )
  registerTool(
    'swap_coordinates',
    '互换弹幕坐标',
    '互换当前选择的起始坐标与结束坐标。',
    emptyInput,
    async () => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.swap', method: {} }))
  )
  registerTool(
    'mirror_danmakus',
    '镜像弹幕',
    '按画布宽度或高度镜像当前选择。',
    z.strictObject({ axis: z.enum(['horizontal', 'vertical']) }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.mirror', method: input }))
  )
  registerTool(
    'calculate_rotation',
    '根据坐标计算旋转角',
    '根据当前选择的起点和终点重新计算 Z 轴旋转角。',
    emptyInput,
    async () => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.calculateRotation', method: {} }))
  )
  const angleInputSchema = z.string().trim().refine(
    (value) => value === '' || /^[+-]?\d+(?:\.\d+)?$/.test(value),
    '角度格式无效，请留空或输入数字、+数字、-数字'
  ).default('')
  registerTool(
    'set_movement_length',
    '设置弹幕运动长度',
    '保留起点，按长度和角度设置当前选择的终点坐标。角度留空时沿用弹幕现有角度。',
    z.strictObject({
      angle: angleInputSchema,
      length: z.number().finite().min(-100_000).max(100_000)
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.length', method: input }))
  )
  registerTool(
    'lock_movement_angle',
    '锁定运动角度',
    '在指定坐标轴变化后投影另一个坐标，保持角度不变。angle 可留空沿用弹幕旋转角，也可传绝对角度或相对角度。',
    z.strictObject({
      changedAxis: z.enum(['x', 'y']),
      angle: angleInputSchema
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.lockAngle', method: input }))
  )
  registerTool(
    'split_danmakus',
    '分割弹幕',
    '将当前选择按行（line）、按字（letter）或按指定时间点（time，需传入 timeMs）分割。按字分割依赖界面文字测量，测量失败时整次操作取消。',
    z.strictObject({
      mode: z.enum(['line', 'letter', 'time']),
      timeMs: z.number().finite().nonnegative().optional().describe('时间分割目标时间点（毫秒）；mode 为 time 时必填，mode 为 line 或 letter 时不可传入')
    }).superRefine((input, context) => {
      if (input.mode === 'time' && input.timeMs === undefined) {
        context.addIssue({ code: 'custom', message: 'mode 为 time 时必须传入 timeMs' })
      }
      if (input.mode !== 'time' && input.timeMs !== undefined) {
        context.addIssue({ code: 'custom', message: '只有 mode 为 time 时才能传入 timeMs' })
      }
    }),
    async (input) => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@toolbar.split', method: input }))
  )
  registerTool(
    'undo_edit',
    '撤销编辑',
    '撤销最近一次独立编辑操作。',
    emptyInput,
    async () => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@history.undo', method: null }))
  )
  registerTool(
    'redo_edit',
    '重做编辑',
    '重做最近撤销的编辑操作。',
    emptyInput,
    async () => compactEditorApiResult(await callEditor('editor.applyFieldUpdate', { field: '@history.redo', method: null }))
  )
  registerTool(
    'export_video',
    '导出视频',
    '将当前工程导出为 .mp4 视频。outputPath 必填（绝对或相对路径，必须以 .mp4 结尾，缺失父目录会自动创建）。startMs/endMs 默认为 0 到源视频时长或弹幕最晚结束时间；width/height 默认使用工程画布尺寸（仅传单边时按画布比例自动计算另一边，均须为偶数且比例一致）；fps 默认 60（可选 24/30/60/120）；quality 默认 very-high；useWebgl 默认沿用全局设置（默认开启）。waitMs 默认 15000（0~60000 毫秒）：若在 waitMs 内完成则直接返回结果，超时则在后台继续运行并返回 status=running 与 jobId 供 get_video_export_status 查询。导出锁定开始时刻的弹幕快照，期间可继续编辑或截图。',
    z.strictObject({
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').refine(
        (value) => extname(value).toLowerCase() === '.mp4',
        'outputPath 必须以 .mp4 结尾'
      ),
      startMs: z.number().finite().min(0).optional(),
      endMs: z.number().finite().positive().optional(),
      width: z.number().int().min(16).max(7680).refine((value) => value % 2 === 0, 'width 必须是偶数').optional(),
      height: z.number().int().min(16).max(4320).refine((value) => value % 2 === 0, 'height 必须是偶数').optional(),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal(120)]).optional(),
      quality: z.enum(['low', 'high', 'very-high', 'near-lossless']).optional(),
      useWebgl: z.boolean().optional(),
      waitMs: z.number().int().min(0).max(60000).optional()
    }).superRefine((value, context) => {
      if (value.endMs !== undefined && value.startMs !== undefined && value.endMs <= value.startMs) {
        context.addIssue({ code: 'custom', message: 'endMs 必须大于 startMs' })
      }
    }),
    async (input) => compactVideoExportResponse(await callEditor('editor.exportVideo', {
      ...input,
      outputPath: resolveRequiredPath(input.outputPath, 'outputPath')
    }))
  )
  registerTool(
    'get_video_export_status',
    '查询视频导出状态',
    '只读查询视频导出任务状态与进度。不传 jobId 时返回当前活跃任务或最近一次任务状态；可传入 waitMs（0~60000 毫秒，默认 0）在任务运行中时等待完成或超时再返回最新快照。',
    z.strictObject({
      jobId: z.string().trim().min(1, 'jobId 不能为空').optional(),
      waitMs: z.number().int().min(0).max(60000).optional()
    }),
    async (input) => compactVideoExportResponse(await callEditor('editor.getVideoExportStatus', input)),
    true
  )
  registerTool(
    'cancel_video_export',
    '取消视频导出',
    '取消正在进行的视频导出任务并等待编码器、独立渲染窗口和临时文件句柄彻底清理完成后返回。不传 jobId 时取消当前活跃任务；若目标任务已结束则安全返回当前状态。',
    z.strictObject({
      jobId: z.string().trim().min(1, 'jobId 不能为空').optional()
    }),
    async (input) => compactVideoExportResponse(await callEditor('editor.cancelVideoExport', input))
  )
  registerTool(
    'reload_app',
    '重新加载应用（慎用）',
    '调用前端 window.location.reload() 强制刷新整个应用。注意：此操作会清空所有内存历史快照（historySnapshots）和未保存的编辑状态，使应用回到初始启动阶段（ready 变为 false）',
    emptyInput,
    () => callEditor('editor.reloadApp')
  )

  return server
}

serveStdio(createMcpServer, {
  onerror: (error) => console.error('[m7-editor MCP] stdio 协议错误：', error.message)
})
console.error('[m7-editor MCP] stdio 服务已启动，正在等待 MCP 客户端请求。')
