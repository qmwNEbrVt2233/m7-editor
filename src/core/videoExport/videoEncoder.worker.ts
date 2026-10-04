import {
  ALL_FORMATS,
  CanvasSource,
  Conversion,
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

type AckMessage = { type: 'chunk-written'; id: number; error?: string }
type IncomingMessage = StartMessage | FrameMessage | AckMessage | { type: 'finish' } | { type: 'cancel' }

type PendingChunk = {
  resolve: () => void
  reject: (error: Error) => void
}

const workerScope = self as unknown as Worker
const pendingChunks = new Map<number, PendingChunk>()
let nextChunkId = 1
let output: Output | null = null
let canvasSource: CanvasSource | null = null
let canvas: OffscreenCanvas | null = null
let context: OffscreenCanvasRenderingContext2D | null = null
let input: Input | null = null
let audioConversion: Conversion | null = null
let audioTask: Promise<void> | null = null
let frameQueue: Promise<void> = Promise.resolve()
let isCanceled = false

function sendChunk(chunk: StreamTargetChunk) {
  const id = nextChunkId++
  const data = chunk.data.slice()

  return new Promise<void>((resolve, reject) => {
    pendingChunks.set(id, { resolve, reject })
    workerScope.postMessage({ type: 'chunk', id, position: chunk.position, data: data.buffer }, [data.buffer])
  })
}

async function startExport(message: StartMessage) {
  isCanceled = false

  const writable = new WritableStream<StreamTargetChunk>({
    write: sendChunk
  })
  const target = new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 })
  output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })

  canvas = new OffscreenCanvas(message.width, message.height)
  context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建视频帧画布')

  canvasSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: createVideoExportQuality(message.quality, message.width, message.height, message.fps),
    keyFrameInterval: 2
  })
  output.addVideoTrack(canvasSource, { frameRate: message.fps })

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
  if (!canvasSource || !context || isCanceled) {
    message.bitmap.close()
    return
  }

  try {
    context.drawImage(message.bitmap, 0, 0, canvas!.width, canvas!.height)
    message.bitmap.close()
    await canvasSource.add(message.timestampMs / 1000, message.durationMs / 1000)
    workerScope.postMessage({ type: 'frame-added', index: message.index })
  } catch (error) {
    message.bitmap.close()
    throw error
  }
}

async function finishExport() {
  await frameQueue
  if (!output || isCanceled) return
  canvasSource?.close()
  await audioTask
  await output.finalize()
  input?.dispose()
  workerScope.postMessage({ type: 'complete' })
}

async function cancelExport() {
  isCanceled = true
  await frameQueue
  for (const [id, pending] of pendingChunks) {
    pending.reject(new Error('视频导出已取消'))
    pendingChunks.delete(id)
  }
  await audioConversion?.cancel().catch(() => undefined)
  await output?.cancel().catch(() => undefined)
  input?.dispose()
  workerScope.postMessage({ type: 'canceled' })
}

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  if (message.type === 'chunk-written') {
    const pending = pendingChunks.get(message.id)
    if (!pending) return
    pendingChunks.delete(message.id)
    if (message.error) pending.reject(new Error(message.error))
    else pending.resolve()
    return
  }

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
