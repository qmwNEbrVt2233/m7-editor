import type { DanmakuItem } from '../danmaku'

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

export function formatFontFamilyForCanvas(font: string): string {
  const raw = String(font || '').trim()
  if (!raw) {
    return 'Arial, Helvetica, sans-serif'
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
  if (parts.length === 0) {
    return 'Arial, Helvetica, sans-serif'
  }
  return `${parts.join(', ')}, Arial, Helvetica, sans-serif`
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

function clamp01(value: number): number {
  if (value <= 0) return 0
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

/**
 * Maintains danmakus in exact DanmakuLayer render order (`startTime` asc, `layer` asc)
 * and evaluates active items at monotonic or arbitrary timestamps in O(active).
 */
export class DanmakuTimelineIndex {
  readonly entries: IndexedDanmaku[]
  readonly maxSpriteBatchNeeded: number

  private active: IndexedDanmaku[] = []
  private nextInsertIdx = 0
  private lastQueryTime = -Infinity

  constructor(danmakus: DanmakuItem[]) {
    const sorted = [...danmakus].sort(
      (a, b) => a.startTime - b.startTime || (a.layer || 0) - (b.layer || 0)
    )
    this.entries = sorted.map((item) => {
      const duration = Math.max(0, Number(item.animation?.duration) || 0)
      const moveDuration = Number(item.animation?.moveDuration) || 0
      const delay = Number(item.animation?.delay) || 0
      const easing = item.animation?.easing === 'speedup' ? 'speedup' : 'speeddown'
      const spec: DanmakuSpriteSpec = {
        text: item.content?.text ?? '',
        font: item.content?.font ?? '',
        size: Number(item.content?.size) || 24,
        color: item.content?.color || '#ffffff',
        stroke: Boolean(item.content?.stroke),
      }
      const yRotate = Number(item.transform?.yRotate) || 0
      const yRotateDeg = yRotate === 0 ? 0 : 360 - yRotate
      const zRotateDeg = Number(item.transform?.zRotate) || 0
      return {
        item,
        startTime: item.startTime,
        endTime: item.startTime + duration,
        duration,
        moveDuration,
        delay,
        easing,
        startX: Number(item.transform?.start?.x) || 0,
        startY: Number(item.transform?.start?.y) || 0,
        endX: Number(item.transform?.end?.x) || 0,
        endY: Number(item.transform?.end?.y) || 0,
        zRotateRad: (zRotateDeg * Math.PI) / 180,
        yRotateRad: (yRotateDeg * Math.PI) / 180,
        opacityFrom: Number(item.opacity?.from ?? 1),
        opacityTo: Number(item.opacity?.to ?? 1),
        spriteKey: buildDanmakuSpriteKey(spec),
        colorRgb: parseDanmakuColorRgb(spec.color) ?? [1, 1, 1],
        spriteSpec: spec,
      }
    })
    this.maxSpriteBatchNeeded = this.entries.length
  }

  /**
   * Finds active danmakus at `timeMs` into the caller-provided output array without allocating.
   */
  evaluateAt(timeMs: number, out: ActiveDanmakuDrawState[]): ActiveDanmakuDrawState[] {
    out.length = 0
    if (this.entries.length === 0) {
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
      if (opacity <= 0.001 || !entry.spriteSpec.text) {
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
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i]
      if (entry.startTime > endTimeMs) {
        break
      }
      if (entry.endTime < startTimeMs || !entry.spriteSpec.text) {
        continue
      }
      if (excludeKeys.has(entry.spriteKey)) {
        continue
      }
      excludeKeys.add(entry.spriteKey)
      result.push({ key: entry.spriteKey, spec: entry.spriteSpec })
      if (result.length >= limit) {
        break
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

  constructor(maxTextureSize = 4096) {
    this.maxTextureSize = maxTextureSize
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

  rasterize(
    key: string,
    spec: DanmakuSpriteSpec,
    projectScale: number
  ): DanmakuSpriteBitmap | null {
    if (!spec.text || spec.size <= 0 || projectScale <= 0) {
      return null
    }

    const lines = spec.text.split(/\r?\n/)
    let renderScale = projectScale
    const rawFontPx = spec.size * renderScale
    const fontFamilyCss = formatFontFamilyForCanvas(spec.font)

    const ctx = this.spriteCtx
    ctx.font = `bold ${rawFontPx}px ${fontFamilyCss}`
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    const strut = ctx.measureText('Hg')
    const rawAscent =
      typeof strut.fontBoundingBoxAscent === 'number'
        ? strut.fontBoundingBoxAscent
        : rawFontPx * 0.85
    const rawDescent =
      typeof strut.fontBoundingBoxDescent === 'number'
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
    let rightPx = Math.ceil(maxX) + shadowPad
    let bottomPx = Math.ceil(maxY) + shadowPad
    let pixelWidth = rightPx - leftPx
    let pixelHeight = bottomPx - topPx

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

    if (this.spriteCanvas.width !== pixelWidth || this.spriteCanvas.height !== pixelHeight) {
      this.spriteCanvas.width = pixelWidth
      this.spriteCanvas.height = pixelHeight
    } else {
      ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    }

    const fontCss = `bold ${spec.size * renderScale}px ${fontFamilyCss}`
    ctx.font = fontCss
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    const originX = -leftPx
    const originY = -topPx

    if (spec.stroke) {
      if (this.glyphCanvas.width !== pixelWidth || this.glyphCanvas.height !== pixelHeight) {
        this.glyphCanvas.width = pixelWidth
        this.glyphCanvas.height = pixelHeight
      } else {
        this.glyphCtx.clearRect(0, 0, pixelWidth, pixelHeight)
      }
      const gCtx = this.glyphCtx
      gCtx.font = fontCss
      gCtx.textBaseline = 'alphabetic'
      gCtx.textAlign = 'left'
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
        ctx.drawImage(this.glyphCanvas, 0, 0)
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
in vec2 a_localPos;
in vec2 a_uv;

uniform vec2 u_screenSize;
uniform vec2 u_translate;
uniform float u_zRotateRad;
uniform float u_yRotateRad;

out vec2 v_uv;

void main() {
  // CSS right-to-left transform order: translate3d(x, y, 0) * rotateZ(rz) * rotateY(ry)
  float cosY = cos(u_yRotateRad);
  float sinY = sin(u_yRotateRad);
  float px = a_localPos.x * cosY;
  float py = a_localPos.y;
  float pz = -a_localPos.x * sinY;

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
  v_uv = a_uv;
}`

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
  private danmakuQuadData = new Float32Array(24)
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

    // Video program setup
    this.videoProgram = createProgram(gl, VIDEO_VERTEX_SHADER, VIDEO_FRAGMENT_SHADER)
    this.videoTexLoc = gl.getUniformLocation(this.videoProgram, 'u_tex')

    const vVao = gl.createVertexArray()
    const vVbo = gl.createBuffer()
    const vTex = gl.createTexture()
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
    this.danmakuProgram = createProgram(gl, DANMAKU_VERTEX_SHADER, DANMAKU_FRAGMENT_SHADER)
    this.uScreenSizeLoc = gl.getUniformLocation(this.danmakuProgram, 'u_screenSize')
    this.uTranslateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_translate')
    this.uZRotateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_zRotateRad')
    this.uYRotateLoc = gl.getUniformLocation(this.danmakuProgram, 'u_yRotateRad')
    this.uDanmakuTexLoc = gl.getUniformLocation(this.danmakuProgram, 'u_tex')
    this.uOpacityLoc = gl.getUniformLocation(this.danmakuProgram, 'u_opacity')
    this.uIsMaskLoc = gl.getUniformLocation(this.danmakuProgram, 'u_isMask')
    this.uColorLoc = gl.getUniformLocation(this.danmakuProgram, 'u_color')

    const dVao = gl.createVertexArray()
    const dVbo = gl.createBuffer()
    if (!dVao || !dVbo) {
      throw new Error('Failed to allocate WebGL2 danmaku resources')
    }
    this.danmakuVao = dVao
    this.danmakuVbo = dVbo

    gl.bindVertexArray(this.danmakuVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.danmakuVbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.danmakuQuadData.byteLength, gl.STREAM_DRAW)
    const dPosLoc = gl.getAttribLocation(this.danmakuProgram, 'a_localPos')
    const dUvLoc = gl.getAttribLocation(this.danmakuProgram, 'a_uv')
    gl.enableVertexAttribArray(dPosLoc)
    gl.vertexAttribPointer(dPosLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(dUvLoc)
    gl.vertexAttribPointer(dUvLoc, 2, gl.FLOAT, false, 16, 8)

    gl.useProgram(this.danmakuProgram)
    gl.uniform2f(this.uScreenSizeLoc, this.screenWidth, this.screenHeight)
    gl.uniform1i(this.uDanmakuTexLoc, 0)

    gl.useProgram(this.videoProgram)
    gl.uniform1i(this.videoTexLoc, 0)

    gl.bindVertexArray(null)
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

    const byteSize =
      sprite.format === 'r8'
        ? sprite.pixelWidth * sprite.pixelHeight
        : sprite.pixelWidth * sprite.pixelHeight * 4
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

  private updateVideoQuadGeometry(orientation: VideoQuadOrientation): void {
    const key = `${orientation.displayWidth}x${orientation.displayHeight}:${orientation.rotation}:${orientation.flip ? 1 : 0}`
    if (key === this.lastVideoOrientationKey) {
      return
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
  }

  private ensureScratchCanvas(width: number, height: number) {
    if (!this.scratchCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.scratchCanvas = new OffscreenCanvas(width, height)
      } else {
        const el = document.createElement('canvas')
        el.width = width
        el.height = height
        this.scratchCanvas = el
      }
      this.scratchCtx = this.scratchCanvas.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null
    }
    if (this.scratchCanvas.width !== width || this.scratchCanvas.height !== height) {
      this.scratchCanvas.width = width
      this.scratchCanvas.height = height
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

    if (videoSample) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)

      if (this.videoLastSampleTimestamp !== videoSample.timestamp) {
        this.videoLastSampleTimestamp = videoSample.timestamp
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)

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

      this.updateVideoQuadGeometry({
        displayWidth: videoSample.displayWidth,
        displayHeight: videoSample.displayHeight,
        rotation: videoSample.rotation,
        flip: videoSample.flip,
      })

      gl.useProgram(this.videoProgram)
      gl.bindVertexArray(this.videoVao)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    if (activeDanmakus.length > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(this.danmakuProgram)
      gl.bindVertexArray(this.danmakuVao)
      gl.activeTexture(gl.TEXTURE0)

      let prevQuadKey = ''
      let lastIsMask = -1
      for (let i = 0; i < activeDanmakus.length; i += 1) {
        const drawItem = activeDanmakus[i]
        const sprite = this.spriteCache.get(drawItem.entry.spriteKey)
        if (!sprite) {
          continue
        }

        const x0 = sprite.offsetX
        const y0 = sprite.offsetY
        const x1 = x0 + sprite.logicalWidth
        const y1 = y0 + sprite.logicalHeight
        const quadKey = `${x0},${y0},${x1},${y1}`
        if (quadKey !== prevQuadKey) {
          prevQuadKey = quadKey
          const d = this.danmakuQuadData
          d[0] = x0; d[1] = y0; d[2] = 0; d[3] = 0
          d[4] = x0; d[5] = y1; d[6] = 0; d[7] = 1
          d[8] = x1; d[9] = y0; d[10] = 1; d[11] = 0

          d[12] = x1; d[13] = y0; d[14] = 1; d[15] = 0
          d[16] = x0; d[17] = y1; d[18] = 0; d[19] = 1
          d[20] = x1; d[21] = y1; d[22] = 1; d[23] = 1

          gl.bindBuffer(gl.ARRAY_BUFFER, this.danmakuVbo)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, d)
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

        gl.bindTexture(gl.TEXTURE_2D, sprite.texture)
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
    gl.deleteTexture(this.videoTex)
    gl.deleteBuffer(this.videoVbo)
    gl.deleteVertexArray(this.videoVao)
    gl.deleteProgram(this.videoProgram)
    gl.deleteBuffer(this.danmakuVbo)
    gl.deleteVertexArray(this.danmakuVao)
    gl.deleteProgram(this.danmakuProgram)
  }
}
