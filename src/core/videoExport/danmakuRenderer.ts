import type { DanmakuItem } from '../danmaku'

/**
 * Unwraps reactive Proxy objects into plain POJO DanmakuItem snapshots
 * suitable for structured-clone worker messaging and export isolation.
 */
export function clonePlainDanmakus(danmakus: readonly DanmakuItem[]): DanmakuItem[] {
  const result: DanmakuItem[] = new Array(danmakus.length)
  for (let i = 0; i < danmakus.length; i += 1) {
    const d = danmakus[i]
    result[i] = {
      id: String(d.id ?? ''),
      layer: Number(d.layer) || 0,
      startTime: Number(d.startTime) || 0,
      content: {
        text: String(d.content?.text ?? ''),
        font: String(d.content?.font ?? ''),
        size: Number(d.content?.size ?? 24),
        color: String(d.content?.color ?? '#ffffff'),
        stroke: Boolean(d.content?.stroke),
      },
      transform: {
        start: {
          x: Number(d.transform?.start?.x) || 0,
          y: Number(d.transform?.start?.y) || 0,
        },
        end: {
          x: Number(d.transform?.end?.x) || 0,
          y: Number(d.transform?.end?.y) || 0,
        },
        zRotate: Number(d.transform?.zRotate) || 0,
        yRotate: Number(d.transform?.yRotate) || 0,
      },
      opacity: {
        from: Number(d.opacity?.from ?? 1),
        to: Number(d.opacity?.to ?? 1),
      },
      animation: {
        duration: Number(d.animation?.duration) || 0,
        moveDuration: Number(d.animation?.moveDuration) || 0,
        delay: Number(d.animation?.delay) || 0,
        easing: d.animation?.easing === 'speedup' ? 'speedup' : 'speeddown',
      },
    }
  }
  return result
}

export type IndexedDanmaku = {
  item: DanmakuItem
  startTime: number
  endTime: number
  duration: number
  moveDuration: number
  delay: number
  easing: 'speedup' | 'speeddown'
  startX: number
  startY: number
  endX: number
  endY: number
  zRotateRad: number
  yRotateRad: number
  opacityFrom: number
  opacityTo: number
  spriteKey: string
  colorRgb: readonly [number, number, number]
  spriteSpec: DanmakuSpriteSpec
}

export type DanmakuSpriteSpec = {
  text: string
  font: string
  size: number
  color: string
  stroke: boolean
}

export type DanmakuSpriteFormat = 'r8' | 'rgba8'

export type DanmakuSpriteBitmap = {
  key: string
  format: DanmakuSpriteFormat
  pixelWidth: number
  pixelHeight: number
  /** Top-left X offset relative to CSS transform-origin (0, 0), in logical screen coordinates */
  offsetX: number
  /** Top-left Y offset relative to CSS transform-origin (0, 0), in logical screen coordinates */
  offsetY: number
  /** Quad width in logical screen coordinates */
  logicalWidth: number
  /** Quad height in logical screen coordinates */
  logicalHeight: number
  /** Single-channel alpha (`r8`: w * h) or straight RGBA (`rgba8`: w * h * 4) for WebGL texImage2D */
  data: Uint8Array
}

export type ActiveDanmakuDrawState = {
  entry: IndexedDanmaku
  x: number
  y: number
  opacity: number
}

export type VideoQuadOrientation = {
  displayWidth: number
  displayHeight: number
  rotation: 0 | 90 | 180 | 270
  flip: boolean
}

const SHADOW_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
])

const FONT_FAMILY_CACHE = new Map<string, string>()
const MAX_FONT_FAMILY_CACHE = 256

export function formatFontFamilyForCanvas(font: string): string {
  const raw = String(font || '').replace(/[\r\n\0;{}]/g, ' ').trim()
  if (!raw) {
    return 'Arial, Helvetica, sans-serif'
  }
  const cached = FONT_FAMILY_CACHE.get(raw)
  if (cached) {
    return cached
  }
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (
        (part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'")) ||
        GENERIC_FONT_FAMILIES.has(part.toLowerCase())
      ) {
        return part
      }
      if (/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(part)) {
        return part
      }
      return `'${part.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    })
  const formatted = parts.length === 0
    ? 'Arial, Helvetica, sans-serif'
    : `${parts.join(', ')}, Arial, Helvetica, sans-serif`
  if (FONT_FAMILY_CACHE.size >= MAX_FONT_FAMILY_CACHE) {
    const oldestKey = FONT_FAMILY_CACHE.keys().next().value
    if (oldestKey !== undefined) {
      FONT_FAMILY_CACHE.delete(oldestKey)
    }
  }
  FONT_FAMILY_CACHE.set(raw, formatted)
  return formatted
}

const MAX_SPRITE_PIXELS = 4_194_304

const COLOR_GLYPH_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u20E3\u{1F1E6}-\u{1F1FF}]/u

const NAMED_COLORS_RGB: Readonly<Record<string, readonly [number, number, number]>> = {
  white: [1, 1, 1],
  black: [0, 0, 0],
  red: [1, 0, 0],
  lime: [0, 1, 0],
  blue: [0, 0, 1],
  yellow: [1, 1, 0],
  cyan: [0, 1, 1],
  aqua: [0, 1, 1],
  magenta: [1, 0, 1],
  fuchsia: [1, 0, 1],
}

export function parseDanmakuColorRgb(color: string): readonly [number, number, number] | null {
  const normalized = String(color || '#ffffff').trim().toLowerCase()
  if (!normalized) {
    return [1, 1, 1]
  }
  const named = NAMED_COLORS_RGB[normalized]
  if (named) {
    return named
  }
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (/^[0-9a-f]{3}$/.test(hex) || /^[0-9a-f]{4}$/.test(hex)) {
      if (hex.length === 4 && hex[3] !== 'f') {
        return null
      }
      return [
        (parseInt(hex[0], 16) * 17) / 255,
        (parseInt(hex[1], 16) * 17) / 255,
        (parseInt(hex[2], 16) * 17) / 255,
      ]
    }
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
      if (hex.length === 8 && hex.slice(6, 8) !== 'ff') {
        return null
      }
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ]
    }
    return null
  }
  const rgbMatch = /^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/.exec(
    normalized
  )
  if (rgbMatch) {
    if (rgbMatch[4] !== undefined && Number(rgbMatch[4]) < 0.999) {
      return null
    }
    const clampByte = (value: number) => Math.max(0, Math.min(255, value)) / 255
    return [
      clampByte(Number(rgbMatch[1])),
      clampByte(Number(rgbMatch[2])),
      clampByte(Number(rgbMatch[3])),
    ]
  }
  return null
}

/**
 * Unstroked non-emoji text with a simple solid fill color shares one monochrome R8
 * alpha mask across all color variants and tints via a fragment shader uniform.
 */
export function isDanmakuMaskEligible(spec: DanmakuSpriteSpec): boolean {
  if (spec.stroke || COLOR_GLYPH_RE.test(spec.text)) {
    return false
  }
  return parseDanmakuColorRgb(spec.color) !== null
}

export function buildDanmakuSpriteKey(spec: DanmakuSpriteSpec): string {
  if (isDanmakuMaskEligible(spec)) {
    return `m\u0000${spec.size}\u0000${spec.font}\u0000${spec.text}`
  }
  return `c\u0000${spec.size}\u0000${spec.stroke ? '1' : '0'}\u0000${spec.color}\u0000${spec.font}\u0000${spec.text}`
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function applyDanmakuEasing(progress: number, easing: 'speedup' | 'speeddown'): number {
  if (easing === 'speedup') {
    return progress * progress
  }
  const inv = 1 - progress
  return 1 - inv * inv
}

const TIMELINE_BLOCK_SIZE = 64

/**
 * Maintains danmakus in exact DanmakuLayer render order (`startTime` asc, `layer` asc)
 * and evaluates active items at monotonic or arbitrary timestamps in O(active).
 */
export class DanmakuTimelineIndex {
  readonly entries: IndexedDanmaku[]
  readonly maxSpriteBatchNeeded: number

  private readonly blockMaxEndTimes: Float64Array
  private active: IndexedDanmaku[] = []
  private nextInsertIdx = 0
  private lastQueryTime = -Infinity

  constructor(danmakus: DanmakuItem[]) {
    const mapped = danmakus.map((item) => {
      const startTime = finiteOr(item.startTime, 0)
      const layer = finiteOr(item.layer, 0)
      const duration = Math.max(0, finiteOr(item.animation?.duration, 0))
      const moveDuration = finiteOr(item.animation?.moveDuration, 0)
      const delay = finiteOr(item.animation?.delay, 0)
      const easing: 'speedup' | 'speeddown' =
        item.animation?.easing === 'speedup' ? 'speedup' : 'speeddown'
      const rawSize = Number(item.content?.size)
      const size = Number.isFinite(rawSize) ? rawSize : 24
      const spec: DanmakuSpriteSpec = {
        text: typeof item.content?.text === 'string' ? item.content.text : '',
        font: typeof item.content?.font === 'string' ? item.content.font : '',
        size,
        color: typeof item.content?.color === 'string' && item.content.color ? item.content.color : '#ffffff',
        stroke: Boolean(item.content?.stroke),
      }
      const yRotate = finiteOr(item.transform?.yRotate, 0)
      const yRotateDeg = yRotate === 0 ? 0 : 360 - yRotate
      const zRotateDeg = finiteOr(item.transform?.zRotate, 0)
      return {
        layer,
        indexed: {
          item,
          startTime,
          endTime: startTime + duration,
          duration,
          moveDuration,
          delay,
          easing,
          startX: finiteOr(item.transform?.start?.x, 0),
          startY: finiteOr(item.transform?.start?.y, 0),
          endX: finiteOr(item.transform?.end?.x, 0),
          endY: finiteOr(item.transform?.end?.y, 0),
          zRotateRad: (zRotateDeg * Math.PI) / 180,
          yRotateRad: (yRotateDeg * Math.PI) / 180,
          opacityFrom: finiteOr(item.opacity?.from, 1),
          opacityTo: finiteOr(item.opacity?.to, 1),
          spriteKey: buildDanmakuSpriteKey(spec),
          colorRgb: parseDanmakuColorRgb(spec.color) ?? [1, 1, 1],
          spriteSpec: spec,
        } satisfies IndexedDanmaku,
      }
    })
    mapped.sort((a, b) => a.indexed.startTime - b.indexed.startTime || a.layer - b.layer)
    this.entries = mapped.map((entry) => entry.indexed)
    this.maxSpriteBatchNeeded = this.entries.length

    const blockCount = Math.ceil(this.entries.length / TIMELINE_BLOCK_SIZE)
    this.blockMaxEndTimes = new Float64Array(blockCount)
    for (let b = 0; b < blockCount; b += 1) {
      const start = b * TIMELINE_BLOCK_SIZE
      const end = Math.min(this.entries.length, start + TIMELINE_BLOCK_SIZE)
      let maxEnd = -Infinity
      for (let i = start; i < end; i += 1) {
        if (this.entries[i].endTime > maxEnd) {
          maxEnd = this.entries[i].endTime
        }
      }
      this.blockMaxEndTimes[b] = maxEnd
    }
  }

  /**
   * Finds active danmakus at `timeMs` into the caller-provided output array without allocating.
   */
  evaluateAt(timeMs: number, out: ActiveDanmakuDrawState[]): ActiveDanmakuDrawState[] {
    out.length = 0
    if (this.entries.length === 0 || !Number.isFinite(timeMs)) {
      return out
    }

    if (timeMs < this.lastQueryTime) {
      this.active.length = 0
      this.nextInsertIdx = 0
    }
    this.lastQueryTime = timeMs

    // Compact expired entries while preserving exact sorted order
    let write = 0
    for (let i = 0; i < this.active.length; i += 1) {
      const entry = this.active[i]
      if (entry.endTime >= timeMs) {
        this.active[write] = entry
        write += 1
      }
    }
    this.active.length = write

    // Add newly active entries sorted by (startTime asc, layer asc)
    while (this.nextInsertIdx < this.entries.length) {
      const candidate = this.entries[this.nextInsertIdx]
      if (candidate.startTime > timeMs) {
        break
      }
      if (candidate.endTime >= timeMs) {
        this.active.push(candidate)
      }
      this.nextInsertIdx += 1
    }

    for (let i = 0; i < this.active.length; i += 1) {
      const entry = this.active[i]
      const t = timeMs - entry.startTime
      let progress: number
      if (entry.moveDuration <= 0) {
        progress = 1
      } else if (t <= entry.delay) {
        progress = 0
      } else {
        progress = clamp01((t - entry.delay) / entry.moveDuration)
      }
      const eased = applyDanmakuEasing(progress, entry.easing)
      const x = entry.startX + (entry.endX - entry.startX) * eased
      const y = entry.startY + (entry.endY - entry.startY) * eased

      const lifeProgress = entry.duration > 0 ? clamp01(t / entry.duration) : 1
      const opacity = clamp01(entry.opacityFrom + (entry.opacityTo - entry.opacityFrom) * lifeProgress)
      if (opacity <= 0.001 || entry.spriteSpec.size <= 0 || !entry.spriteSpec.text) {
        continue
      }
      out.push({ entry, x, y, opacity })
    }

    return out
  }

  /**
   * Collects unique sprite keys that will become visible in `[startTimeMs, endTimeMs]`
   * in exact appearance order, skipping keys already in `excludeKeys`.
   */
  collectUniqueSpritesInRange(
    startTimeMs: number,
    endTimeMs: number,
    excludeKeys: Set<string>,
    limit = Infinity
  ): Array<{ key: string; spec: DanmakuSpriteSpec }> {
    const result: Array<{ key: string; spec: DanmakuSpriteSpec }> = []
    if (
      this.entries.length === 0 ||
      !Number.isFinite(startTimeMs) ||
      !Number.isFinite(endTimeMs) ||
      endTimeMs < startTimeMs ||
      limit <= 0
    ) {
      return result
    }

    const blockCount = this.blockMaxEndTimes.length
    for (let b = 0; b < blockCount; b += 1) {
      const blockStart = b * TIMELINE_BLOCK_SIZE
      if (this.entries[blockStart].startTime > endTimeMs) {
        break
      }
      if (this.blockMaxEndTimes[b] < startTimeMs) {
        continue
      }
      const blockEnd = Math.min(this.entries.length, blockStart + TIMELINE_BLOCK_SIZE)
      for (let i = blockStart; i < blockEnd; i += 1) {
        const entry = this.entries[i]
        if (entry.startTime > endTimeMs) {
          return result
        }
        if (entry.endTime < startTimeMs || entry.spriteSpec.size <= 0 || !entry.spriteSpec.text) {
          continue
        }
        if (excludeKeys.has(entry.spriteKey)) {
          continue
        }
        excludeKeys.add(entry.spriteKey)
        result.push({ key: entry.spriteKey, spec: entry.spriteSpec })
        if (result.length >= limit) {
          return result
        }
      }
    }
    return result
  }
}

/**
 * Reusable 2D rasterizer that matches DanmakuLayer.vue typography, line-height: 1 metrics,
 * multiline handling, and 8-way 1px #000 text-shadow stroke.
 */
export class DanmakuSpriteRasterizer {
  private readonly maxTextureSize: number
  private spriteCanvas: HTMLCanvasElement
  private spriteCtx: CanvasRenderingContext2D
  private glyphCanvas: HTMLCanvasElement
  private glyphCtx: CanvasRenderingContext2D
  private lastSpriteFont = ''
  private lastGlyphFont = ''

  constructor(maxTextureSize = 4096) {
    this.maxTextureSize = Number.isFinite(maxTextureSize) && maxTextureSize > 0
      ? Math.floor(maxTextureSize)
      : 4096
    this.spriteCanvas = document.createElement('canvas')
    const spriteCtx = this.spriteCanvas.getContext('2d', { willReadFrequently: true })
    if (!spriteCtx) {
      throw new Error('Failed to create 2D context for danmaku sprite rasterization')
    }
    this.spriteCtx = spriteCtx

    this.glyphCanvas = document.createElement('canvas')
    const glyphCtx = this.glyphCanvas.getContext('2d')
    if (!glyphCtx) {
      throw new Error('Failed to create 2D glyph context for danmaku stroke')
    }
    this.glyphCtx = glyphCtx
  }

  private ensureCanvasCapacity(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    neededWidth: number,
    neededHeight: number,
    isGlyphCanvas: boolean
  ): void {
    const curW = canvas.width
    const curH = canvas.height
    const curArea = curW * curH
    const neededArea = neededWidth * neededHeight
    const needsResize =
      neededWidth > curW ||
      neededHeight > curH ||
      (curArea > 512 * 512 && curArea > neededArea * 4)

    if (needsResize) {
      canvas.width = neededWidth
      canvas.height = neededHeight
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      if (isGlyphCanvas) {
        this.lastGlyphFont = ''
      } else {
        this.lastSpriteFont = ''
      }
    } else {
      ctx.clearRect(
        0,
        0,
        Math.min(curW, neededWidth + 2),
        Math.min(curH, neededHeight + 2)
      )
    }
  }

  rasterize(
    key: string,
    spec: DanmakuSpriteSpec,
    projectScale: number
  ): DanmakuSpriteBitmap | null {
    if (
      !spec.text ||
      !Number.isFinite(spec.size) ||
      spec.size <= 0 ||
      !Number.isFinite(projectScale) ||
      projectScale <= 0
    ) {
      return null
    }

    const lines = spec.text.split(/\r?\n/)
    let renderScale = projectScale
    const rawFontPx = spec.size * renderScale
    if (!Number.isFinite(rawFontPx) || rawFontPx <= 0) {
      return null
    }
    const fontFamilyCss = formatFontFamilyForCanvas(spec.font)

    const ctx = this.spriteCtx
    const measureFontCss = `bold ${rawFontPx}px ${fontFamilyCss}`
    if (this.lastSpriteFont !== measureFontCss) {
      ctx.font = measureFontCss
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      this.lastSpriteFont = measureFontCss
    }

    const strut = ctx.measureText('Hg')
    const rawAscent =
      typeof strut.fontBoundingBoxAscent === 'number' && Number.isFinite(strut.fontBoundingBoxAscent)
        ? strut.fontBoundingBoxAscent
        : rawFontPx * 0.85
    const rawDescent =
      typeof strut.fontBoundingBoxDescent === 'number' && Number.isFinite(strut.fontBoundingBoxDescent)
        ? strut.fontBoundingBoxDescent
        : rawFontPx * 0.15

    let minX = 0
    let maxX = 0
    let minY = 0
    let maxY = 0
    let hasVisibleGlyph = false

    const lineBaselines: number[] = new Array(lines.length)
    for (let i = 0; i < lines.length; i += 1) {
      const baseY = i * rawFontPx + (rawFontPx + rawAscent - rawDescent) / 2
      lineBaselines[i] = baseY
      const line = lines[i]
      if (!line) {
        continue
      }
      const m = ctx.measureText(line)
      const left = -(m.actualBoundingBoxLeft ?? 0)
      const right = Math.max(m.width, m.actualBoundingBoxRight ?? m.width)
      const top = baseY - (m.actualBoundingBoxAscent ?? rawAscent)
      const bottom = baseY + (m.actualBoundingBoxDescent ?? rawDescent)
      if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
        continue
      }
      if (!hasVisibleGlyph) {
        minX = left
        maxX = right
        minY = top
        maxY = bottom
        hasVisibleGlyph = true
      } else {
        if (left < minX) minX = left
        if (right > maxX) maxX = right
        if (top < minY) minY = top
        if (bottom > maxY) maxY = bottom
      }
    }

    if (!hasVisibleGlyph || maxX <= minX || maxY <= minY) {
      return null
    }

    const shadowPad = spec.stroke ? Math.ceil(3.5 * renderScale + 2) : 2
    let leftPx = Math.floor(minX) - shadowPad
    let topPx = Math.floor(minY) - shadowPad
    const rightPx = Math.ceil(maxX) + shadowPad
    const bottomPx = Math.ceil(maxY) + shadowPad
    let pixelWidth = rightPx - leftPx
    let pixelHeight = bottomPx - topPx
    if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
      return null
    }

    // Logical bounds must remain strictly in project coordinate space even if clamped to GPU MAX_TEXTURE_SIZE
    const offsetX = leftPx / projectScale
    const offsetY = topPx / projectScale
    const logicalWidth = pixelWidth / projectScale
    const logicalHeight = pixelHeight / projectScale

    const maxDim = Math.max(pixelWidth, pixelHeight)
    const pixelArea = pixelWidth * pixelHeight
    const dimScale = maxDim > this.maxTextureSize ? this.maxTextureSize / maxDim : 1
    const areaScale = pixelArea > MAX_SPRITE_PIXELS ? Math.sqrt(MAX_SPRITE_PIXELS / pixelArea) : 1
    const rasterScaleFactor = Math.min(dimScale, areaScale)
    if (!Number.isFinite(rasterScaleFactor) || rasterScaleFactor <= 0) {
      return null
    }
    if (rasterScaleFactor < 1) {
      pixelWidth = Math.max(1, Math.min(this.maxTextureSize, Math.ceil(pixelWidth * rasterScaleFactor)))
      pixelHeight = Math.max(1, Math.min(this.maxTextureSize, Math.ceil(pixelHeight * rasterScaleFactor)))
      renderScale = projectScale * rasterScaleFactor
      leftPx *= rasterScaleFactor
      topPx *= rasterScaleFactor
      for (let i = 0; i < lineBaselines.length; i += 1) {
        lineBaselines[i] *= rasterScaleFactor
      }
    }

    this.ensureCanvasCapacity(this.spriteCanvas, ctx, pixelWidth, pixelHeight, false)

    const fontCss = `bold ${spec.size * renderScale}px ${fontFamilyCss}`
    if (this.lastSpriteFont !== fontCss) {
      ctx.font = fontCss
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      this.lastSpriteFont = fontCss
    }

    const originX = -leftPx
    const originY = -topPx

    if (spec.stroke) {
      const gCtx = this.glyphCtx
      this.ensureCanvasCapacity(this.glyphCanvas, gCtx, pixelWidth, pixelHeight, true)
      if (this.lastGlyphFont !== fontCss) {
        gCtx.font = fontCss
        gCtx.textBaseline = 'alphabetic'
        gCtx.textAlign = 'left'
        this.lastGlyphFont = fontCss
      }
      gCtx.fillStyle = '#000000'
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]) {
          gCtx.fillText(lines[i], originX, originY + lineBaselines[i])
        }
      }

      ctx.save()
      ctx.shadowColor = '#000000'
      ctx.shadowBlur = 1 * renderScale
      for (let i = 0; i < SHADOW_OFFSETS.length; i += 1) {
        const [ox, oy] = SHADOW_OFFSETS[i]
        ctx.shadowOffsetX = ox * renderScale
        ctx.shadowOffsetY = oy * renderScale
        ctx.drawImage(
          this.glyphCanvas,
          0,
          0,
          pixelWidth,
          pixelHeight,
          0,
          0,
          pixelWidth,
          pixelHeight
        )
      }
      ctx.restore()
    }

    const useMask = isDanmakuMaskEligible(spec)
    ctx.fillStyle = useMask ? '#ffffff' : spec.color || '#ffffff'
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]) {
        ctx.fillText(lines[i], originX, originY + lineBaselines[i])
      }
    }

    const imageData = ctx.getImageData(0, 0, pixelWidth, pixelHeight)
    const rgba = imageData.data
    if (useMask) {
      const pixelCount = pixelWidth * pixelHeight
      const alpha = new Uint8Array(pixelCount)
      let isMonochrome = true
      for (let i = 0, p = 0; i < pixelCount; i += 1, p += 4) {
        const a = rgba[p + 3]
        alpha[i] = a
        if (isMonochrome && a > 8) {
          const r = rgba[p]
          const g = rgba[p + 1]
          const b = rgba[p + 2]
          if (Math.abs(r - g) > 4 || Math.abs(g - b) > 4) {
            isMonochrome = false
          }
        }
      }
      if (isMonochrome) {
        return {
          key,
          format: 'r8',
          pixelWidth,
          pixelHeight,
          offsetX,
          offsetY,
          logicalWidth,
          logicalHeight,
          data: alpha,
        }
      }
    }

    return {
      key,
      format: 'rgba8',
      pixelWidth,
      pixelHeight,
      offsetX,
      offsetY,
      logicalWidth,
      logicalHeight,
      data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    }
  }

  dispose(): void {
    this.spriteCanvas.width = 0
    this.spriteCanvas.height = 0
    this.glyphCanvas.width = 0
    this.glyphCanvas.height = 0
    this.lastSpriteFont = ''
    this.lastGlyphFont = ''
  }
}

type CachedGlSprite = {
  texture: WebGLTexture
  format: DanmakuSpriteFormat
  offsetX: number
  offsetY: number
  logicalWidth: number
  logicalHeight: number
  byteSize: number
}

const VIDEO_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}`

const VIDEO_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(texture(u_tex, v_uv).rgb, 1.0);
}`

const DANMAKU_VERTEX_SHADER = `#version 300 es
in vec2 a_unitPos;

uniform vec4 u_quadRect;
uniform vec2 u_screenSize;
uniform vec2 u_translate;
uniform float u_zRotateRad;
uniform float u_yRotateRad;

out vec2 v_uv;

void main() {
  vec2 localPos = u_quadRect.xy + a_unitPos * u_quadRect.zw;
  // CSS right-to-left transform order: translate3d(x, y, 0) * rotateZ(rz) * rotateY(ry)
  float cosY = cos(u_yRotateRad);
  float sinY = sin(u_yRotateRad);
  float px = localPos.x * cosY;
  float py = localPos.y;
  float pz = -localPos.x * sinY;

  float cosZ = cos(u_zRotateRad);
  float sinZ = sin(u_zRotateRad);
  float rx = px * cosZ - py * sinZ;
  float ry = px * sinZ + py * cosZ;
  float rz = pz;

  float worldX = rx + u_translate.x;
  float worldY = ry + u_translate.y;

  float dx = worldX - u_screenSize.x * 0.5;
  float dy = worldY - u_screenSize.y * 0.5;
  float w = 1.0 - rz / 500.0;

  float clipX = dx / (u_screenSize.x * 0.5);
  float clipY = -dy / (u_screenSize.y * 0.5);
  gl_Position = vec4(clipX, clipY, 0.0, w);
  v_uv = a_unitPos;
}`

const UNIT_QUAD_VERTICES = new Float32Array([
  0, 0,
  0, 1,
  1, 0,
  1, 0,
  0, 1,
  1, 1,
])

const DANMAKU_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform int u_isMask;
uniform vec3 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  if (u_isMask != 0) {
    float a = texture(u_tex, v_uv).r;
    outColor = vec4(u_color * a, a) * u_opacity;
  } else {
    outColor = texture(u_tex, v_uv) * u_opacity;
  }
}`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to create WebGL2 shader')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc)
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    throw new Error('Failed to create WebGL2 program')
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Unknown program link error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

/**
 * WebGL2 GPU compositor for direct video export.
 * Renders background video (with contain-fit + rotation/flip) and CSS-faithful 3D-transformed
 * danmaku text sprites straight to the output canvas without DOM/WebView readback.
 */
export class WebGL2DanmakuCompositor {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  readonly outputWidth: number
  readonly outputHeight: number
  readonly screenWidth: number
  readonly screenHeight: number
  readonly gl: WebGL2RenderingContext
  readonly maxTextureSize: number

  private videoProgram: WebGLProgram
  private videoVao: WebGLVertexArrayObject
  private videoVbo: WebGLBuffer
  private videoTex: WebGLTexture
  private videoTexLoc: WebGLUniformLocation | null
  private videoLastSampleTimestamp: number | null = null
  private lastVideoOrientationKey = ''
  private videoQuadData = new Float32Array(24)

  private danmakuProgram: WebGLProgram
  private danmakuVao: WebGLVertexArrayObject
  private danmakuVbo: WebGLBuffer
  private uQuadRectLoc: WebGLUniformLocation | null
  private uScreenSizeLoc: WebGLUniformLocation | null
  private uTranslateLoc: WebGLUniformLocation | null
  private uZRotateLoc: WebGLUniformLocation | null
  private uYRotateLoc: WebGLUniformLocation | null
  private uDanmakuTexLoc: WebGLUniformLocation | null
  private uOpacityLoc: WebGLUniformLocation | null
  private uIsMaskLoc: WebGLUniformLocation | null
  private uColorLoc: WebGLUniformLocation | null

  private spriteCache = new Map<string, CachedGlSprite>()
  private spriteCacheBytes = 0
  private readonly maxSpriteCacheBytes: number

  private scratchCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private scratchCtx:
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null = null
  private forceScratchCanvasVideoUpload = false

  constructor(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    outputWidth: number,
    outputHeight: number,
    screenWidth: number,
    screenHeight: number,
    maxSpriteCacheBytes = 512 * 1024 * 1024
  ) {
    if (
      !Number.isFinite(outputWidth) ||
      !Number.isFinite(outputHeight) ||
      !Number.isFinite(screenWidth) ||
      !Number.isFinite(screenHeight) ||
      outputWidth <= 0 ||
      outputHeight <= 0 ||
      screenWidth <= 0 ||
      screenHeight <= 0
    ) {
      throw new Error('Invalid WebGL2DanmakuCompositor dimensions')
    }
    this.canvas = canvas
    this.outputWidth = outputWidth
    this.outputHeight = outputHeight
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null
    if (!gl) {
      throw new Error('WebGL2 context unavailable')
    }
    this.gl = gl
    this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096
    this.maxSpriteCacheBytes = maxSpriteCacheBytes

    gl.viewport(0, 0, outputWidth, outputHeight)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.clearColor(0, 0, 0, 1)

    let vProg: WebGLProgram | null = null
    let vVao: WebGLVertexArrayObject | null = null
    let vVbo: WebGLBuffer | null = null
    let vTex: WebGLTexture | null = null
    let dProg: WebGLProgram | null = null
    let dVao: WebGLVertexArrayObject | null = null
    let dVbo: WebGLBuffer | null = null

    try {
      // Video program setup
      vProg = createProgram(gl, VIDEO_VERTEX_SHADER, VIDEO_FRAGMENT_SHADER)
      this.videoProgram = vProg
      this.videoTexLoc = gl.getUniformLocation(this.videoProgram, 'u_tex')

      vVao = gl.createVertexArray()
      vVbo = gl.createBuffer()
      vTex = gl.createTexture()
      if (!vVao || !vVbo || !vTex) {
        throw new Error('Failed to allocate WebGL2 video resources')
      }
      this.videoVao = vVao
      this.videoVbo = vVbo
      this.videoTex = vTex

      gl.bindVertexArray(this.videoVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.videoVbo)
      gl.bufferData(gl.ARRAY_BUFFER, this.videoQuadData.byteLength, gl.DYNAMIC_DRAW)
      const vPosLoc = gl.getAttribLocation(this.videoProgram, 'a_pos')
      const vUvLoc = gl.getAttribLocation(this.videoProgram, 'a_uv')
      gl.enableVertexAttribArray(vPosLoc)
      gl.vertexAttribPointer(vPosLoc, 2, gl.FLOAT, false, 16, 0)
      gl.enableVertexAttribArray(vUvLoc)
      gl.vertexAttribPointer(vUvLoc, 2, gl.FLOAT, false, 16, 8)

      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      // Danmaku program setup
      dProg = createProgram(gl, DANMAKU_VERTEX_SHADER, DANMAKU_FRAGMENT_SHADER)
      this.danmakuProgram = dProg
      this.uQuadRectLoc = gl.getUniformLocation(this.danmakuProgram, 'u_quadRect')
      this.uScreenSizeLoc = gl.getUniformLocation(this.danmakuProgram, 'u_screenSize')
      this.uTranslateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_translate')
      this.uZRotateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_zRotateRad')
      this.uYRotateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_yRotateRad')
      this.uDanmakuTexLoc = gl.getUniformLocation(this.danmakuProgram, 'u_tex')
      this.uOpacityLoc = gl.getUniformLocation(this.danmakuProgram, 'u_opacity')
      this.uIsMaskLoc = gl.getUniformLocation(this.danmakuProgram, 'u_isMask')
      this.uColorLoc = gl.getUniformLocation(this.danmakuProgram, 'u_color')

      dVao = gl.createVertexArray()
      dVbo = gl.createBuffer()
      if (!dVao || !dVbo) {
        throw new Error('Failed to allocate WebGL2 danmaku resources')
      }
      this.danmakuVao = dVao
      this.danmakuVbo = dVbo

      gl.bindVertexArray(this.danmakuVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.danmakuVbo)
      gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD_VERTICES, gl.STATIC_DRAW)
      const dUnitLoc = gl.getAttribLocation(this.danmakuProgram, 'a_unitPos')
      gl.enableVertexAttribArray(dUnitLoc)
      gl.vertexAttribPointer(dUnitLoc, 2, gl.FLOAT, false, 8, 0)

      gl.useProgram(this.danmakuProgram)
      gl.uniform2f(this.uScreenSizeLoc, this.screenWidth, this.screenHeight)
      gl.uniform1i(this.uDanmakuTexLoc, 0)

      gl.useProgram(this.videoProgram)
      gl.uniform1i(this.videoTexLoc, 0)

      gl.bindVertexArray(null)
    } catch (error) {
      if (vTex) gl.deleteTexture(vTex)
      if (vVbo) gl.deleteBuffer(vVbo)
      if (vVao) gl.deleteVertexArray(vVao)
      if (vProg) gl.deleteProgram(vProg)
      if (dVbo) gl.deleteBuffer(dVbo)
      if (dVao) gl.deleteVertexArray(dVao)
      if (dProg) gl.deleteProgram(dProg)
      throw error
    }
  }

  hasSprite(key: string): boolean {
    const entry = this.spriteCache.get(key)
    if (!entry) return false
    // Refresh LRU order
    this.spriteCache.delete(key)
    this.spriteCache.set(key, entry)
    return true
  }

  uploadSprite(sprite: DanmakuSpriteBitmap, protectedKeys?: ReadonlySet<string>): void {
    const existing = this.spriteCache.get(sprite.key)
    if (existing) {
      this.spriteCache.delete(sprite.key)
      this.spriteCache.set(sprite.key, existing)
      return
    }

    if (
      !Number.isInteger(sprite.pixelWidth) ||
      !Number.isInteger(sprite.pixelHeight) ||
      sprite.pixelWidth <= 0 ||
      sprite.pixelHeight <= 0
    ) {
      return
    }
    const byteSize =
      sprite.format === 'r8'
        ? sprite.pixelWidth * sprite.pixelHeight
        : sprite.pixelWidth * sprite.pixelHeight * 4
    if (sprite.data.byteLength < byteSize) {
      return
    }
    if (
      this.spriteCache.size > 0 &&
      this.spriteCacheBytes + byteSize > this.maxSpriteCacheBytes
    ) {
      // Never evict sprites still active in the current frame; otherwise layers flip every frame
      for (const oldestKey of this.spriteCache.keys()) {
        if (this.spriteCacheBytes + byteSize <= this.maxSpriteCacheBytes) {
          break
        }
        if (protectedKeys?.has(oldestKey)) {
          continue
        }
        const oldest = this.spriteCache.get(oldestKey)
        this.spriteCache.delete(oldestKey)
        if (oldest) {
          this.spriteCacheBytes -= oldest.byteSize
          this.gl.deleteTexture(oldest.texture)
        }
      }
    }

    const gl = this.gl
    const texture = gl.createTexture()
    if (!texture) {
      throw new Error('Failed to create WebGL2 texture for danmaku sprite')
    }
    try {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      if (sprite.format === 'r8') {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          sprite.pixelWidth,
          sprite.pixelHeight,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          sprite.data
        )
      } else {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          sprite.pixelWidth,
          sprite.pixelHeight,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          sprite.data
        )
      }
    } catch (error) {
      gl.deleteTexture(texture)
      throw error
    }

    this.spriteCache.set(sprite.key, {
      texture,
      format: sprite.format,
      offsetX: sprite.offsetX,
      offsetY: sprite.offsetY,
      logicalWidth: sprite.logicalWidth,
      logicalHeight: sprite.logicalHeight,
      byteSize,
    })
    this.spriteCacheBytes += byteSize
  }

  private updateVideoQuadGeometry(orientation: VideoQuadOrientation): boolean {
    if (
      !Number.isFinite(orientation.displayWidth) ||
      !Number.isFinite(orientation.displayHeight) ||
      orientation.displayWidth <= 0 ||
      orientation.displayHeight <= 0
    ) {
      return false
    }
    const key = `${orientation.displayWidth}x${orientation.displayHeight}:${orientation.rotation}:${orientation.flip ? 1 : 0}`
    if (key === this.lastVideoOrientationKey) {
      return true
    }
    this.lastVideoOrientationKey = key

    const scale = Math.min(
      this.outputWidth / orientation.displayWidth,
      this.outputHeight / orientation.displayHeight
    )
    const drawW = orientation.displayWidth * scale
    const drawH = orientation.displayHeight * scale
    const x0 = (this.outputWidth - drawW) / 2
    const y0 = (this.outputHeight - drawH) / 2
    const x1 = x0 + drawW
    const y1 = y0 + drawH

    // Convert pixel coordinates to WebGL NDC [-1, +1]
    const ndcLeft = (x0 / this.outputWidth) * 2 - 1
    const ndcRight = (x1 / this.outputWidth) * 2 - 1
    const ndcTop = 1 - (y0 / this.outputHeight) * 2
    const ndcBottom = 1 - (y1 / this.outputHeight) * 2

    // Corners: TL, TR, BR, BL in clockwise orientation
    let tlU = 0, tlV = 0
    let trU = 1, trV = 0
    let brU = 1, brV = 1
    let blU = 0, blV = 1

    if (!this.forceScratchCanvasVideoUpload) {
      if (orientation.rotation === 90) {
        tlU = 0; tlV = 1
        trU = 0; trV = 0
        brU = 1; brV = 0
        blU = 1; blV = 1
      } else if (orientation.rotation === 180) {
        tlU = 1; tlV = 1
        trU = 0; trV = 1
        brU = 0; brV = 0
        blU = 1; blV = 0
      } else if (orientation.rotation === 270) {
        tlU = 1; tlV = 0
        trU = 1; trV = 1
        brU = 0; brV = 1
        blU = 0; blV = 0
      }

      if (orientation.flip) {
        ;[tlU, trU] = [trU, tlU]
        ;[tlV, trV] = [trV, tlV]
        ;[blU, brU] = [brU, blU]
        ;[blV, brV] = [brV, blV]
      }
    }

    const d = this.videoQuadData
    // Tri 1: TL, BL, TR
    d[0] = ndcLeft;  d[1] = ndcTop;    d[2] = tlU; d[3] = tlV
    d[4] = ndcLeft;  d[5] = ndcBottom; d[6] = blU; d[7] = blV
    d[8] = ndcRight; d[9] = ndcTop;    d[10] = trU; d[11] = trV
    // Tri 2: TR, BL, BR
    d[12] = ndcRight; d[13] = ndcTop;    d[14] = trU; d[15] = trV
    d[16] = ndcLeft;  d[17] = ndcBottom; d[18] = blU; d[19] = blV
    d[20] = ndcRight; d[21] = ndcBottom; d[22] = brU; d[23] = brV

    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.videoVbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d)
    return true
  }

  private ensureScratchCanvas(width: number, height: number) {
    const maxDim = Math.max(width, height)
    const scale = maxDim > this.maxTextureSize ? this.maxTextureSize / maxDim : 1
    const safeWidth = Math.max(1, Math.min(this.maxTextureSize, Math.round(width * scale)))
    const safeHeight = Math.max(1, Math.min(this.maxTextureSize, Math.round(height * scale)))

    if (!this.scratchCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.scratchCanvas = new OffscreenCanvas(safeWidth, safeHeight)
      } else {
        const el = document.createElement('canvas')
        el.width = safeWidth
        el.height = safeHeight
        this.scratchCanvas = el
      }
      this.scratchCtx = this.scratchCanvas.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null
    }
    if (this.scratchCanvas.width !== safeWidth || this.scratchCanvas.height !== safeHeight) {
      this.scratchCanvas.width = safeWidth
      this.scratchCanvas.height = safeHeight
    }
    if (!this.scratchCtx) {
      throw new Error('Failed to create 2D scratch canvas for video upload')
    }
    return { canvas: this.scratchCanvas, ctx: this.scratchCtx }
  }

  /**
   * Renders one output frame combining optional background video sample and active danmakus.
   * Video sample texture upload is skipped automatically when the same sample timestamp repeats.
   */
  renderFrame(
    videoSample: {
      timestamp: number
      displayWidth: number
      displayHeight: number
      rotation: 0 | 90 | 180 | 270
      flip: boolean
      toVideoFrame: () => VideoFrame
      draw: (
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        dx: number,
        dy: number,
        dWidth?: number,
        dHeight?: number
      ) => void
    } | null,
    activeDanmakus: ActiveDanmakuDrawState[]
  ): void {
    const gl = this.gl
    gl.disable(gl.BLEND)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (videoSample && videoSample.displayWidth > 0 && videoSample.displayHeight > 0) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)

      if (this.videoLastSampleTimestamp !== videoSample.timestamp) {
        this.videoLastSampleTimestamp = videoSample.timestamp
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)

        let uploaded = false
        if (!this.forceScratchCanvasVideoUpload) {
          let frame: VideoFrame | null = null
          try {
            frame = videoSample.toVideoFrame()
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
            uploaded = true
          } catch {
            // Fallback (e.g. older WebKit lacking VideoFrame texImage2D support)
            this.forceScratchCanvasVideoUpload = true
            this.lastVideoOrientationKey = ''
          } finally {
            frame?.close()
          }
        }

        if (!uploaded) {
          const { canvas, ctx } = this.ensureScratchCanvas(
            videoSample.displayWidth,
            videoSample.displayHeight
          )
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          videoSample.draw(ctx, 0, 0, canvas.width, canvas.height)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
        }
      }

      if (
        this.updateVideoQuadGeometry({
          displayWidth: videoSample.displayWidth,
          displayHeight: videoSample.displayHeight,
          rotation: videoSample.rotation,
          flip: videoSample.flip,
        })
      ) {
        gl.useProgram(this.videoProgram)
        gl.bindVertexArray(this.videoVao)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }

    if (activeDanmakus.length > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(this.danmakuProgram)
      gl.bindVertexArray(this.danmakuVao)
      gl.activeTexture(gl.TEXTURE0)

      let lastQuadOffsetX = NaN
      let lastQuadOffsetY = NaN
      let lastQuadWidth = NaN
      let lastQuadHeight = NaN
      let lastIsMask = -1
      let lastSpriteTex: WebGLTexture | null = null
      for (let i = 0; i < activeDanmakus.length; i += 1) {
        const drawItem = activeDanmakus[i]
        const sprite = this.spriteCache.get(drawItem.entry.spriteKey)
        if (!sprite) {
          continue
        }

        if (
          sprite.offsetX !== lastQuadOffsetX ||
          sprite.offsetY !== lastQuadOffsetY ||
          sprite.logicalWidth !== lastQuadWidth ||
          sprite.logicalHeight !== lastQuadHeight
        ) {
          lastQuadOffsetX = sprite.offsetX
          lastQuadOffsetY = sprite.offsetY
          lastQuadWidth = sprite.logicalWidth
          lastQuadHeight = sprite.logicalHeight
          gl.uniform4f(
            this.uQuadRectLoc,
            sprite.offsetX,
            sprite.offsetY,
            sprite.logicalWidth,
            sprite.logicalHeight
          )
        }

        const isMaskInt = sprite.format === 'r8' ? 1 : 0
        if (isMaskInt !== lastIsMask) {
          lastIsMask = isMaskInt
          gl.uniform1i(this.uIsMaskLoc, isMaskInt)
        }
        if (isMaskInt === 1) {
          const [r, g, b] = drawItem.entry.colorRgb
          gl.uniform3f(this.uColorLoc, r, g, b)
        }

        if (sprite.texture !== lastSpriteTex) {
          lastSpriteTex = sprite.texture
          gl.bindTexture(gl.TEXTURE_2D, sprite.texture)
        }
        gl.uniform2f(this.uTranslateLoc, drawItem.x, drawItem.y)
        gl.uniform1f(this.uZRotateLoc, drawItem.entry.zRotateRad)
        gl.uniform1f(this.uYRotateLoc, drawItem.entry.yRotateRad)
        gl.uniform1f(this.uOpacityLoc, drawItem.opacity)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }
  }

  dispose(): void {
    const gl = this.gl
    for (const sprite of this.spriteCache.values()) {
      gl.deleteTexture(sprite.texture)
    }
    this.spriteCache.clear()
    this.spriteCacheBytes = 0
    if (this.scratchCanvas) {
      this.scratchCanvas.width = 0
      this.scratchCanvas.height = 0
      this.scratchCanvas = null
      this.scratchCtx = null
    }
    gl.deleteTexture(this.videoTex)
    gl.deleteBuffer(this.videoVbo)
    gl.deleteVertexArray(this.videoVao)
    gl.deleteProgram(this.videoProgram)
    gl.deleteBuffer(this.danmakuVbo)
    gl.deleteVertexArray(this.danmakuVao)
    gl.deleteProgram(this.danmakuProgram)
  }
}
