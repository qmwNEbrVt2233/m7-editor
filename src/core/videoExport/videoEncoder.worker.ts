import {
  ALL_FORMATS,
  CanvasSource,
  Conversion,
  EncodedPacket,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  UrlSource,
  type StreamTargetChunk
} from 'mediabunny'
import { createVideoExportQuality, type ExportQuality } from './quality'

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

type FrameMessage = {
  type: 'frame'
  index: number
  timestampMs: number
  durationMs: number
  bitmap: ImageBitmap
}

type IncomingMessage = StartMessage | FrameMessage | { type: 'finish' } | { type: 'cancel' }

const workerScope = self as unknown as Worker
let output: Output | null = null
let canvasSource: CanvasSource | null = null
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
let webKitRuntime = false

function postFinalizingStage(stage: string) {
  workerScope.postMessage({ type: 'finalizing-stage', stage })
}

function sendChunk(chunk: StreamTargetChunk) {
  const data = chunk.data.slice()

  // Do not make WebCodecs wait for a Tauri IPC round trip here. On WebKit,
  // waiting for the acknowledgement of the first full StreamTarget chunk can
  // deadlock the worker's WritableStream backpressure at a stable frame
  // number (usually frame 7). The host keeps every native write promise and
  // waits for them before finalizing the file, so the transfer itself can be
  // fire-and-forget from the worker.
  workerScope.postMessage({ type: 'chunk', position: chunk.position, data: data.buffer }, [data.buffer])
}

function isWebKitRuntime() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent
  return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(userAgent)
}

function getWebKitBitrate(quality: ExportQuality, width: number, height: number, fps: number) {
  if (quality === 'near-lossless') {
    const pixelScale = Math.pow((width * height) / (1920 * 1080), 0.95)
    return Math.min(500_000_000, Math.max(30_000_000, Math.ceil(30_000_000 * pixelScale * fps / 30)))
  }

  const qualityScale = { low: 0.25, high: 0.75, 'very-high': 1 }[quality]
  const factor = 0.3 * Math.exp(2.5538 * qualityScale)
  const baseBitrate = 3_000_000 * Math.pow((width * height) / (1920 * 1080), 0.95)
  return Math.ceil(baseBitrate * factor / 1000) * 1000
}

async function createWebKitEncoder(message: StartMessage) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('macOS WebView 不支持 WebCodecs 视频编码')
  }

  const bitrate = getWebKitBitrate(message.quality, message.width, message.height, message.fps)
  const configs: VideoEncoderConfig[] = [
    'avc1.640033',
    'avc1.4d0033',
    'avc1.420033'
  ].map((codec) => ({
    codec,
    width: message.width,
    height: message.height,
    bitrate,
    framerate: message.fps,
    alpha: 'discard'
  }))

  let config: VideoEncoderConfig | null = null
  for (const candidate of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate)
      if (support.supported) {
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

async function startExport(message: StartMessage) {
  isCanceled = false
  isFinishing = false
  webKitRuntime = isWebKitRuntime()
  webKitPacketQueue = Promise.resolve()
  webKitEncoderError = null
  webKitFrameRate = message.fps

  const writable = new WritableStream<StreamTargetChunk>({
    write: sendChunk
  })
  // WebKit can keep a chunked target in memory until the first 4 MiB block is
  // complete, then stall while applying stream backpressure. Writing the
  // muxer's natural ranges avoids that WebKit-only boundary while retaining
  // chunk aggregation on Chromium/WebView2.
  const target = new StreamTarget(writable, webKitRuntime
    ? { chunked: false }
    : { chunked: true, chunkSize: 4 * 1024 * 1024 })
  output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })

  canvas = new OffscreenCanvas(message.width, message.height)
  context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建视频帧画布')

  if (webKitRuntime) {
    encodedVideoSource = new EncodedVideoPacketSource('avc')
    output.addVideoTrack(encodedVideoSource, { frameRate: message.fps })
    webKitEncoder = await createWebKitEncoder(message)
  } else {
    canvasSource = new CanvasSource(canvas, {
      codec: 'avc',
      quality: createVideoExportQuality(message.quality, message.width, message.height, message.fps),
      keyFrameInterval: 2
    })
    output.addVideoTrack(canvasSource, { frameRate: message.fps })
  }

  let hasAudio = false
  if (message.mediaUrl) {
    input = new Input({ source: new UrlSource(message.mediaUrl), formats: ALL_FORMATS })
    const audioTrack = await input.getPrimaryAudioTrack()
    hasAudio = Boolean(audioTrack)
    if (audioTrack) {
      audioConversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: { discard: true },
        audio: {},
        trim: { start: message.startMs / 1000, end: message.endMs / 1000 },
        composable: true,
        showWarnings: false
      })
      if (audioConversion.discardedTracks.some((track) => track.track === audioTrack)) {
        throw new Error('源视频音轨无法加入 MP4')
      }
    }
  }

  await output.start()
  if (audioConversion) {
    audioTask = audioConversion.execute()
    audioTask.catch((error) => {
      if (!isCanceled) workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  }

  workerScope.postMessage({ type: 'ready', hasAudio })
}

async function addFrame(message: FrameMessage) {
  if (!context || (webKitRuntime ? !webKitEncoder : !canvasSource) || isCanceled) {
    message.bitmap.close()
    return
  }

  workerScope.postMessage({ type: 'frame-stage', index: message.index, stage: 'received' })
  context.drawImage(message.bitmap, 0, 0, canvas!.width, canvas!.height)
  message.bitmap.close()

  if (webKitRuntime) {
    const frame = new VideoFrame(canvas!, {
      timestamp: Math.round(message.timestampMs * 1000),
      duration: Math.max(1, Math.round(message.durationMs * 1000))
    })
    try {
      const keyFrameInterval = Math.max(1, Math.round(webKitFrameRate * 2))
      webKitEncoder!.encode(frame, {
        keyFrame: message.index === 0 || message.index % keyFrameInterval === 0
      })
    } finally {
      frame.close()
    }
    // WebKit can leave a large batch of queued VideoEncoder control messages
    // unresolved when flush() is only called once at the end. Flush each
    // frame while the queue is small, then wait for its muxer packet before
    // accepting the next frame. This is slower on macOS but makes the final
    // stage independent of the WebKit queue-drain bug.
    await webKitEncoder!.flush()
    await webKitPacketQueue
    if (webKitEncoderError) throw webKitEncoderError
    workerScope.postMessage({ type: 'frame-stage', index: message.index, stage: 'submitted' })
    workerScope.postMessage({ type: 'frame-added', index: message.index })
    return
  }

  const addPromise = canvasSource.add(message.timestampMs / 1000, message.durationMs / 1000)
  const addOutcome = addPromise.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error })
  )

  workerScope.postMessage({ type: 'frame-stage', index: message.index, stage: 'submitted' })
  if (!webKitRuntime || message.index === 0) {
    const outcome = await addOutcome
    if (!outcome.ok) throw outcome.error
  } else {
    // Safari/WebKit may never dispatch VideoEncoder's `dequeue` event after
    // its queue reaches four frames. The encoded frames still drain and
    // the source close/finalize path remains the authoritative completion point,
    // so do not serialize the whole export behind that optional signal.
    let timedOut = false
    const timeout = new Promise<{ ok: true }>((resolve) => {
      setTimeout(() => {
        timedOut = true
        resolve({ ok: true })
      }, 250)
    })
    const outcome = await Promise.race([addOutcome, timeout])
    if (!outcome.ok) throw outcome.error
    if (timedOut) {
      void addOutcome.then((lateOutcome) => {
        if (!lateOutcome.ok && !isCanceled && !isFinishing) {
          workerScope.postMessage({
            type: 'error',
            message: lateOutcome.error instanceof Error ? lateOutcome.error.message : String(lateOutcome.error)
          })
        }
      })
    }
  }
  workerScope.postMessage({ type: 'frame-added', index: message.index })
}

async function finishExport() {
  await frameQueue
  if (!output || isCanceled) return
  isFinishing = true
  try {
    if (webKitRuntime) {
      postFinalizingStage('正在确认最后一个视频包')
      await webKitPacketQueue
      if (webKitEncoderError) throw webKitEncoderError
      encodedVideoSource?.close()
    } else {
      postFinalizingStage('正在关闭视频编码器')
      canvasSource?.close()
    }
    postFinalizingStage('正在等待音频转换')
    await audioTask
    postFinalizingStage('正在完成 MP4 封装')
    await output.finalize()
    postFinalizingStage('MP4 封装完成')
    input?.dispose()
    workerScope.postMessage({ type: 'complete' })
  } finally {
    if (webKitEncoder && webKitEncoder.state !== 'closed') webKitEncoder.close()
  }
}

async function cancelExport() {
  isCanceled = true
  await frameQueue
  await audioConversion?.cancel().catch(() => undefined)
  if (webKitEncoder && webKitEncoder.state !== 'closed') webKitEncoder.close()
  await output?.cancel().catch(() => undefined)
  input?.dispose()
  workerScope.postMessage({ type: 'canceled' })
}

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  if (message.type === 'start') {
    void startExport(message).catch((error) => {
      workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  } else if (message.type === 'frame') {
    frameQueue = frameQueue.then(() => addFrame(message)).catch((error) => {
      isCanceled = true
      workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  } else if (message.type === 'finish') {
    void finishExport().catch((error) => {
      workerScope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  } else if (message.type === 'cancel') {
    void cancelExport()
  }
}
