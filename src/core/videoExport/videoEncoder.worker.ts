import {
  ALL_FORMATS,
  Conversion,
  EncodedPacket,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  UrlSource,
  VideoSample,
  VideoSampleSource
} from 'mediabunny'
import type { DanmakuSpriteSpec } from './danmakuRenderer'
import {
  runDirectVideoExportSession,
  type DirectExportSpritePayload,
  type DirectExportStartPayload
} from './directExportSession'
import {
  computeNearLosslessBitrate,
  createVideoExportQuality,
  isValidExportQuality,
  resolveDirectVideoEncodingTarget,
  type ExportQuality
} from './quality'
import { createCoalescedChunkWritable } from './streamTargetWriter'

type StartMessage = {
  type: 'start'
  mediaUrl: string
  width: number
  height: number
  quality: ExportQuality
  fps: number
  startMs: number
  endMs: number
}

type StartDirectMessage = DirectExportStartPayload & {
  type: 'start-direct'
  quality: ExportQuality
}

type SpritesResponseMessage = {
  type: 'sprites'
  requestId: number
  sprites: DirectExportSpritePayload[]
}

type FrameMessage = {
  type: 'frame'
  index: number
  timestampMs: number
  durationMs: number
  bitmap?: ImageBitmap
  frame?: VideoFrame
}

type IncomingMessage =
  | StartMessage
  | StartDirectMessage
  | SpritesResponseMessage
  | FrameMessage
  | { type: 'finish' }
  | { type: 'cancel' }

const workerScope = self as unknown as Worker
let output: Output | null = null
let videoSampleSource: VideoSampleSource | null = null
let encodedVideoSource: EncodedVideoPacketSource | null = null
let webKitEncoder: VideoEncoder | null = null
let webKitPacketQueue: Promise<void> = Promise.resolve()
let webKitEncoderError: unknown = null
let webKitFrameRate = 30
let canvas: OffscreenCanvas | null = null
let context: OffscreenCanvasRenderingContext2D | null = null
let input: Input | null = null
let audioConversion: Conversion | null = null
let audioTask: Promise<void> | null = null
let frameQueue: Promise<void> = Promise.resolve()
let isCanceled = false
let isFinishing = false
let cancelPromise: Promise<void> | null = null
let webKitRuntime = false
let targetWidth = 0
let targetHeight = 0

let nextSpriteRequestId = 1
const pendingSpriteRequests = new Map<
  number,
  { resolve: (sprites: DirectExportSpritePayload[]) => void; reject: (reason?: unknown) => void }
>()

function rejectPendingSpriteRequests(reason: string) {
  for (const [, waiter] of pendingSpriteRequests) {
    waiter.reject(new Error(reason))
  }
  pendingSpriteRequests.clear()
}

function resetWorkerRefs() {
  output = null
  videoSampleSource = null
  encodedVideoSource = null
  webKitEncoder = null
  webKitPacketQueue = Promise.resolve()
  webKitEncoderError = null
  input = null
  audioConversion = null
  audioTask = null
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
  }
  canvas = null
  context = null
}

async function cleanupPartialSession() {
  await audioConversion?.cancel().catch(() => undefined)
  if (webKitEncoder && webKitEncoder.state !== 'closed') {
    try {
      webKitEncoder.close()
    } catch {
      // ignore close error
    }
  }
  await output?.cancel().catch(() => undefined)
  try {
    input?.dispose()
  } catch {
    // ignore dispose error
  }
  resetWorkerRefs()
}

function postFinalizingStage(stage: string) {
  workerScope.postMessage({ type: 'finalizing-stage', stage })
}

function emitCoalescedChunk(position: number, data: Uint8Array<ArrayBuffer>) {
  // Do not make WebCodecs wait for a Tauri IPC round trip here. On WebKit,
  // waiting for the acknowledgement of a chunk can deadlock WritableStream
  // backpressure. The host keeps every native write promise and waits for
  // them before finalizing the file, so transfer is fire-and-forget.
  workerScope.postMessage({ type: 'chunk', position, data: data.buffer }, [data.buffer])
}

function isWebKitRuntime() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent
  return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(userAgent)
}

function getWebKitBitrate(quality: ExportQuality, width: number, height: number, fps: number) {
  if (quality === 'near-lossless') {
    return computeNearLosslessBitrate(width, height, fps)
  }

  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1920
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1080
  const qualityScaleMap: Record<'low' | 'high' | 'very-high', number> = {
    low: 0.25,
    high: 0.75,
    'very-high': 1
  }
  const qualityScale = qualityScaleMap[quality] ?? 0.75
  const factor = 0.3 * Math.exp(2.5538 * qualityScale)
  const baseBitrate = 3_000_000 * Math.pow((safeWidth * safeHeight) / (1920 * 1080), 0.95)
  return Math.max(100_000, Math.ceil(baseBitrate * factor / 1000) * 1000)
}

async function createWebKitEncoder(configParams: {
  quality: ExportQuality
  width: number
  height: number
  fps: number
}) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('macOS WebView 不支持 WebCodecs 视频编码')
  }

  const bitrate = getWebKitBitrate(configParams.quality, configParams.width, configParams.height, configParams.fps)
  const baseCodecs = configParams.width > 4096 || configParams.height > 4096
    ? ['avc1.64003c', 'avc1.64003e', 'avc1.4d003c', 'avc1.640034', 'avc1.640033', 'avc1.4d0033', 'avc1.420033']
    : ['avc1.640033', 'avc1.4d0033', 'avc1.420033']
  const configs: VideoEncoderConfig[] = [
    ...baseCodecs.map((codec) => ({
      codec,
      width: configParams.width,
      height: configParams.height,
      bitrate,
      framerate: configParams.fps,
      hardwareAcceleration: 'prefer-hardware' as const,
      alpha: 'discard' as const
    })),
    ...baseCodecs.map((codec) => ({
      codec,
      width: configParams.width,
      height: configParams.height,
      bitrate,
      framerate: configParams.fps,
      alpha: 'discard' as const
    }))
  ]

  let config: VideoEncoderConfig | null = null
  for (const candidate of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate)
      if (support.supported && support.config) {
        config = support.config
        break
      }
    } catch {
      // Try the next AVC profile/level. WebKit versions differ in which AVC
      // profile string they accept even when they all encode H.264.
    }
  }
  if (!config) throw new Error('macOS WebView 无法配置 H.264 编码器')

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      if (!encodedVideoSource || isCanceled) return
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      webKitPacketQueue = webKitPacketQueue.then(async () => {
        if (webKitEncoderError) throw webKitEncoderError
        await encodedVideoSource!.add(packet, metadata)
      }).catch((error: unknown) => {
        webKitEncoderError ??= error
        if (!isCanceled && !isFinishing) {
          workerScope.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      })
    },
    error: (error) => {
      webKitEncoderError ??= error
      if (!isCanceled && !isFinishing) {
        workerScope.postMessage({ type: 'error', message: error.message })
      }
    }
  })
  encoder.configure(config)
  return encoder
}

async function initializeMuxerSession(config: {
  mediaUrl: string
  width: number
  height: number
  quality: ExportQuality
  fps: number
  startMs: number
  endMs: number
  readyMessageType: 'ready' | 'direct-ready'
}) {
  if (
    !Number.isInteger(config.width) ||
    !Number.isInteger(config.height) ||
    config.width < 16 ||
    config.width > 7680 ||
    config.height < 16 ||
    config.height > 4320 ||
    config.width % 2 !== 0 ||
    config.height % 2 !== 0 ||
    !Number.isFinite(config.fps) ||
    config.fps <= 0 ||
    config.fps > 120 ||
    !Number.isFinite(config.startMs) ||
    !Number.isFinite(config.endMs) ||
    config.startMs < 0 ||
    config.endMs <= config.startMs ||
    !isValidExportQuality(config.quality)
  ) {
    throw new Error('视频编码会话参数无效')
  }

  isCanceled = false
  isFinishing = false
  cancelPromise = null
  webKitRuntime = isWebKitRuntime()
  webKitPacketQueue = Promise.resolve()
  webKitEncoderError = null
  webKitFrameRate = config.fps
  targetWidth = config.width
  targetHeight = config.height

  try {
    const writable = createCoalescedChunkWritable(emitCoalescedChunk)
    // WebKit can keep a chunked target in memory until the first 4 MiB block is
    // complete, then stall while applying stream backpressure. Keeping chunked: false
    // with coalesced IPC writes avoids both the WebKit stall and per-packet syscall storms.
    const target = new StreamTarget(writable, webKitRuntime
      ? { chunked: false }
      : { chunked: true, chunkSize: 4 * 1024 * 1024 })
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })

    if (webKitRuntime) {
      encodedVideoSource = new EncodedVideoPacketSource('avc')
      output.addVideoTrack(encodedVideoSource, { frameRate: config.fps })
      webKitEncoder = await createWebKitEncoder(config)
    } else {
      const targetConfig = await resolveDirectVideoEncodingTarget(
        config.width,
        config.height,
        config.fps,
        config.quality
      )
      videoSampleSource = new VideoSampleSource({
        codec: targetConfig?.codec ?? 'avc',
        quality: targetConfig?.quality ?? createVideoExportQuality(config.quality, config.width, config.height, config.fps),
        hardwareAcceleration: targetConfig?.hardwareAcceleration ?? 'prefer-hardware',
        keyFrameInterval: 2
      })
      output.addVideoTrack(videoSampleSource, { frameRate: config.fps })
    }

    let hasAudio = false
    if (config.mediaUrl) {
      input = new Input({ source: new UrlSource(config.mediaUrl), formats: ALL_FORMATS })
      const audioTrack = await input.getPrimaryAudioTrack()
      hasAudio = Boolean(audioTrack)
      if (audioTrack) {
        audioConversion = await Conversion.init({
          input,
          output,
          tracks: 'primary',
          video: { discard: true },
          audio: {},
          trim: { start: config.startMs / 1000, end: config.endMs / 1000 },
          composable: true,
          showWarnings: false
        })
        if (audioConversion.discardedTracks.some((track) => track.track === audioTrack)) {
          throw new Error('源视频音轨无法加入 MP4')
        }
      }
    }

    if (isCanceled) {
      await cleanupPartialSession()
      return
    }

    // Signal ready before output.start() emits header chunks so host queues startVideoExportFile first
    workerScope.postMessage({ type: config.readyMessageType, hasAudio })
    await output.start()
    if (audioConversion) {
      audioTask = audioConversion.execute()
      audioTask.catch((error) => {
        if (!isCanceled) workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    }
  } catch (error) {
    await cleanupPartialSession()
    throw error
  }
}

async function startExport(message: StartMessage) {
  if (
    !Number.isInteger(message.width) ||
    !Number.isInteger(message.height) ||
    message.width < 16 ||
    message.height < 16
  ) {
    throw new Error('视频导出分辨率无效')
  }
  canvas = new OffscreenCanvas(message.width, message.height)
  context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建视频帧画布')
  await initializeMuxerSession({ ...message, readyMessageType: 'ready' })
}

async function encodeWebKitVideoFrame(frame: VideoFrame, index: number) {
  try {
    if (isCanceled) return
    if (webKitEncoderError) throw webKitEncoderError
    if (!webKitEncoder || webKitEncoder.state !== 'configured') {
      throw new Error('视频编码器未就绪或已关闭')
    }
    const keyFrameInterval = Math.max(1, Math.round(webKitFrameRate * 2))
    webKitEncoder.encode(frame, {
      keyFrame: index === 0 || index % keyFrameInterval === 0
    })
  } finally {
    frame.close()
  }

  // Flush periodically (instead of every single frame) to keep VideoToolbox pipelined
  // while preventing WebKit's large-batch control queue drain bug.
  const flushInterval = Math.max(8, Math.min(20, Math.round(webKitFrameRate / 2)))
  if ((index + 1) % flushInterval === 0 || webKitEncoder!.encodeQueueSize >= 6) {
    await webKitEncoder!.flush()
    await webKitPacketQueue
    if (webKitEncoderError) throw webKitEncoderError
  }
}

async function addEncodedSample(sample: VideoSample, index: number) {
  try {
    if (!videoSampleSource || isCanceled) {
      return
    }
    await videoSampleSource.add(sample)
  } finally {
    sample.close()
  }
  void index
}

function createVideoFrameFromBitmap(bitmap: ImageBitmap, timestampMs: number, durationMs: number): VideoFrame {
  const ts = Math.round(timestampMs * 1000)
  const dur = Math.max(1, Math.round(durationMs * 1000))
  if (bitmap.width === targetWidth && bitmap.height === targetHeight) {
    try {
      return new VideoFrame(bitmap, { timestamp: ts, duration: dur })
    } catch {
      // Fall back to 2D canvas blit if VideoFrame(ImageBitmap) is unsupported
    }
  }
  if (!canvas || !context) {
    throw new Error('视频帧画布未就绪')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new VideoFrame(canvas, { timestamp: ts, duration: dur })
}

async function addFrame(message: FrameMessage) {
  if ((webKitRuntime ? !webKitEncoder : !videoSampleSource) || isCanceled) {
    message.bitmap?.close()
    message.frame?.close()
    return
  }

  let frame: VideoFrame | null = null
  try {
    if (message.frame) {
      frame = message.frame
    } else if (message.bitmap) {
      frame = createVideoFrameFromBitmap(message.bitmap, message.timestampMs, message.durationMs)
    } else {
      return
    }
  } catch (error) {
    message.frame?.close()
    throw error
  } finally {
    message.bitmap?.close()
  }

  if (webKitRuntime) {
    await encodeWebKitVideoFrame(frame, message.index)
    workerScope.postMessage({ type: 'frame-added', index: message.index })
    return
  }

  let sample: VideoSample
  try {
    sample = new VideoSample(frame, {
      timestamp: message.timestampMs / 1000,
      duration: Math.max(0.000001, message.durationMs / 1000)
    })
  } catch (error) {
    frame.close()
    throw error
  }
  await addEncodedSample(sample, message.index)
  workerScope.postMessage({ type: 'frame-added', index: message.index })
}

async function finalizeAndCloseOutput(emitComplete: boolean) {
  if (!output || isCanceled) return
  isFinishing = true
  let finalized = false
  try {
    if (webKitRuntime) {
      postFinalizingStage('正在确认最后一个视频包')
      if (webKitEncoder && webKitEncoder.state === 'configured') {
        await webKitEncoder.flush()
      }
      await webKitPacketQueue
      if (webKitEncoderError) throw webKitEncoderError
      encodedVideoSource?.close()
    } else {
      postFinalizingStage('正在关闭视频编码器')
      videoSampleSource?.close()
    }
    postFinalizingStage('正在等待音频转换')
    await audioTask
    postFinalizingStage('正在完成 MP4 封装')
    await output.finalize()
    finalized = true
    postFinalizingStage('MP4 封装完成')
    if (emitComplete && !isCanceled) {
      workerScope.postMessage({ type: 'complete' })
    }
  } finally {
    if (!finalized) {
      await audioConversion?.cancel().catch(() => undefined)
      await output?.cancel().catch(() => undefined)
    }
    if (webKitEncoder && webKitEncoder.state !== 'closed') {
      try {
        webKitEncoder.close()
      } catch {
        // ignore
      }
    }
    try {
      input?.dispose()
    } catch {
      // ignore
    }
    resetWorkerRefs()
  }
}

async function finishExport() {
  await frameQueue
  if (isCanceled) return
  await finalizeAndCloseOutput(true)
}

async function startDirectExport(message: StartDirectMessage) {
  isCanceled = false
  isFinishing = false
  cancelPromise = null
  webKitRuntime = isWebKitRuntime()

  const outcome = await runDirectVideoExportSession(message, {
    encoderSink: {
      probeCanvas: async (offscreen) => {
        let probe: VideoFrame | null = null
        try {
          probe = new VideoFrame(offscreen, {
            timestamp: 0,
            duration: Math.max(1, Math.round(1_000_000 / message.fps))
          })
        } catch {
          throw new Error('webkit-videoframe-offscreen-unsupported')
        } finally {
          probe?.close()
        }
        if (webKitRuntime) {
          const testEncoder = await createWebKitEncoder(message)
          try {
            // Encoder configured successfully
          } finally {
            if (testEncoder.state !== 'closed') {
              testEncoder.close()
            }
          }
        }
      },
      startMuxer: async () => {
        await initializeMuxerSession({ ...message, readyMessageType: 'direct-ready' })
      },
      encodeCanvasFrame: async (offscreen, frameIndex, timestampMs, durationMs) => {
        if (isCanceled) return
        if (webKitRuntime) {
          const frame = new VideoFrame(offscreen, {
            timestamp: Math.round(timestampMs * 1000),
            duration: Math.max(1, Math.round(durationMs * 1000))
          })
          await encodeWebKitVideoFrame(frame, frameIndex)
          return
        }
        const sample = new VideoSample(offscreen, {
          timestamp: timestampMs / 1000,
          duration: Math.max(0.000001, durationMs / 1000)
        })
        await addEncodedSample(sample, frameIndex)
      },
      finish: async () => {
        await finalizeAndCloseOutput(true)
      }
    },
    requestSprites: (maxTextureSize, items: Array<{ key: string; spec: DanmakuSpriteSpec }>) => {
      if (isCanceled) {
        return Promise.reject(new Error('视频导出已取消'))
      }
      const requestId = nextSpriteRequestId++
      return new Promise<DirectExportSpritePayload[]>((resolve, reject) => {
        pendingSpriteRequests.set(requestId, { resolve, reject })
        workerScope.postMessage({
          type: 'request-sprites',
          requestId,
          maxTextureSize,
          items
        })
      })
    },
    onFallback: (reason) => {
      workerScope.postMessage({ type: 'direct-fallback', reason })
    },
    onProgress: (phase, completedFrames, totalFrames) => {
      workerScope.postMessage({ type: 'direct-progress', phase, completedFrames, totalFrames })
    },
    isAborted: () => isCanceled
  })

  if (outcome === 'aborted') {
    await cancelExport()
  }
}

async function cancelExport() {
  if (cancelPromise) {
    return cancelPromise
  }
  isCanceled = true
  rejectPendingSpriteRequests('视频导出已取消')
  cancelPromise = (async () => {
    await frameQueue.catch(() => undefined)
    await cleanupPartialSession()
    workerScope.postMessage({ type: 'canceled' })
  })()
  return cancelPromise
}

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  if (message.type === 'start') {
    void startExport(message).catch((error) => {
      if (!isCanceled) {
        workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  } else if (message.type === 'start-direct') {
    void startDirectExport(message).catch((error) => {
      if (!isCanceled) {
        workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  } else if (message.type === 'sprites') {
    const waiter = pendingSpriteRequests.get(message.requestId)
    if (waiter) {
      pendingSpriteRequests.delete(message.requestId)
      waiter.resolve(message.sprites)
    }
  } else if (message.type === 'frame') {
    frameQueue = frameQueue.then(() => addFrame(message)).catch((error) => {
      const wasCanceled = isCanceled
      isCanceled = true
      if (!wasCanceled) {
        workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  } else if (message.type === 'finish') {
    void finishExport().catch((error) => {
      if (!isCanceled) {
        workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  } else if (message.type === 'cancel') {
    void cancelExport()
  }
}
