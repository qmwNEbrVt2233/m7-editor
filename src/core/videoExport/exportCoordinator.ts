import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DanmakuItem } from '@/core/danmaku'
import {
  cancelVideoExportFile,
  canUseFfmpegVideoEncoder,
  cancelFfmpegVideoExport,
  captureWebviewSnapshot,
  chooseVideoExportPath,
  createVideoExportRenderWindow,
  finishVideoExportRenderWindow,
  finishFfmpegVideoExport,
  finishVideoExportFile,
  isTauriRuntime,
  getVideoExportRenderJob,
  startFfmpegVideoExport,
  startVideoExportFile,
  writeFfmpegVideoFrame,
  writeVideoExportChunk
} from '@/utils/tauriBackend'
import { resolveDirectVideoEncodingTarget, type ExportQuality } from './quality'
import { tryRunDirectVideoExport } from './directExportHost'
import type { ExportOutputDelivery } from './outputSink'
import {
  chooseBrowserExportOutputSink,
  createBlobDownloadOutputSink,
  formatDefaultVideoExportFilename,
} from './outputSink'

export type ExportBounds = {
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export type ExportRenderStage = {
  renderAt: (timeMs: number, snapshotDanmakus: DanmakuItem[]) => Promise<ExportBounds>
  endRenderSession: () => Promise<void>
}

export type ExportJob = {
  startMs: number
  endMs: number
  fps: number
  quality: ExportQuality
  width: number
  height: number
  screenWidth: number
  screenHeight: number
  mediaDuration: number
  mediaUrl: string
  mediaFilePath: string
  danmakus: DanmakuItem[]
  outputPath?: string
  useWebgl?: boolean
  frameCapture?: { timeMs: number }
}

export type CapturedVideoFrame = {
  dataBase64: string
  mimeType: 'image/jpeg'
  width: number
  height: number
  timeMs: number
}

export const VIDEO_EXPORT_RENDER_LABEL = 'video-export-render'
export const VIDEO_EXPORT_RENDER_READY_EVENT = 'm7-video-export-render-ready'
export const VIDEO_EXPORT_RENDER_PROGRESS_EVENT = 'm7-video-export-render-progress'
export const VIDEO_EXPORT_RENDER_FINISHED_EVENT = 'm7-video-export-render-finished'
export const VIDEO_EXPORT_RENDER_CANCEL_EVENT = 'm7-video-export-render-cancel'
const RENDER_WINDOW_READY_TIMEOUT_MS = 60_000
const FRAME_RENDER_WINDOW_READY_TIMEOUT_MS = 45_000
const FRAME_CAPTURE_FINISHED_TIMEOUT_MS = 35_000

type RenderEventPayload = { jobId: string }
type RenderProgressPayload = RenderEventPayload & { progress: ExportProgress }
type RenderFinishedPayload = RenderEventPayload & {
  result?: { canceledByUser: boolean; path?: string; encoder?: 'ffmpeg'; totalFrames?: number; frame?: CapturedVideoFrame }
  error?: string
}

export type ExportProgress = {
  completedFrames: number
  totalFrames: number
  percent: number
  stage: 'preparing' | 'rendering' | 'finalizing'
  detail?: string
}

async function runFfmpegFallback(
  job: ExportJob,
  stage: ExportRenderStage,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void,
  path: string,
  totalFrames: number
) {
  let sessionStarted = false
  let completed = false
  const snapshotDanmakus = copySnapshot(job.danmakus)
  const frameCanvas = new OffscreenCanvas(job.width, job.height)
  const frameContext = frameCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!frameContext) throw new Error('无法创建 FFmpeg 帧画布')

  try {
    await startFfmpegVideoExport({
      outputPath: path,
      mediaPath: job.mediaFilePath || null,
      quality: job.quality,
      fps: job.fps,
      startMs: job.startMs,
      endMs: job.endMs,
      frameCount: totalFrames,
      width: job.width,
      height: job.height,
      pixelFormat: 'rgba'
    })
    sessionStarted = true

    for (let index = 0; index < totalFrames; index += 1) {
      if (signal.aborted) throw makeAbortError()
      const frameOffsetMs = index * 1000 / job.fps
      const sourceTimeMs = Math.min(job.startMs + frameOffsetMs, job.endMs - 0.001)
      const bounds = await stage.renderAt(sourceTimeMs, snapshotDanmakus)
      if (signal.aborted) throw makeAbortError()
      const png = await captureWebviewSnapshot()
      if (signal.aborted) throw makeAbortError()
      const bitmap = await cropExportFrame(png, bounds, job.width, job.height)
      frameContext.drawImage(bitmap, 0, 0, job.width, job.height)
      bitmap.close()

      const imageData = frameContext.getImageData(0, 0, job.width, job.height)
      const rgba = new Uint8Array(
        imageData.data.buffer,
        imageData.data.byteOffset,
        imageData.data.byteLength
      )
      if (signal.aborted) throw makeAbortError()
      await writeFfmpegVideoFrame(path, rgba)

      onProgress({
        completedFrames: index + 1,
        totalFrames,
        percent: (index + 1) / totalFrames,
        stage: 'rendering'
      })
    }

    onProgress({ completedFrames: totalFrames, totalFrames, percent: 1, stage: 'finalizing' })
    await finishFfmpegVideoExport(path)
    completed = true
    return { canceledByUser: false, path, totalFrames, encoder: 'ffmpeg' as const }
  } finally {
    await stage.endRenderSession().catch(() => undefined)
    if (!completed && sessionStarted) {
      await cancelFfmpegVideoExport(path).catch(() => undefined)
    }
  }
}

type WorkerMessage = {
  type: string
  index?: number
  position?: number
  data?: ArrayBuffer
  stage?: string
  message?: string
  hasAudio?: boolean
}

function makeAbortError() {
  return new DOMException('视频导出已取消', 'AbortError')
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(makeAbortError())

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(makeAbortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

function copySnapshot(danmakus: DanmakuItem[]) {
  return JSON.parse(JSON.stringify(danmakus)) as DanmakuItem[]
}

async function cropExportFrame(png: Uint8Array, bounds: ExportBounds, width: number, height: number) {
  const image = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }))
  let keepOriginal = false
  try {
    if (
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.x + bounds.width > bounds.viewportWidth + 0.5 ||
      bounds.y + bounds.height > bounds.viewportHeight + 0.5
    ) {
      throw new Error('导出画布超出 WebView 可见区域。请缩小画布尺寸或扩大应用窗口后重试。')
    }

    const scaleX = image.width / bounds.viewportWidth
    const scaleY = image.height / bounds.viewportHeight
    const x = Math.max(0, Math.min(image.width - 1, Math.round(bounds.x * scaleX)))
    const y = Math.max(0, Math.min(image.height - 1, Math.round(bounds.y * scaleY)))
    const sourceWidth = Math.max(1, Math.min(image.width - x, Math.round(bounds.width * scaleX)))
    const sourceHeight = Math.max(1, Math.min(image.height - y, Math.round(bounds.height * scaleY)))

    if (
      x === 0 &&
      y === 0 &&
      sourceWidth === image.width &&
      sourceHeight === image.height &&
      sourceWidth === width &&
      sourceHeight === height
    ) {
      keepOriginal = true
      return image
    }

    if (sourceWidth === width && sourceHeight === height) {
      return await createImageBitmap(image, x, y, sourceWidth, sourceHeight)
    }

    return await createImageBitmap(image, x, y, sourceWidth, sourceHeight, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high'
    })
  } finally {
    if (!keepOriginal) {
      image.close()
    }
  }
}

export function fitVideoFrameSize(screenWidth: number, screenHeight: number, maxDimension: number) {
  if (
    !Number.isFinite(screenWidth) ||
    !Number.isFinite(screenHeight) ||
    screenWidth <= 0 ||
    screenHeight <= 0 ||
    !Number.isInteger(maxDimension) ||
    maxDimension < 16 ||
    maxDimension > 1920
  ) {
    throw new Error('截图尺寸无效；maxDimension 必须是 16 到 1920 之间的整数')
  }

  const scale = Math.min(1, maxDimension / Math.max(screenWidth, screenHeight))
  const even = (value: number) => Math.max(16, Math.round(value / 2) * 2)
  return {
    width: even(screenWidth * scale),
    height: even(screenHeight * scale)
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

async function hasVideoExportRenderJob(jobId: string) {
  try {
    await getVideoExportRenderJob(jobId)
    return true
  } catch {
    return false
  }
}

export async function captureVideoExportFrame(
  job: ExportJob,
  stage: ExportRenderStage,
  timeMs: number
): Promise<CapturedVideoFrame> {
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('截图时间必须是非负有限数字')
  if (!isTauriRuntime()) throw new Error('帧截图需要 Tauri 桌面运行环境')

  let bitmap: ImageBitmap | null = null
  try {
    const bounds = await stage.renderAt(timeMs, copySnapshot(job.danmakus))
    const png = await captureWebviewSnapshot()
    bitmap = await cropExportFrame(png, bounds, job.width, job.height)
    const canvas = new OffscreenCanvas(job.width, job.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建帧图像画布')

    let width = job.width
    let height = job.height
    const qualities = [0.84, 0.74, 0.64, 0.54, 0.48]
    const maxBytes = 650 * 1024
    for (let attempt = 0; attempt < qualities.length; attempt += 1) {
      canvas.width = width
      canvas.height = height
      context.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: qualities[attempt] })
      if (blob.size <= maxBytes) {
        return {
          dataBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
          mimeType: 'image/jpeg',
          width,
          height,
          timeMs
        }
      }

      width = Math.max(16, Math.round(width * 0.75 / 2) * 2)
      height = Math.max(16, Math.round(height * 0.75 / 2) * 2)
    }
    throw new Error('帧图像过大，无法安全回传给 MCP；请降低 maxDimension 后重试')
  } finally {
    bitmap?.close()
    await stage.endRenderSession().catch(() => undefined)
  }
}

function validateExportJob(job: ExportJob): number {
  if (
    !Number.isFinite(job.startMs) ||
    !Number.isFinite(job.endMs) ||
    !Number.isFinite(job.fps) ||
    !Number.isFinite(job.screenWidth) ||
    !Number.isFinite(job.screenHeight) ||
    !Number.isInteger(job.width) ||
    !Number.isInteger(job.height) ||
    job.startMs < 0 ||
    job.endMs <= job.startMs ||
    job.screenWidth <= 0 ||
    job.screenHeight <= 0 ||
    job.fps <= 0 ||
    job.fps > 120 ||
    job.width < 16 ||
    job.width > 7680 ||
    job.height < 16 ||
    job.height > 4320 ||
    job.width % 2 !== 0 ||
    job.height % 2 !== 0
  ) {
    throw new Error('视频导出参数无效')
  }

  const projectAspectRatio = job.screenWidth / job.screenHeight
  const outputAspectRatio = job.width / job.height
  if (Math.abs(outputAspectRatio - projectAspectRatio) / projectAspectRatio > 0.002) {
    throw new Error('导出宽高比例需要与工程画布一致')
  }

  const totalFrames = Math.ceil((job.endMs - job.startMs) * job.fps / 1000)
  if (!Number.isSafeInteger(totalFrames) || totalFrames <= 0) {
    throw new Error('导出帧数无效')
  }
  return totalFrames
}

async function checkH264EncodeAvailable(job: Pick<ExportJob, 'width' | 'height' | 'fps' | 'quality'>) {
  const target = await resolveDirectVideoEncodingTarget(job.width, job.height, job.fps, job.quality)
  return target !== null
}

export async function runVideoExport(
  job: ExportJob,
  stage: ExportRenderStage,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void
) {
  if (!isTauriRuntime()) {
    throw new Error('视频导出目前需要 Tauri 桌面运行环境')
  }

  const totalFrames = validateExportJob(job)
  onProgress({ completedFrames: 0, totalFrames: 0, percent: 0, stage: 'preparing' })
  const h264Available = await checkH264EncodeAvailable(job)

  if (!h264Available) {
    if (job.mediaUrl && !job.mediaFilePath) {
      throw new Error('此 WebView 不支持 H.264 编码，且 FFmpeg 后备导出需要本地源视频路径。')
    }
    if (!await canUseFfmpegVideoEncoder()) {
      throw new Error('此 WebView 不支持 H.264 编码，也没有可用的 FFmpeg 后备程序。')
    }
    const fallbackPath = job.outputPath ?? await chooseVideoExportPath()
    if (!fallbackPath) return { canceledByUser: true }
    return runFfmpegFallback(job, stage, signal, onProgress, fallbackPath, totalFrames)
  }

  const path = job.outputPath ?? await chooseVideoExportPath()
  if (!path) return { canceledByUser: true }

  const snapshotDanmakus = copySnapshot(job.danmakus)
  const worker = new Worker(new URL('./videoEncoder.worker.ts', import.meta.url), { type: 'module' })
  const queue: WorkerMessage[] = []
  const waiters = new Set<{
    type: string
    index?: number
    resolve: (message: WorkerMessage) => void
    reject: (error: Error) => void
  }>()
  const pendingWrites = new Set<Promise<void>>()
  const pendingFrames: Array<{ completion: Promise<WorkerMessage> }> = []
  let fatalError: Error | null = null
  let fileSize = 0
  let completedFrames = 0
  let fileStarted = false
  let completed = false

  const rejectWaiters = (error: Error) => {
    fatalError = error
    waiters.forEach((waiter) => waiter.reject(error))
    waiters.clear()
  }

  const waitFor = (type: string, index?: number) => {
    if (fatalError) return Promise.reject(fatalError)
    const queuedIndex = queue.findIndex((message) => message.type === type && (index === undefined || message.index === index))
    if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0])

    return raceAbort(new Promise<WorkerMessage>((resolve, reject) => {
      waiters.add({ type, index, resolve, reject })
    }), signal)
  }

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    if (message.type === 'chunk') {
      const write = (async () => {
        const data = new Uint8Array(message.data ?? new ArrayBuffer(0))
        const position = message.position ?? 0
        fileSize = Math.max(fileSize, position + data.byteLength)
        await writeVideoExportChunk(path, position, data)
      })()
      pendingWrites.add(write)
      void write.catch((error: unknown) => {
        const messageText = error instanceof Error ? error.message : String(error)
        rejectWaiters(error instanceof Error ? error : new Error(messageText))
      }).finally(() => pendingWrites.delete(write))
      return
    }

    if (message.type === 'error') {
      rejectWaiters(new Error(message.message || '视频编码失败'))
      return
    }

    if (message.type === 'finalizing-stage') {
      onProgress({
        completedFrames,
        totalFrames,
        percent: 1,
        stage: 'finalizing',
        detail: message.stage
      })
      return
    }

    const waiter = Array.from(waiters).find((item) => item.type === message.type && (item.index === undefined || item.index === message.index))
    if (waiter) {
      waiters.delete(waiter)
      waiter.resolve(message)
    } else {
      queue.push(message)
    }
  }

  worker.onerror = (event) => rejectWaiters(new Error(event.message || '视频编码 Worker 异常'))
  const abortWorker = () => worker.postMessage({ type: 'cancel' })
  signal.addEventListener('abort', abortWorker, { once: true })

  try {
    await startVideoExportFile(path)
    fileStarted = true

    const readyPromise = waitFor('ready')
    worker.postMessage({
      type: 'start',
      mediaUrl: job.mediaUrl,
      width: job.width,
      height: job.height,
      quality: job.quality,
      fps: job.fps,
      startMs: job.startMs,
      endMs: job.endMs
    })
    const readyMessage = await readyPromise
    if (readyMessage.hasAudio) {
      onProgress({ completedFrames: 0, totalFrames, percent: 0, stage: 'rendering' })
    }

    const completeFrame = async (frame: { completion: Promise<WorkerMessage> }) => {
      await frame.completion
      completedFrames += 1
      onProgress({
        completedFrames,
        totalFrames,
        percent: completedFrames / totalFrames,
        stage: 'rendering'
      })
    }

    for (let index = 0; index < totalFrames; index += 1) {
      if (signal.aborted) throw makeAbortError()
      const frameOffsetMs = index * 1000 / job.fps
      const sourceTimeMs = Math.min(job.startMs + frameOffsetMs, job.endMs - 0.001)
      const durationMs = Math.min(1000 / job.fps, job.endMs - job.startMs - frameOffsetMs)
      const bounds = await stage.renderAt(sourceTimeMs, snapshotDanmakus)
      if (signal.aborted) throw makeAbortError()
      const png = await captureWebviewSnapshot()
      if (signal.aborted) throw makeAbortError()
      const bitmap = await cropExportFrame(png, bounds, job.width, job.height)
      if (signal.aborted) {
        bitmap.close()
        throw makeAbortError()
      }
      const frameAdded = waitFor('frame-added', index)
      worker.postMessage({
        type: 'frame',
        index,
        timestampMs: frameOffsetMs,
        durationMs,
        bitmap
      }, [bitmap])
      pendingFrames.push({ completion: frameAdded })

      // Keep capture/seek ordered, while allowing the encoder worker to
      // process one frame as the next frame is being rendered and captured.
      if (pendingFrames.length >= 2) {
        const oldestFrame = pendingFrames.shift()
        if (oldestFrame) await completeFrame(oldestFrame)
      }
    }

    while (pendingFrames.length > 0) {
      const nextFrame = pendingFrames.shift()
      if (nextFrame) await completeFrame(nextFrame)
    }

    onProgress({ completedFrames: totalFrames, totalFrames, percent: 1, stage: 'finalizing' })
    const completePromise = waitFor('complete')
    worker.postMessage({ type: 'finish' })
    await completePromise
    await Promise.all(pendingWrites)
    await finishVideoExportFile(path, fileSize)
    completed = true
    return { canceledByUser: false, path, totalFrames }
  } catch (error) {
    worker.postMessage({ type: 'cancel' })
    await Promise.allSettled(pendingWrites)
    throw error
  } finally {
    signal.removeEventListener('abort', abortWorker)
    worker.terminate()
    await stage.endRenderSession().catch(() => undefined)
    if (fileStarted && !completed) {
      await cancelVideoExportFile(path).catch(() => undefined)
    }
  }
}

function formatBrowserDirectExportUnsupportedError(reason: string): Error {
  if (
    reason === 'video-track-undecodable' ||
    reason === 'video-sample-stream-empty' ||
    reason === 'main-thread-media-probe-failed'
  ) {
    return new Error('当前浏览器无法通过 WebCodecs 解码导入的视频轨道，请尝试转码为常见 MP4 (H.264/AAC) 或使用桌面端导出。')
  }
  if (reason === 'worker-webgl2-unavailable' || reason === 'main-thread-webgl2-unavailable') {
    return new Error('当前浏览器无法初始化 WebGL2 离屏渲染上下文，请检查硬件加速设置或更换浏览器。')
  }
  if (reason === 'webcodecs-or-worker-unavailable') {
    return new Error('当前浏览器不支持 WebCodecs 离线视频编码，请使用最新版 Chrome、Edge 或 Safari。')
  }
  return new Error(`当前浏览器暂不支持离线直出此视频（${reason}），请尝试更换浏览器或使用桌面端导出。`)
}

export async function runVideoExportInRenderWindow(
  job: ExportJob,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void
) {
  const jobSnapshot = { ...job, danmakus: copySnapshot(job.danmakus) }
  validateExportJob(jobSnapshot)
  const useWebgl = jobSnapshot.useWebgl !== false

  if (!isTauriRuntime()) {
    if (!useWebgl) {
      throw new Error('网页版不支持独立渲染窗口模式，请开启 WebGL 渲染后重试')
    }
    if (typeof Worker === 'undefined' || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error('当前浏览器不支持 WebCodecs 离线视频编码，请使用最新版 Chrome、Edge 或 Safari。')
    }
    const h264Available = await checkH264EncodeAvailable(jobSnapshot)
    if (!h264Available) {
      throw new Error('当前浏览器或设备不支持所需的 H.264 / HEVC 视频编码配置，请尝试降低分辨率/帧率或改用桌面端。')
    }
    if (signal.aborted) throw makeAbortError()

    const outputSink = jobSnapshot.outputPath
      ? createBlobDownloadOutputSink(jobSnapshot.outputPath)
      : await chooseBrowserExportOutputSink(formatDefaultVideoExportFilename())
    if (!outputSink) return { canceledByUser: true as const }
    if (signal.aborted) throw makeAbortError()

    const directResult = await tryRunDirectVideoExport(
      { ...jobSnapshot, outputSink },
      signal,
      onProgress
    )
    if (directResult.status === 'completed') {
      return {
        canceledByUser: false as const,
        path: directResult.path,
        delivery: directResult.delivery,
        totalFrames: directResult.totalFrames
      }
    }
    if (signal.aborted) throw makeAbortError()
    throw formatBrowserDirectExportUnsupportedError(directResult.reason)
  }

  const outputPath = jobSnapshot.outputPath ?? await chooseVideoExportPath()
  if (!outputPath) return { canceledByUser: true as const }
  if (signal.aborted) throw makeAbortError()

  if (useWebgl) {
    const h264Available = await checkH264EncodeAvailable(jobSnapshot)
    if (h264Available) {
      const directResult = await tryRunDirectVideoExport(
        { ...jobSnapshot, outputPath },
        signal,
        onProgress
      )
      if (directResult.status === 'completed') {
        return {
          canceledByUser: false as const,
          path: directResult.path,
          delivery: directResult.delivery,
          totalFrames: directResult.totalFrames
        }
      }
      if (signal.aborted) throw makeAbortError()
    }
  }

  if (jobSnapshot.mediaUrl && !jobSnapshot.mediaFilePath) {
    throw new Error('独立渲染窗口需要本地媒体文件路径，请从本地文件重新导入视频后再导出。')
  }

  const jobId = crypto.randomUUID()
  const renderJob = { ...jobSnapshot, outputPath }
  let resolveReady!: () => void
  let resolveFinished!: (payload: RenderFinishedPayload) => void
  const ready = new Promise<void>((resolve) => { resolveReady = resolve })
  const finished = new Promise<RenderFinishedPayload>((resolve) => { resolveFinished = resolve })
  const listeners: UnlistenFn[] = []
  let renderWindowCreated = false
  let cancelRequested = signal.aborted as boolean
  let keepOutput = false
  let readyTimeout: number | undefined
  const clearReadyTimeout = () => {
    if (readyTimeout === undefined) return
    window.clearTimeout(readyTimeout)
    readyTimeout = undefined
  }

  const sendCancel = () => {
    cancelRequested = true
    if (renderWindowCreated) {
      void emitTo(VIDEO_EXPORT_RENDER_LABEL, VIDEO_EXPORT_RENDER_CANCEL_EVENT, { jobId }).catch(() => undefined)
    }
  }
  const onAbort = () => sendCancel()

  try {
    listeners.push(await listen<RenderEventPayload>(VIDEO_EXPORT_RENDER_READY_EVENT, ({ payload }) => {
      if (payload.jobId !== jobId) return
      clearReadyTimeout()
      resolveReady()
      if (cancelRequested) sendCancel()
    }))
    listeners.push(await listen<RenderProgressPayload>(VIDEO_EXPORT_RENDER_PROGRESS_EVENT, ({ payload }) => {
      if (payload.jobId === jobId) onProgress(payload.progress)
    }))
    listeners.push(await listen<RenderFinishedPayload>(VIDEO_EXPORT_RENDER_FINISHED_EVENT, ({ payload }) => {
      if (payload.jobId === jobId) resolveFinished(payload)
    }))

    signal.addEventListener('abort', onAbort, { once: true })
    readyTimeout = window.setTimeout(() => {
      resolveFinished({ jobId, error: '独立渲染窗口启动超时' })
    }, RENDER_WINDOW_READY_TIMEOUT_MS)
    try {
      await createVideoExportRenderWindow(jobId, renderJob)
      renderWindowCreated = true
    } catch (error) {
      renderWindowCreated = await hasVideoExportRenderJob(jobId)
      throw error
    }
    if (cancelRequested) sendCancel()

    await Promise.race([ready, finished.then(() => undefined)])
    clearReadyTimeout()
    const completion = await finished
    if (completion.error) throw new Error(completion.error)
    if (!completion.result) throw new Error('独立渲染窗口未返回导出结果')
    keepOutput = !completion.result.canceledByUser
    if (completion.result.canceledByUser) {
      return { canceledByUser: true as const }
    }
    return {
      ...completion.result,
      canceledByUser: false as const,
      delivery: 'file' as ExportOutputDelivery,
    }
  } finally {
    clearReadyTimeout()
    signal.removeEventListener('abort', onAbort)
    listeners.forEach((unlisten) => unlisten())
    if (renderWindowCreated) {
      await finishVideoExportRenderWindow(jobId, keepOutput).catch(() => undefined)
    }
  }
}

// The dedicated frame window has a fixed native label, so serialize MCP captures.
let frameCaptureQueue: Promise<void> = Promise.resolve()

export function runVideoFrameCaptureInRenderWindow(
  jobInput: Pick<ExportJob, 'screenWidth' | 'screenHeight' | 'mediaDuration' | 'mediaUrl' | 'mediaFilePath' | 'danmakus'>,
  timeMs: number,
  maxDimension = 1280
): Promise<CapturedVideoFrame> {
  const snapshot = { ...jobInput, danmakus: copySnapshot(jobInput.danmakus) }
  const capture = frameCaptureQueue.then(() => captureVideoFrameInRenderWindow(snapshot, timeMs, maxDimension))
  frameCaptureQueue = capture.then(() => undefined, () => undefined)
  return capture
}

async function captureVideoFrameInRenderWindow(
  jobInput: Pick<ExportJob, 'screenWidth' | 'screenHeight' | 'mediaDuration' | 'mediaUrl' | 'mediaFilePath' | 'danmakus'>,
  timeMs: number,
  maxDimension: number
): Promise<CapturedVideoFrame> {
  if (!isTauriRuntime()) throw new Error('帧截图需要 Tauri 桌面运行环境')
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('截图时间必须是非负有限数字')

  const { width, height } = fitVideoFrameSize(jobInput.screenWidth, jobInput.screenHeight, maxDimension)
  const jobId = crypto.randomUUID()
  const renderJob: ExportJob = {
    ...jobInput,
    startMs: timeMs,
    endMs: timeMs + 1,
    fps: 1,
    quality: 'high',
    width,
    height,
    frameCapture: { timeMs }
  }
  let resolveReady!: () => void
  let resolveFinished!: (payload: RenderFinishedPayload) => void
  const ready = new Promise<void>((resolve) => { resolveReady = resolve })
  const finished = new Promise<RenderFinishedPayload>((resolve) => { resolveFinished = resolve })
  const listeners: UnlistenFn[] = []
  let renderWindowCreated = false
  let readyTimeout: number | undefined
  let finishedTimeout: number | undefined

  const clearTimeouts = () => {
    if (readyTimeout !== undefined) window.clearTimeout(readyTimeout)
    if (finishedTimeout !== undefined) window.clearTimeout(finishedTimeout)
    readyTimeout = undefined
    finishedTimeout = undefined
  }

  try {
    listeners.push(await listen<RenderEventPayload>(VIDEO_EXPORT_RENDER_READY_EVENT, ({ payload }) => {
      if (payload.jobId !== jobId) return
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout)
      readyTimeout = undefined
      resolveReady()
    }))
    listeners.push(await listen<RenderFinishedPayload>(VIDEO_EXPORT_RENDER_FINISHED_EVENT, ({ payload }) => {
      if (payload.jobId === jobId) resolveFinished(payload)
    }))

    readyTimeout = window.setTimeout(() => {
      resolveFinished({ jobId, error: '帧截图渲染窗口启动超时' })
    }, FRAME_RENDER_WINDOW_READY_TIMEOUT_MS)
    try {
      await createVideoExportRenderWindow(jobId, renderJob)
      renderWindowCreated = true
    } catch (error) {
      renderWindowCreated = await hasVideoExportRenderJob(jobId)
      throw error
    }

    await Promise.race([ready, finished.then(() => undefined)])
    if (readyTimeout !== undefined) window.clearTimeout(readyTimeout)
    readyTimeout = undefined
    finishedTimeout = window.setTimeout(() => {
      resolveFinished({ jobId, error: '等待帧截图完成超时' })
    }, FRAME_CAPTURE_FINISHED_TIMEOUT_MS)

    const completion = await finished
    if (completion.error) throw new Error(completion.error)
    const frame = completion.result?.frame
    if (!frame) throw new Error('独立渲染窗口没有返回帧图像')
    return frame
  } finally {
    clearTimeouts()
    listeners.forEach((unlisten) => unlisten())
    if (renderWindowCreated) await finishVideoExportRenderWindow(jobId, false).catch(() => undefined)
  }
}
