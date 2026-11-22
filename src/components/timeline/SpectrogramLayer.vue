<template>
  <canvas
    class="spectrogram"
    ref="spectrogramCanvasRef"
    :width="canvasWidth"
    :height="SPECTROGRAM_HEIGHT"
  ></canvas>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { normalizeColor } from '@/utils/validation'
import type {
  PrecisionLevel,
  SpectrogramWorkerRequest,
  SpectrogramWorkerResponse
} from '../../core/spectrogram.worker'

const CHUNK_DURATION_MS = 10000
const SPECTROGRAM_HEIGHT = 200
const SPECTROGRAM_SAMPLE_RATE = 8000

const props = defineProps<{
  scale: number
  offset: number
  containerWidth: number
}>()

const store = useEditorStore()
const notice = useNoticeStore()

const spectrogramCanvasRef = ref<HTMLCanvasElement | null>(null)

const canvasWidth = computed(() => {
  const width = Number(props.containerWidth)
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : 0
})

const currentLevel = computed<PrecisionLevel>(() => {
  const s = props.scale
  if (s < 0.05) return 'low'
  if (s < 0.2) return 'medium'
  if (s < 0.8) return 'high'
  return 'ultra'
})

const FALLBACK_LEVEL_ORDER: Record<PrecisionLevel, PrecisionLevel[]> = {
  low: ['medium', 'high', 'ultra'],
  medium: ['high', 'low', 'ultra'],
  high: ['medium', 'ultra', 'low'],
  ultra: ['high', 'medium', 'low']
}

const MIN_TILE_BITMAP_CACHE_SIZE = 128
const MAX_IN_FLIGHT_CHUNKS = 2

type ResolvedColorConfig = {
  colorKey: string
  colorScheme: 'default' | 'customize'
  customColorRgb: [number, number, number] | null
}

type CachedChunkBitmap = {
  source: ImageBitmap | HTMLCanvasElement | null
  width: number
  height: number
  startMs: number
  endMs: number
}

type PendingChunkTask = {
  key: string
  level: PrecisionLevel
  chunkIndex: number
}

type InFlightMeta = {
  key: string
  generation: number
  level: PrecisionLevel
  chunkIndex: number
  colorKey: string
}

let worker: Worker | null = null
let loadAbortController: AbortController | null = null
let dataGeneration = 0
let totalDurationMs = 0
let hasAudioData = false
let renderRafId: number | null = null
let nextWorkerRequestId = 1
let lastVisibleChunkCount = 0

let activeColorConfig: ResolvedColorConfig = resolveColorConfig()

const bitmapCache = new Map<string, CachedChunkBitmap>()
const inFlightByKey = new Map<string, number>()
const inFlightMeta = new Map<number, InFlightMeta>()
let pendingQueue: PendingChunkTask[] = []

function resolveColorConfig(): ResolvedColorConfig {
  const scheme = store.spectrogramColorScheme
  const customColor = store.spectrogramCustomColor

  if (scheme === 'customize' && customColor) {
    const hex6 = normalizeColor(customColor)
    if (hex6 && hex6.length === 7) {
      const r = parseInt(hex6.slice(1, 3), 16)
      const g = parseInt(hex6.slice(3, 5), 16)
      const b = parseInt(hex6.slice(5, 7), 16)
      return {
        colorKey: `customize|${hex6}`,
        colorScheme: 'customize',
        customColorRgb: [r, g, b]
      }
    }
  }

  return {
    colorKey: 'default',
    colorScheme: 'default',
    customColorRgb: null
  }
}

function disposeChunkBitmap(entry: CachedChunkBitmap | undefined) {
  if (entry?.source && 'close' in entry.source && typeof entry.source.close === 'function') {
    entry.source.close()
  }
}

function clearBitmapCache() {
  for (const entry of bitmapCache.values()) {
    disposeChunkBitmap(entry)
  }
  bitmapCache.clear()
}

function getCachedBitmap(key: string): CachedChunkBitmap | undefined {
  if (!bitmapCache.has(key)) {
    return undefined
  }
  const value = bitmapCache.get(key)!
  bitmapCache.delete(key)
  bitmapCache.set(key, value)
  return value
}

function setCachedBitmap(key: string, value: CachedChunkBitmap) {
  if (bitmapCache.has(key)) {
    const previous = bitmapCache.get(key)
    if (previous !== value) {
      disposeChunkBitmap(previous)
    }
    bitmapCache.delete(key)
  }
  bitmapCache.set(key, value)

  const maxSize = Math.max(MIN_TILE_BITMAP_CACHE_SIZE, lastVisibleChunkCount * 2)
  while (bitmapCache.size > maxSize) {
    const oldest = bitmapCache.keys().next()
    if (oldest.done) break
    const evicted = bitmapCache.get(oldest.value)
    bitmapCache.delete(oldest.value)
    disposeChunkBitmap(evicted)
  }
}

function createCanvasFromPixels(
  pixels: ArrayBuffer,
  width: number,
  height: number
): HTMLCanvasElement | null {
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    return null
  }
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
  ctx.putImageData(imageData, 0, 0)
  return offscreen
}

function cancelScheduledRender() {
  if (renderRafId !== null) {
    cancelAnimationFrame(renderRafId)
    renderRafId = null
  }
}

function clearCanvas() {
  const canvas = spectrogramCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (canvas && ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

function abortAudioLoad() {
  if (loadAbortController) {
    loadAbortController.abort()
    loadAbortController = null
  }
}

function terminateWorker() {
  if (worker) {
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
    worker = null
  }
  inFlightByKey.clear()
  inFlightMeta.clear()
  pendingQueue = []
}

function postToWorker(message: SpectrogramWorkerRequest, transfer?: Transferable[]) {
  if (!worker) {
    return
  }
  if (transfer && transfer.length > 0) {
    worker.postMessage(message, transfer)
  } else {
    worker.postMessage(message)
  }
}

function ensureWorker(): Worker {
  if (worker) {
    return worker
  }

  const nextWorker = new Worker(new URL('../../core/spectrogram.worker.ts', import.meta.url), {
    type: 'module'
  })

  nextWorker.onmessage = (event: MessageEvent<SpectrogramWorkerResponse>) => {
    if (worker !== nextWorker) {
      if (event.data?.type === 'chunk-result' && !event.data.empty && event.data.bitmap) {
        event.data.bitmap.close()
      }
      return
    }
    handleWorkerMessage(event.data)
  }

  nextWorker.onerror = (event: ErrorEvent) => {
    if (worker !== nextWorker) {
      return
    }
    notice.log('[频谱] 频谱工作线程运行异常', 'warn', event.message || event)
    hasAudioData = false
    totalDurationMs = 0
    clearBitmapCache()
    terminateWorker()
    clearCanvas()
  }

  nextWorker.onmessageerror = (event: MessageEvent) => {
    if (worker !== nextWorker) {
      return
    }
    notice.log('[频谱] 频谱工作线程消息反序列化失败', 'warn', event)
    inFlightByKey.clear()
    inFlightMeta.clear()
    pendingQueue = []
  }

  worker = nextWorker
  return nextWorker
}

function handleWorkerMessage(message: SpectrogramWorkerResponse) {
  const meta = inFlightMeta.get(message.requestId)
  inFlightMeta.delete(message.requestId)
  if (meta && inFlightByKey.get(meta.key) === message.requestId) {
    inFlightByKey.delete(meta.key)
  }

  if (message.type === 'chunk-error') {
    if (message.generation === dataGeneration) {
      notice.alert('分段解算失败:', 'error', '频谱错误', message.message)
    }
    pumpWorkerQueue()
    return
  }

  const isStale =
    message.generation !== dataGeneration ||
    message.colorKey !== activeColorConfig.colorKey ||
    !store.showSpectrogram

  if (isStale) {
    if (!message.empty && message.bitmap) {
      message.bitmap.close()
    }
    pumpWorkerQueue()
    return
  }

  const key = `${message.level}_${message.chunkIndex}`
  if (message.empty) {
    setCachedBitmap(key, {
      source: null,
      width: 0,
      height: 0,
      startMs: 0,
      endMs: 0
    })
  } else {
    const source: ImageBitmap | HTMLCanvasElement | null = message.bitmap
      ? message.bitmap
      : message.pixels
        ? createCanvasFromPixels(message.pixels, message.width, message.height)
        : null

    setCachedBitmap(key, {
      source,
      width: message.width,
      height: message.height,
      startMs: message.startMs,
      endMs: message.endMs
    })
    scheduleRender()
  }

  pumpWorkerQueue()
}

function pumpWorkerQueue() {
  if (!worker || !hasAudioData || !store.showSpectrogram) {
    return
  }

  while (inFlightMeta.size < MAX_IN_FLIGHT_CHUNKS && pendingQueue.length > 0) {
    const task = pendingQueue.shift()!
    if (bitmapCache.has(task.key) || inFlightByKey.has(task.key)) {
      continue
    }

    const requestId = nextWorkerRequestId++
    const generation = dataGeneration
    const colorConfig = activeColorConfig

    inFlightByKey.set(task.key, requestId)
    inFlightMeta.set(requestId, {
      key: task.key,
      generation,
      level: task.level,
      chunkIndex: task.chunkIndex,
      colorKey: colorConfig.colorKey
    })

    postToWorker({
      type: 'render-chunk',
      requestId,
      generation,
      level: task.level,
      chunkIndex: task.chunkIndex,
      colorScheme: colorConfig.colorScheme,
      customColorRgb: colorConfig.customColorRgb,
      colorKey: colorConfig.colorKey,
      targetHeight: SPECTROGRAM_HEIGHT
    })
  }
}

function resetSpectrogramData(options?: { terminate?: boolean }) {
  dataGeneration++
  totalDurationMs = 0
  hasAudioData = false
  lastVisibleChunkCount = 0
  cancelScheduledRender()
  clearBitmapCache()
  inFlightByKey.clear()
  pendingQueue = []

  if (options?.terminate) {
    terminateWorker()
  } else if (worker) {
    postToWorker({
      type: 'clear-audio',
      generation: dataGeneration
    })
  }

  clearCanvas()
}

async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext

  if (OfflineCtx) {
    let offlineCtx: OfflineAudioContext | null = null
    try {
      offlineCtx = new OfflineCtx(1, 1, SPECTROGRAM_SAMPLE_RATE)
    } catch {
      offlineCtx = null
    }
    if (offlineCtx) {
      return await offlineCtx.decodeAudioData(arrayBuffer)
    }
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new Error('当前环境不支持 Web Audio API')
  }

  let audioCtx: AudioContext
  try {
    audioCtx = new AudioCtx({ sampleRate: SPECTROGRAM_SAMPLE_RATE })
  } catch {
    audioCtx = new AudioCtx()
  }

  try {
    return await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    await audioCtx.close().catch(() => {})
  }
}

async function initSpectrogram() {
  abortAudioLoad()

  if (!store.showSpectrogram) {
    resetSpectrogramData({ terminate: true })
    return
  }

  resetSpectrogramData()

  const mediaUrl = store.mediaUrl
  if (!mediaUrl) {
    return
  }

  const controller = new AbortController()
  loadAbortController = controller
  const generation = dataGeneration

  try {
    const response = await fetch(mediaUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`加载媒体失败: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    if (controller.signal.aborted || generation !== dataGeneration) {
      return
    }

    const decodedBuffer = await decodeAudioBuffer(arrayBuffer)
    if (controller.signal.aborted || generation !== dataGeneration) {
      return
    }

    if (
      decodedBuffer.numberOfChannels <= 0 ||
      decodedBuffer.length <= 0 ||
      !Number.isFinite(decodedBuffer.sampleRate) ||
      decodedBuffer.sampleRate <= 0
    ) {
      return
    }

    const pcm = new Float32Array(decodedBuffer.length)
    decodedBuffer.copyFromChannel(pcm, 0)
    const sampleRate = decodedBuffer.sampleRate
    const durationMs =
      Number.isFinite(decodedBuffer.duration) && decodedBuffer.duration > 0
        ? decodedBuffer.duration * 1000
        : (pcm.length / sampleRate) * 1000

    ensureWorker()
    postToWorker(
      {
        type: 'set-audio',
        generation,
        sampleRate,
        durationMs,
        chunkDurationMs: CHUNK_DURATION_MS,
        pcm
      },
      [pcm.buffer]
    )

    totalDurationMs = durationMs
    hasAudioData = true
    notice.log(`[频谱] 音频总时长: ${Math.round(totalDurationMs)}ms, 当前精度档位: ${currentLevel.value}`)
    scheduleRender()
  } catch (error) {
    if (controller.signal.aborted || generation !== dataGeneration) {
      return
    }
    notice.log('[频谱] 音频解码失败，无法显示频谱图', 'warn', error)
    resetSpectrogramData()
  } finally {
    if (loadAbortController === controller) {
      loadAbortController = null
    }
  }
}

function findFallbackBitmap(level: PrecisionLevel, chunkIndex: number): CachedChunkBitmap | undefined {
  for (const fallbackLevel of FALLBACK_LEVEL_ORDER[level]) {
    const candidate = bitmapCache.get(`${fallbackLevel}_${chunkIndex}`)
    if (candidate?.source) {
      return candidate
    }
  }
  return undefined
}

function renderSpectrogram() {
  const canvas = spectrogramCanvasRef.value
  if (!canvas) {
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const renderScale = props.scale
  const width = canvasWidth.value
  if (
    !store.showSpectrogram ||
    !hasAudioData ||
    totalDurationMs <= 0 ||
    width <= 0 ||
    !Number.isFinite(renderScale) ||
    renderScale <= 0
  ) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    pendingQueue = []
    return
  }

  const viewStartMs = Math.max(0, Number.isFinite(props.offset) ? props.offset : 0)
  const viewEndMs = Math.min(totalDurationMs, viewStartMs + width / renderScale)

  if (viewStartMs >= totalDurationMs || viewEndMs <= viewStartMs) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    pendingQueue = []
    return
  }

  const level = currentLevel.value
  const startChunkIdx = Math.floor(viewStartMs / CHUNK_DURATION_MS)
  const endChunkIdx = Math.floor(Math.max(viewStartMs, viewEndMs - 0.001) / CHUNK_DURATION_MS)
  lastVisibleChunkCount = Math.max(1, endChunkIdx - startChunkIdx + 1)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'medium'
  }

  const nextPending: PendingChunkTask[] = []

  for (let chunkIndex = startChunkIdx; chunkIndex <= endChunkIdx; chunkIndex++) {
    const chunkStartMs = chunkIndex * CHUNK_DURATION_MS
    const chunkEndMs = Math.min(totalDurationMs, chunkStartMs + CHUNK_DURATION_MS)
    const chunkDurationMs = chunkEndMs - chunkStartMs
    if (chunkDurationMs <= 0) {
      continue
    }

    const key = `${level}_${chunkIndex}`
    const exactEntry = getCachedBitmap(key)
    let entryToDraw = exactEntry

    if (!exactEntry) {
      if (!inFlightByKey.has(key)) {
        nextPending.push({ key, level, chunkIndex })
      }
      entryToDraw = findFallbackBitmap(level, chunkIndex)
    }

    if (!entryToDraw?.source || entryToDraw.width <= 0 || entryToDraw.height <= 0) {
      continue
    }

    const visStartMs = Math.max(chunkStartMs, viewStartMs)
    const visEndMs = Math.min(chunkEndMs, viewEndMs)
    if (visEndMs <= visStartMs) {
      continue
    }

    const sx = ((visStartMs - chunkStartMs) / chunkDurationMs) * entryToDraw.width
    const sw = ((visEndMs - visStartMs) / chunkDurationMs) * entryToDraw.width
    if (sw <= 0) {
      continue
    }

    const dx0 = Math.round((visStartMs - viewStartMs) * renderScale)
    const dx1 = Math.round((visEndMs - viewStartMs) * renderScale)
    const dw = dx1 - dx0
    if (dw <= 0) {
      continue
    }

    ctx.drawImage(entryToDraw.source, sx, 0, sw, entryToDraw.height, dx0, 0, dw, canvas.height)
  }

  pendingQueue = nextPending
  pumpWorkerQueue()
}

function scheduleRender() {
  if (renderRafId !== null) {
    return
  }
  renderRafId = requestAnimationFrame(() => {
    renderRafId = null
    renderSpectrogram()
  })
}

function onColorConfigChange() {
  const nextConfig = resolveColorConfig()
  if (nextConfig.colorKey === activeColorConfig.colorKey) {
    return
  }
  activeColorConfig = nextConfig
  clearBitmapCache()
  inFlightByKey.clear()
  pendingQueue = []
  if (store.showSpectrogram && hasAudioData) {
    scheduleRender()
  }
}

watch(
  [() => props.scale, () => props.offset],
  () => {
    if (store.showSpectrogram && hasAudioData) {
      scheduleRender()
    }
  }
)

watch(
  canvasWidth,
  () => {
    if (store.showSpectrogram && hasAudioData) {
      scheduleRender()
    }
  },
  { flush: 'post' }
)

watch(
  () => store.showSpectrogram,
  (show) => {
    if (show) {
      void initSpectrogram()
    } else {
      abortAudioLoad()
      resetSpectrogramData({ terminate: true })
    }
  }
)

watch(
  () => store.mediaUrl,
  () => {
    if (store.showSpectrogram) {
      void initSpectrogram()
    } else {
      abortAudioLoad()
      resetSpectrogramData({ terminate: true })
    }
  }
)

watch(
  [() => store.spectrogramColorScheme, () => store.spectrogramCustomColor],
  () => {
    onColorConfigChange()
  }
)

onMounted(() => {
  if (store.showSpectrogram && store.mediaUrl) {
    void initSpectrogram()
  }
})

onUnmounted(() => {
  abortAudioLoad()
  resetSpectrogramData({ terminate: true })
})
</script>

<style scoped>
.spectrogram {
  position: absolute;
  width: 100%;
  height: calc(100% - 20px);
  pointer-events: none;
  margin-top: 20px;
  z-index: 1;
}
</style>
