import { ALL_FORMATS, Input, UrlSource, VideoSample, VideoSampleSink } from 'mediabunny'
import type { DanmakuItem } from '@/core/danmaku'
import {
  cancelVideoExportFile,
  finishVideoExportFile,
  startVideoExportFile,
  writeVideoExportChunk,
} from '@/utils/tauriBackend'
import {
  DanmakuSpriteRasterizer,
  DanmakuTimelineIndex,
  WebGL2DanmakuCompositor,
  type ActiveDanmakuDrawState,
  type DanmakuSpriteSpec,
} from './danmakuRenderer'
import type { DirectExportSpritePayload } from './directExportSession'
import type { DirectExportOutputSink, ExportOutputDelivery } from './outputSink'
import type { ExportQuality } from './quality'

export type DirectExportJob = {
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
  danmakus: DanmakuItem[]
  outputPath?: string
  outputSink?: DirectExportOutputSink
}

export type DirectExportProgress = {
  completedFrames: number
  totalFrames: number
  percent: number
  stage: 'preparing' | 'rendering' | 'finalizing'
  detail?: string
}

export type DirectExportAttemptResult =
  | { status: 'completed'; path: string; delivery: ExportOutputDelivery; totalFrames: number }
  | { status: 'fallback'; reason: string }

type WorkerIncomingEvent =
  | { type: 'direct-ready'; hasAudio: boolean }
  | { type: 'ready'; hasAudio: boolean }
  | { type: 'direct-fallback'; reason: string }
  | {
      type: 'request-sprites'
      requestId: number
      maxTextureSize: number
      items: Array<{ key: string; spec: DanmakuSpriteSpec }>
    }
  | {
      type: 'direct-progress'
      phase: 'rendering' | 'finalizing'
      completedFrames: number
      totalFrames: number
    }
  | { type: 'finalizing-stage'; stage: string }
  | { type: 'frame-added'; index: number }
  | { type: 'chunk'; position: number; data: ArrayBuffer }
  | { type: 'complete' }
  | { type: 'canceled' }
  | { type: 'error'; message: string }

const MAIN_THREAD_WEBGL_ELIGIBLE_FALLBACKS = new Set([
  'offscreen-canvas-or-videoframe-unavailable',
  'worker-webgl2-unavailable',
  'webkit-videoframe-offscreen-unsupported',
])

function createTauriOutputSink(outputPath: string): DirectExportOutputSink {
  return {
    displayPath: outputPath,
    delivery: 'file',
    start: () => startVideoExportFile(outputPath),
    writeChunk: (position, bytes) => writeVideoExportChunk(outputPath, position, bytes),
    finish: (fileSize) => finishVideoExportFile(outputPath, fileSize),
    cancel: () => cancelVideoExportFile(outputPath),
  }
}

function createQueuedSinkWriter(
  sink: DirectExportOutputSink,
  onWriteError: (error: unknown) => void
) {
  let fileStarted = false
  let fileSize = 0
  let finished = false
  let writeChain: Promise<void> = Promise.resolve()

  return {
    get displayPath() {
      return sink.displayPath
    },
    get delivery() {
      return sink.delivery
    },
    get isFinished() {
      return finished
    },
    start() {
      fileStarted = true
      writeChain = writeChain.then(() => sink.start())
      writeChain.catch(onWriteError)
    },
    write(position: number, bytes: Uint8Array<ArrayBuffer>) {
      fileSize = Math.max(fileSize, position + bytes.byteLength)
      writeChain = writeChain.then(() => sink.writeChunk(position, bytes))
      writeChain.catch(onWriteError)
    },
    async finish() {
      await writeChain
      await sink.finish(fileSize)
      finished = true
    },
    async cleanup() {
      await writeChain.catch(() => undefined)
      if (fileStarted && !finished) {
        await sink.cancel().catch(() => undefined)
      }
    },
  }
}

function makeAbortError() {
  return new DOMException('视频导出已取消', 'AbortError')
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForDocumentFontsOnce(): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready
    }
  } catch {
    // Ignore font readiness failures and proceed with available system fonts
  }
}

async function rasterizeSpriteBatch(
  rasterizer: DanmakuSpriteRasterizer,
  items: Array<{ key: string; spec: DanmakuSpriteSpec }>,
  projectScale: number,
  signal: AbortSignal
): Promise<{ sprites: DirectExportSpritePayload[]; transferList: ArrayBuffer[] }> {
  const sprites: DirectExportSpritePayload[] = []
  const transferList: ArrayBuffer[] = []
  let sliceStart = performance.now()

  for (let i = 0; i < items.length; i += 1) {
    if (signal.aborted) {
      throw makeAbortError()
    }
    const { key, spec } = items[i]
    const bitmap = rasterizer.rasterize(key, spec, projectScale)
    if (bitmap) {
      const exactBuffer =
        bitmap.data.byteOffset === 0 && bitmap.data.byteLength === bitmap.data.buffer.byteLength
          ? (bitmap.data.buffer as ArrayBuffer)
          : bitmap.data.slice().buffer
      sprites.push({
        key: bitmap.key,
        format: bitmap.format,
        pixelWidth: bitmap.pixelWidth,
        pixelHeight: bitmap.pixelHeight,
        offsetX: bitmap.offsetX,
        offsetY: bitmap.offsetY,
        logicalWidth: bitmap.logicalWidth,
        logicalHeight: bitmap.logicalHeight,
        dataBuffer: exactBuffer,
      })
      transferList.push(exactBuffer)
    }

    // Keep cancel button and UI progress responsive during large initial sprite batches
    if (i + 1 < items.length && performance.now() - sliceStart >= 12) {
      await yieldToEventLoop()
      sliceStart = performance.now()
    }
  }

  return { sprites, transferList }
}

async function runWorkerDirectExport(
  job: DirectExportJob,
  sink: DirectExportOutputSink,
  totalFrames: number,
  signal: AbortSignal,
  onProgress: (progress: DirectExportProgress) => void
): Promise<DirectExportAttemptResult> {
  if (signal.aborted) {
    throw makeAbortError()
  }

  const projectScale = job.width / Math.max(1, job.screenWidth)
  const worker = new Worker(new URL('./videoEncoder.worker.ts', import.meta.url), { type: 'module' })
  let rasterizer: DanmakuSpriteRasterizer | null = null

  let notifyWriteError = (_error: unknown) => {}
  const writer = createQueuedSinkWriter(sink, (error) => notifyWriteError(error))
  let spriteChain: Promise<void> = Promise.resolve()
  const abortController = new AbortController()
  let abortHandler: (() => void) | null = null

  try {
    return await new Promise<DirectExportAttemptResult>((resolve, reject) => {
      let settled = false
      const settleResolve = (value: DirectExportAttemptResult) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const settleReject = (err: unknown) => {
        if (settled) return
        settled = true
        reject(err)
      }
      notifyWriteError = settleReject

      abortHandler = () => {
        abortController.abort()
        worker.postMessage({ type: 'cancel' })
        settleReject(makeAbortError())
      }

      if (signal.aborted) {
        abortHandler()
        return
      }
      signal.addEventListener('abort', abortHandler, { once: true })

      worker.onerror = (event) => {
        settleReject(new Error(event.message || '直接导出工作线程异常'))
      }

      worker.onmessage = (event: MessageEvent<WorkerIncomingEvent>) => {
        const msg = event.data
        if (settled) {
          return
        }

        if (msg.type === 'direct-fallback') {
          settleResolve({ status: 'fallback', reason: msg.reason })
          return
        }

        if (msg.type === 'direct-ready') {
          writer.start()
          return
        }

        if (msg.type === 'chunk') {
          writer.write(msg.position ?? 0, new Uint8Array(msg.data))
          return
        }

        if (msg.type === 'request-sprites') {
          spriteChain = spriteChain
            .then(async () => {
              if (abortController.signal.aborted || settled) {
                return
              }
              if (!rasterizer) {
                rasterizer = new DanmakuSpriteRasterizer(msg.maxTextureSize)
              }
              const { sprites, transferList } = await rasterizeSpriteBatch(
                rasterizer,
                msg.items,
                projectScale,
                abortController.signal
              )
              if (!abortController.signal.aborted && !settled) {
                worker.postMessage(
                  { type: 'sprites', requestId: msg.requestId, sprites },
                  transferList
                )
              }
            })
            .catch((error) => {
              if (!abortController.signal.aborted) {
                settleReject(error)
              }
            })
          return
        }

        if (msg.type === 'direct-progress') {
          const frameCount = msg.totalFrames || totalFrames
          if (msg.phase === 'finalizing') {
            onProgress({
              completedFrames: frameCount,
              totalFrames: frameCount,
              percent: 1,
              stage: 'finalizing',
              detail: '正在封装 MP4...',
            })
          } else {
            const ratio = Math.min(1, msg.completedFrames / Math.max(1, frameCount))
            onProgress({
              completedFrames: msg.completedFrames,
              totalFrames: frameCount,
              percent: ratio,
              stage: 'rendering',
            })
          }
          return
        }

        if (msg.type === 'finalizing-stage') {
          onProgress({
            completedFrames: totalFrames,
            totalFrames,
            percent: 1,
            stage: 'finalizing',
            detail: msg.stage,
          })
          return
        }

        if (msg.type === 'complete') {
          writer
            .finish()
            .then(() => {
              settleResolve({
                status: 'completed',
                path: writer.displayPath,
                delivery: writer.delivery,
                totalFrames,
              })
            })
            .catch((error) => settleReject(error))
          return
        }

        if (msg.type === 'canceled') {
          settleReject(makeAbortError())
          return
        }

        if (msg.type === 'error') {
          settleReject(new Error(msg.message || '直接视频导出失败'))
        }
      }

      worker.postMessage({
        type: 'start-direct',
        width: job.width,
        height: job.height,
        screenWidth: job.screenWidth,
        screenHeight: job.screenHeight,
        fps: job.fps,
        quality: job.quality,
        startMs: job.startMs,
        endMs: job.endMs,
        mediaDuration: job.mediaDuration,
        mediaUrl: job.mediaUrl,
        danmakus: job.danmakus,
      })
    })
  } finally {
    if (abortHandler) {
      signal.removeEventListener('abort', abortHandler)
    }
    abortController.abort()
    worker.terminate()
    await writer.cleanup()
  }
}

/**
 * Fallback used when the Web Worker cannot create a WebGL2 OffscreenCanvas (e.g. older macOS WKWebView)
 * while the main thread HTMLCanvasElement supports WebGL2 and mediabunny VideoDecoder works.
 * Still runs completely headless with zero render window or DOM screenshots.
 */
async function runMainThreadWebGLDirectExport(
  job: DirectExportJob,
  sink: DirectExportOutputSink,
  totalFrames: number,
  signal: AbortSignal,
  onProgress: (progress: DirectExportProgress) => void
): Promise<DirectExportAttemptResult> {
  if (typeof document === 'undefined' || typeof VideoFrame === 'undefined') {
    return { status: 'fallback', reason: 'main-thread-canvas-unavailable' }
  }

  const canvas = document.createElement('canvas')
  canvas.width = job.width
  canvas.height = job.height

  let compositor: WebGL2DanmakuCompositor
  try {
    compositor = new WebGL2DanmakuCompositor(
      canvas,
      job.width,
      job.height,
      job.screenWidth,
      job.screenHeight
    )
  } catch (error) {
    return {
      status: 'fallback',
      reason: error instanceof Error ? error.message : 'main-thread-webgl2-unavailable',
    }
  }

  let mediaInput: Input | null = null
  let sampleIterator: AsyncIterator<VideoSample, void, unknown> | null = null
  let currentSample: VideoSample | null = null
  let nextSample: VideoSample | null = null
  let videoDurationSec = Math.max(0, job.mediaDuration)

  let worker: Worker | null = null
  let notifyWriteError = (_err: unknown) => {}
  const writer = createQueuedSinkWriter(sink, (err) => notifyWriteError(err))
  let onAbortMain: (() => void) | null = null

  try {
    if (job.mediaUrl) {
      try {
        mediaInput = new Input({ source: new UrlSource(job.mediaUrl), formats: ALL_FORMATS })
        const videoTrack = await mediaInput.getPrimaryVideoTrack()
        if (videoTrack) {
          if (!(await videoTrack.canDecode())) {
            return { status: 'fallback', reason: 'video-track-undecodable' }
          }
          const trackDuration =
            (await videoTrack.computeDuration()) || (await videoTrack.getDurationFromMetadata())
          if (trackDuration !== null && Number.isFinite(trackDuration) && trackDuration > 0) {
            videoDurationSec = trackDuration
          }
          const sink = new VideoSampleSink(videoTrack)
          const startSec = Math.max(0, job.startMs / 1000)
          const queryStartSec =
            videoDurationSec > 0
              ? Math.max(0, Math.min(startSec, Math.max(0, videoDurationSec - 0.1)))
              : startSec
          sampleIterator = sink.samples(queryStartSec, Infinity)[Symbol.asyncIterator]()
          const first = await sampleIterator.next()
          if (first.done && videoDurationSec > 0) {
            return { status: 'fallback', reason: 'video-sample-stream-empty' }
          }
          nextSample = first.done ? null : first.value
        }
      } catch (error) {
        return {
          status: 'fallback',
          reason: error instanceof Error ? error.message : 'main-thread-media-probe-failed',
        }
      }
    }

    if (signal.aborted) {
      throw makeAbortError()
    }

    worker = new Worker(new URL('./videoEncoder.worker.ts', import.meta.url), { type: 'module' })
    const frameWaiters = new Map<number, { resolve: () => void; reject: (err: unknown) => void }>()
    let workerError: Error | null = null
    let readyResolve!: () => void
    let readyReject!: (err: unknown) => void
    let completeResolve!: () => void
    let completeReject!: (err: unknown) => void

    const readyPromise = new Promise<void>((res, rej) => {
      readyResolve = res
      readyReject = rej
    })
    const completePromise = new Promise<void>((res, rej) => {
      completeResolve = res
      completeReject = rej
    })

    const failAllWaiters = (err: unknown) => {
      readyReject(err)
      completeReject(err)
      for (const [, waiter] of frameWaiters) {
        waiter.reject(err)
      }
      frameWaiters.clear()
    }
    notifyWriteError = failAllWaiters

    onAbortMain = () => {
      worker?.postMessage({ type: 'cancel' })
      failAllWaiters(makeAbortError())
    }
    signal.addEventListener('abort', onAbortMain, { once: true })

    worker.onerror = (e) => {
      workerError = new Error(e.message || '编码工作线程异常')
      failAllWaiters(workerError)
    }

    worker.onmessage = (event: MessageEvent<WorkerIncomingEvent>) => {
      const msg = event.data
      if (msg.type === 'ready') {
        writer.start()
        readyResolve()
      } else if (msg.type === 'chunk') {
        writer.write(msg.position ?? 0, new Uint8Array(msg.data))
      } else if (msg.type === 'frame-added') {
        const waiter = frameWaiters.get(msg.index)
        if (waiter) {
          frameWaiters.delete(msg.index)
          waiter.resolve()
        }
      } else if (msg.type === 'finalizing-stage') {
        onProgress({
          completedFrames: totalFrames,
          totalFrames,
          percent: 1,
          stage: 'finalizing',
          detail: msg.stage,
        })
      } else if (msg.type === 'complete') {
        completeResolve()
      } else if (msg.type === 'error') {
        workerError = new Error(msg.message || '编码失败')
        failAllWaiters(workerError)
      }
    }

    worker.postMessage({
      type: 'start',
      mediaUrl: job.mediaUrl,
      width: job.width,
      height: job.height,
      quality: job.quality,
      fps: job.fps,
      startMs: job.startMs,
      endMs: job.endMs,
    })

    await readyPromise

    const timeline = new DanmakuTimelineIndex(job.danmakus)
    const rasterizer = new DanmakuSpriteRasterizer(compositor.maxTextureSize)
    const projectScale = job.width / Math.max(1, job.screenWidth)
    const frameDurationMs = 1000 / job.fps
    const activeBuffer: ActiveDanmakuDrawState[] = []
    const inFlight: Promise<void>[] = []

    for (let index = 0; index < totalFrames; index += 1) {
      if (signal.aborted) throw makeAbortError()
      if (workerError) throw workerError

      const frameOffsetMs = index * frameDurationMs
      const durationMs = Math.min(frameDurationMs, Math.max(0, job.endMs - job.startMs - frameOffsetMs))
      const projectTimeMs = Math.max(job.startMs, Math.min(job.endMs - 0.001, job.startMs + frameOffsetMs))

      if (sampleIterator) {
        const targetVideoSec =
          videoDurationSec > 0
            ? Math.max(0, Math.min(projectTimeMs / 1000, videoDurationSec))
            : Math.max(0, projectTimeMs / 1000)

        while (nextSample !== null && nextSample.timestamp <= targetVideoSec + 1e-4) {
          currentSample?.close()
          currentSample = nextSample
          const iter = await sampleIterator.next()
          nextSample = iter.done ? null : iter.value
        }
      }

      timeline.evaluateAt(projectTimeMs, activeBuffer)
      const activeKeys = new Set<string>()
      for (let i = 0; i < activeBuffer.length; i += 1) {
        activeKeys.add(activeBuffer[i].entry.spriteKey)
      }
      for (let i = 0; i < activeBuffer.length; i += 1) {
        const entry = activeBuffer[i].entry
        if (!compositor.hasSprite(entry.spriteKey)) {
          const sprite = rasterizer.rasterize(entry.spriteKey, entry.spriteSpec, projectScale)
          if (sprite) {
            compositor.uploadSprite(sprite, activeKeys)
          }
        }
      }

      compositor.renderFrame(currentSample ?? nextSample, activeBuffer)

      while (inFlight.length >= 2) {
        await inFlight.shift()
      }

      const addedPromise = new Promise<void>((res, rej) =>
        frameWaiters.set(index, { resolve: res, reject: rej })
      )
      inFlight.push(addedPromise)

      let transferred = false
      try {
        const vf = new VideoFrame(canvas, {
          timestamp: Math.round(frameOffsetMs * 1000),
          duration: Math.max(1, Math.round(durationMs * 1000)),
        })
        worker.postMessage(
          { type: 'frame', index, timestampMs: frameOffsetMs, durationMs, frame: vf },
          [vf as unknown as Transferable]
        )
        transferred = true
      } catch {
        // Ignore if VideoFrame(HTMLCanvasElement) transfer isn't supported; fall through to ImageBitmap
      }

      if (!transferred) {
        const bitmap = await createImageBitmap(canvas)
        worker.postMessage(
          { type: 'frame', index, timestampMs: frameOffsetMs, durationMs, bitmap },
          [bitmap]
        )
      }

      onProgress({
        completedFrames: index + 1,
        totalFrames,
        percent: (index + 1) / totalFrames,
        stage: 'rendering',
      })
    }

    await Promise.all(inFlight)
    onProgress({
      completedFrames: totalFrames,
      totalFrames,
      percent: 1,
      stage: 'finalizing',
      detail: '正在完成封装...',
    })
    worker.postMessage({ type: 'finish' })
    await completePromise
    await writer.finish()
    return {
      status: 'completed',
      path: writer.displayPath,
      delivery: writer.delivery,
      totalFrames,
    }
  } finally {
    if (onAbortMain) {
      signal.removeEventListener('abort', onAbortMain)
    }
    currentSample?.close()
    nextSample?.close()
    try {
      await sampleIterator?.return?.()
    } catch {
      // ignore
    }
    try {
      mediaInput?.dispose()
    } catch {
      // ignore
    }
    compositor.dispose()
    if (worker) {
      if (!writer.isFinished) {
        worker.postMessage({ type: 'cancel' })
      }
      worker.terminate()
    }
    await writer.cleanup()
  }
}

/**
 * Attempts direct offscreen GPU/WebCodecs export without creating any visible render window.
 * Automatically cascades from Worker WebGL2 -> Main-Thread WebGL2 -> WebView Render Window fallback.
 */
export async function tryRunDirectVideoExport(
  job: DirectExportJob,
  signal: AbortSignal,
  onProgress: (progress: DirectExportProgress) => void
): Promise<DirectExportAttemptResult> {
  if (typeof Worker === 'undefined' || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { status: 'fallback', reason: 'webcodecs-or-worker-unavailable' }
  }

  const sink = job.outputSink ?? (job.outputPath ? createTauriOutputSink(job.outputPath) : null)
  if (!sink) {
    throw new Error('缺少视频导出输出目标')
  }

  const durationMs = Math.max(1, job.endMs - job.startMs)
  const totalFrames = Math.max(1, Math.ceil((durationMs * job.fps) / 1000))

  onProgress({
    completedFrames: 0,
    totalFrames,
    percent: 0,
    stage: 'preparing',
    detail: '正在初始化 GPU 导出通道...',
  })

  await waitForDocumentFontsOnce()
  if (signal.aborted) {
    throw makeAbortError()
  }

  const workerResult = await runWorkerDirectExport(job, sink, totalFrames, signal, onProgress)
  if (workerResult.status === 'completed') {
    return workerResult
  }

  if (MAIN_THREAD_WEBGL_ELIGIBLE_FALLBACKS.has(workerResult.reason)) {
    return runMainThreadWebGLDirectExport(job, sink, totalFrames, signal, onProgress)
  }

  return workerResult
}
