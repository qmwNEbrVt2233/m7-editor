export type PrecisionLevel = 'low' | 'medium' | 'high' | 'ultra'

export type PrecisionConfig = {
  fftSamples: number
  noverlap: number
}

export type SpectrogramWorkerRequest =
  | {
      type: 'set-audio'
      generation: number
      sampleRate: number
      durationMs: number
      chunkDurationMs: number
      pcm: Float32Array
    }
  | {
      type: 'clear-audio'
      generation: number
    }
  | {
      type: 'render-chunk'
      requestId: number
      generation: number
      level: PrecisionLevel
      chunkIndex: number
      colorScheme: 'default' | 'customize'
      customColorRgb: [number, number, number] | null
      colorKey: string
      targetHeight: number
    }

export type SpectrogramWorkerResponse =
  | {
      type: 'chunk-result'
      requestId: number
      generation: number
      level: PrecisionLevel
      chunkIndex: number
      colorKey: string
      empty: true
    }
  | {
      type: 'chunk-result'
      requestId: number
      generation: number
      level: PrecisionLevel
      chunkIndex: number
      colorKey: string
      empty: false
      startMs: number
      endMs: number
      width: number
      height: number
      bitmap?: ImageBitmap
      pixels?: ArrayBuffer
    }
  | {
      type: 'chunk-error'
      requestId: number
      generation: number
      level: PrecisionLevel
      chunkIndex: number
      message: string
    }

type CachedFrequencyChunk = {
  magnitudes: Uint8Array
  frameCount: number
  binCount: number
  startMs: number
  endMs: number
}

type FftPlan = {
  fftSize: number
  sinTable: Float32Array
  cosTable: Float32Array
  windowValues: Float32Array
  reverseTable: Uint32Array
  real: Float32Array
  imag: Float32Array
  spectrum: Float32Array
}

type SparseErbFilter = {
  binIndex: Int32Array
  weight0: Float32Array
  weight1: Float32Array
}

type RowBinMapping = {
  starts: Int32Array
  ends: Int32Array
}

const PRECISION_CONFIG: Record<PrecisionLevel, PrecisionConfig> = {
  low: { fftSamples: 2048, noverlap: 1 },
  medium: { fftSamples: 1024, noverlap: 1 },
  high: { fftSamples: 512, noverlap: 256 },
  ultra: { fftSamples: 256, noverlap: 128 }
}

const GAIN_DB = 5
const RANGE_DB = 80
const MIN_DB = -(GAIN_DB + RANGE_DB)
const MAX_DB = -GAIN_DB
const DB_TO_BYTE_SCALE = 255 / RANGE_DB
const ERB_FACTOR = (1000 * Math.log(10)) / 107.939
const MAX_FREQUENCY_CHUNKS_PER_LEVEL = 64

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04

const workerScope = self as unknown as Worker

let currentGeneration = 0
let audioPcm: Float32Array | null = null
let audioSampleRate = 0
let audioDurationMs = 0
let audioChunkDurationMs = 10000

const fftPlanCache = new Map<number, FftPlan>()
const erbFilterCache = new Map<string, SparseErbFilter>()
const rowMappingCache = new Map<string, RowBinMapping>()

let cachedLutKey = ''
let cachedColorLut = new Uint32Array(256)

const frequencyCache: Record<PrecisionLevel, Map<number, CachedFrequencyChunk>> = {
  low: new Map(),
  medium: new Map(),
  high: new Map(),
  ultra: new Map()
}

function clearFrequencyCache() {
  frequencyCache.low.clear()
  frequencyCache.medium.clear()
  frequencyCache.high.clear()
  frequencyCache.ultra.clear()
}

function getLruValue<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) {
    return undefined
  }
  const value = map.get(key)!
  map.delete(key)
  map.set(key, value)
  return value
}

function setLruValue<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number) {
  if (map.has(key)) {
    map.delete(key)
  }
  map.set(key, value)
  while (map.size > maxSize) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
}

function hzToErb(hz: number): number {
  return ERB_FACTOR * Math.log10(1 + 0.00437 * hz)
}

function erbToHz(erb: number): number {
  return (Math.pow(10, erb / ERB_FACTOR) - 1) / 0.00437
}

function getFftPlan(fftSize: number): FftPlan {
  const existing = fftPlanCache.get(fftSize)
  if (existing) {
    return existing
  }

  const sinTable = new Float32Array(fftSize)
  const cosTable = new Float32Array(fftSize)
  const windowValues = new Float32Array(fftSize)
  const reverseTable = new Uint32Array(fftSize)

  // Hann window (与 wavesurfer.js 一致)
  const invDenom = 1 / (fftSize - 1)
  for (let i = 0; i < fftSize; i++) {
    windowValues[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i * invDenom))
  }

  // Bit-reversal table
  let limit = 1
  let bit = fftSize >> 1
  while (limit < fftSize) {
    for (let i = 0; i < limit; i++) {
      reverseTable[i + limit] = reverseTable[i] + bit
    }
    limit <<= 1
    bit >>= 1
  }

  sinTable[0] = 0
  cosTable[0] = 1
  for (let i = 1; i < fftSize; i++) {
    sinTable[i] = Math.sin(-Math.PI / i)
    cosTable[i] = Math.cos(-Math.PI / i)
  }

  const plan: FftPlan = {
    fftSize,
    sinTable,
    cosTable,
    windowValues,
    reverseTable,
    real: new Float32Array(fftSize),
    imag: new Float32Array(fftSize),
    spectrum: new Float32Array(fftSize >> 1)
  }
  fftPlanCache.set(fftSize, plan)
  return plan
}

function getSparseErbFilter(fftSize: number, sampleRate: number): SparseErbFilter {
  const cacheKey = `${fftSize}_${sampleRate}`
  const existing = erbFilterCache.get(cacheKey)
  if (existing) {
    return existing
  }

  const numFilters = fftSize >> 1
  const binHz = sampleRate / fftSize
  const erbMin = hzToErb(0)
  const erbMax = hzToErb(sampleRate / 2)
  const erbSpan = erbMax - erbMin

  const binIndex = new Int32Array(numFilters)
  const weight0 = new Float32Array(numFilters)
  const weight1 = new Float32Array(numFilters)

  for (let b = 0; b < numFilters; b++) {
    const hz = erbToHz(erbMin + (b / numFilters) * erbSpan)
    const idx = Math.floor(hz / binHz)
    const lowerHz = idx * binHz
    const w = (hz - lowerHz) / binHz
    binIndex[b] = idx
    weight0[b] = idx >= 0 && idx < numFilters ? 1 - w : 0
    weight1[b] = idx + 1 >= 0 && idx + 1 < numFilters ? w : 0
  }

  const filter: SparseErbFilter = { binIndex, weight0, weight1 }
  erbFilterCache.set(cacheKey, filter)
  return filter
}

function getRowBinMapping(binCount: number, outHeight: number): RowBinMapping {
  const key = `${binCount}_${outHeight}`
  const existing = rowMappingCache.get(key)
  if (existing) {
    return existing
  }

  const starts = new Int32Array(outHeight)
  const ends = new Int32Array(outHeight)
  for (let row = 0; row < outHeight; row++) {
    const yFromBottom = outHeight - 1 - row
    const bStart = Math.floor((yFromBottom * binCount) / outHeight)
    const bEnd = Math.max(
      bStart + 1,
      Math.min(binCount, Math.floor(((yFromBottom + 1) * binCount) / outHeight))
    )
    starts[row] = bStart
    ends[row] = bEnd
  }

  const mapping: RowBinMapping = { starts, ends }
  rowMappingCache.set(key, mapping)
  return mapping
}

function packRgba(r: number, g: number, b: number, a: number): number {
  if (IS_LITTLE_ENDIAN) {
    return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0
  }
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0
}

function computeHeatmapRgba(magnitude: number): number {
  const ratio = magnitude / 255
  let r: number
  let g: number
  let b: number

  if (ratio < 0.25) {
    const t = ratio / 0.25
    r = 0
    g = Math.round(127 * t)
    b = 255
  } else if (ratio < 0.45) {
    const t = (ratio - 0.25) / 0.2
    r = 0
    g = Math.round(127 + 128 * t)
    b = Math.round(255 * (1 - t))
  } else if (ratio < 0.65) {
    const t = (ratio - 0.45) / 0.2
    r = Math.round(255 * t)
    g = 255
    b = 0
  } else if (ratio < 0.85) {
    const t = (ratio - 0.65) / 0.2
    r = 255
    g = Math.round(255 * (1 - t * 0.5))
    b = 0
  } else {
    const t = (ratio - 0.85) / 0.15
    r = 255
    g = Math.round(128 * (1 - t))
    b = 0
  }

  return packRgba(r, g, b, 255)
}

function getColorLut(
  colorKey: string,
  colorScheme: 'default' | 'customize',
  customColorRgb: [number, number, number] | null
): Uint32Array {
  if (colorKey === cachedLutKey) {
    return cachedColorLut
  }

  const lut = new Uint32Array(256)
  if (colorScheme === 'customize' && customColorRgb) {
    const [r, g, b] = customColorRgb
    lut[0] = 0
    for (let mag = 1; mag < 256; mag++) {
      lut[mag] = packRgba(r, g, b, mag)
    }
  } else {
    for (let mag = 0; mag < 256; mag++) {
      lut[mag] = computeHeatmapRgba(mag)
    }
  }

  cachedLutKey = colorKey
  cachedColorLut = lut
  return lut
}

function computeHopSize(fftSize: number, noverlap: number): number {
  const effectiveOverlap = Math.min(noverlap || Math.max(0, Math.round(0.5 * fftSize)), 0.5 * fftSize)
  const minStep = Math.max(64, 0.25 * fftSize)
  return Math.max(minStep, fftSize - effectiveOverlap)
}

function getOrComputeFrequencyChunk(
  level: PrecisionLevel,
  chunkIndex: number
): CachedFrequencyChunk | null {
  if (!audioPcm || audioSampleRate <= 0 || audioDurationMs <= 0) {
    return null
  }

  const cache = frequencyCache[level]
  const cached = getLruValue(cache, chunkIndex)
  if (cached) {
    return cached
  }

  const startMs = chunkIndex * audioChunkDurationMs
  const endMs = Math.min(audioDurationMs, startMs + audioChunkDurationMs)
  if (endMs <= startMs) {
    return null
  }

  const pcm = audioPcm
  const pcmLen = pcm.length
  const startSample = Math.max(0, Math.floor((startMs / 1000) * audioSampleRate))
  const endSample = Math.min(pcmLen, Math.ceil((endMs / 1000) * audioSampleRate))
  if (endSample <= startSample) {
    return null
  }

  const { fftSamples: fftSize, noverlap } = PRECISION_CONFIG[level]
  const hopSize = computeHopSize(fftSize, noverlap)
  const binCount = fftSize >> 1
  const frameCount = Math.max(1, Math.ceil((endSample - startSample) / hopSize))

  const plan = getFftPlan(fftSize)
  const erb = getSparseErbFilter(fftSize, audioSampleRate)
  const { sinTable, cosTable, windowValues, reverseTable, real, imag, spectrum } = plan
  const { binIndex, weight0, weight1 } = erb

  const magnitudes = new Uint8Array(frameCount * binCount)
  const magScale = 2 / fftSize

  let frameIndex = 0
  for (let pos = startSample; pos < endSample && frameIndex < frameCount; pos += hopSize) {
    if (pos + fftSize <= pcmLen) {
      for (let i = 0; i < fftSize; i++) {
        const r = reverseTable[i]
        real[i] = pcm[pos + r] * windowValues[r]
        imag[i] = 0
      }
    } else {
      for (let i = 0; i < fftSize; i++) {
        const r = reverseTable[i]
        const sampleIdx = pos + r
        real[i] = sampleIdx < pcmLen ? pcm[sampleIdx] * windowValues[r] : 0
        imag[i] = 0
      }
    }

    // In-place radix-2 Cooley-Tukey FFT
    for (let halfSize = 1; halfSize < fftSize; halfSize <<= 1) {
      const cosStep = cosTable[halfSize]
      const sinStep = sinTable[halfSize]
      let currentCos = 1
      let currentSin = 0
      const step = halfSize << 1

      for (let j = 0; j < halfSize; j++) {
        for (let i = j; i < fftSize; i += step) {
          const k = i + halfSize
          const tr = currentCos * real[k] - currentSin * imag[k]
          const ti = currentCos * imag[k] + currentSin * real[k]
          real[k] = real[i] - tr
          imag[k] = imag[i] - ti
          real[i] += tr
          imag[i] += ti
        }
        const prevCos = currentCos
        currentCos = prevCos * cosStep - currentSin * sinStep
        currentSin = prevCos * sinStep + currentSin * cosStep
      }
    }

    for (let i = 0; i < binCount; i++) {
      const re = real[i]
      const im = imag[i]
      spectrum[i] = magScale * Math.sqrt(re * re + im * im)
    }

    const outBase = frameIndex * binCount
    for (let b = 0; b < binCount; b++) {
      const idx = binIndex[b]
      const w0 = weight0[b]
      const w1 = weight1[b]
      let val = 0
      if (w0 !== 0) {
        val += spectrum[idx] * w0
      }
      if (w1 !== 0) {
        val += spectrum[idx + 1] * w1
      }
      const clamped = val > 1e-12 ? val : 1e-12
      const db = 20 * Math.log10(clamped)
      magnitudes[outBase + b] =
        db <= MIN_DB ? 0 : db >= MAX_DB ? 255 : Math.round((db - MIN_DB) * DB_TO_BYTE_SCALE)
    }

    frameIndex++
  }

  const chunk: CachedFrequencyChunk = {
    magnitudes,
    frameCount: frameIndex,
    binCount,
    startMs,
    endMs
  }
  setLruValue(cache, chunkIndex, chunk, MAX_FREQUENCY_CHUNKS_PER_LEVEL)
  return chunk
}

function renderChunkPixels(
  chunk: CachedFrequencyChunk,
  colorLut: Uint32Array,
  targetHeight: number
): { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const width = chunk.frameCount
  const binCount = chunk.binCount
  const height = Math.min(binCount, Math.max(1, Math.round(targetHeight)))
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))
  const rgba32 = new Uint32Array(rgba.buffer)
  const magnitudes = chunk.magnitudes

  if (binCount <= height) {
    for (let x = 0; x < width; x++) {
      const frameBase = x * binCount
      for (let b = 0; b < binCount; b++) {
        const row = binCount - 1 - b
        rgba32[row * width + x] = colorLut[magnitudes[frameBase + b]]
      }
    }
  } else {
    const { starts, ends } = getRowBinMapping(binCount, height)
    for (let x = 0; x < width; x++) {
      const frameBase = x * binCount
      for (let row = 0; row < height; row++) {
        const bStart = starts[row]
        const bEnd = ends[row]
        let sum = 0
        for (let b = bStart; b < bEnd; b++) {
          sum += magnitudes[frameBase + b]
        }
        const avg = Math.round(sum / (bEnd - bStart))
        rgba32[row * width + x] = colorLut[avg]
      }
    }
  }

  return { rgba, width, height }
}

async function handleRenderChunk(message: Extract<SpectrogramWorkerRequest, { type: 'render-chunk' }>) {
  const { requestId, generation, level, chunkIndex, colorScheme, customColorRgb, colorKey, targetHeight } = message

  if (generation !== currentGeneration || !audioPcm || audioDurationMs <= 0 || audioSampleRate <= 0) {
    const emptyResponse: SpectrogramWorkerResponse = {
      type: 'chunk-result',
      requestId,
      generation,
      level,
      chunkIndex,
      colorKey,
      empty: true
    }
    workerScope.postMessage(emptyResponse)
    return
  }

  try {
    const chunk = getOrComputeFrequencyChunk(level, chunkIndex)
    if (!chunk || chunk.frameCount <= 0) {
      const emptyResponse: SpectrogramWorkerResponse = {
        type: 'chunk-result',
        requestId,
        generation,
        level,
        chunkIndex,
        colorKey,
        empty: true
      }
      workerScope.postMessage(emptyResponse)
      return
    }

    const colorLut = getColorLut(colorKey, colorScheme, customColorRgb)
    const { rgba, width, height } = renderChunkPixels(chunk, colorLut, targetHeight)

    if (typeof createImageBitmap === 'function' && typeof ImageData === 'function') {
      try {
        const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer), width, height)
        const bitmap = await createImageBitmap(imageData)

        if (generation !== currentGeneration) {
          bitmap.close()
          const emptyResponse: SpectrogramWorkerResponse = {
            type: 'chunk-result',
            requestId,
            generation,
            level,
            chunkIndex,
            colorKey,
            empty: true
          }
          workerScope.postMessage(emptyResponse)
          return
        }

        const response: SpectrogramWorkerResponse = {
          type: 'chunk-result',
          requestId,
          generation,
          level,
          chunkIndex,
          colorKey,
          empty: false,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          width,
          height,
          bitmap
        }
        workerScope.postMessage(response, [bitmap])
        return
      } catch {
        // Fallback to transferring raw RGBA pixels if createImageBitmap fails in worker
      }
    }

    const response: SpectrogramWorkerResponse = {
      type: 'chunk-result',
      requestId,
      generation,
      level,
      chunkIndex,
      colorKey,
      empty: false,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      width,
      height,
      pixels: rgba.buffer
    }
    workerScope.postMessage(response, [rgba.buffer])
  } catch (error) {
    const errorResponse: SpectrogramWorkerResponse = {
      type: 'chunk-error',
      requestId,
      generation,
      level,
      chunkIndex,
      message: error instanceof Error ? error.message : String(error)
    }
    workerScope.postMessage(errorResponse)
  }
}

workerScope.onmessage = (event: MessageEvent<SpectrogramWorkerRequest>) => {
  const message = event.data
  if (!message) {
    return
  }

  if (message.type === 'set-audio') {
    currentGeneration = message.generation
    audioPcm = message.pcm
    audioSampleRate = message.sampleRate
    audioDurationMs = message.durationMs
    audioChunkDurationMs = message.chunkDurationMs > 0 ? message.chunkDurationMs : 10000
    clearFrequencyCache()
    return
  }

  if (message.type === 'clear-audio') {
    currentGeneration = message.generation
    audioPcm = null
    audioSampleRate = 0
    audioDurationMs = 0
    clearFrequencyCache()
    return
  }

  if (message.type === 'render-chunk') {
    void handleRenderChunk(message)
  }
}
