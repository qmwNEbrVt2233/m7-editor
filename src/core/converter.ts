import type { DanmakuItem } from './danmaku'

const DEFAULT_FONT = 'Microsoft YaHei'
const DEFAULT_COLOR = '#ffffff'
const DEFAULT_SIZE = 60
const DEFAULT_DURATION_MS = 1000
const DEFAULT_MOVE_DURATION_MS = 500
const MAX_LAYERS = 100

interface ParsedXmlDanmaku {
  item: DanmakuItem
  sendTime: number
  sourceIndex: number
}

export interface XmlDanmakuMetadata {
  index: number
  p: string
  rawContent: string
  outerXML: string
}

export class XmlDanmakuParseError extends Error {
  metadata: XmlDanmakuMetadata

  constructor(message: string, metadata: XmlDanmakuMetadata) {
    super(message)
    this.name = 'XmlDanmakuParseError'
    this.metadata = metadata
  }
}

export interface XmlParseResult {
  danmakus: DanmakuItem[]
  errors: XmlDanmakuParseError[]
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampOpacity(value: unknown, fallback = 1): number {
  const opacity = toSafeNumber(value, fallback)
  return Math.min(1, Math.max(0, opacity))
}

function parseOpacity(value: unknown): { from: number; to: number } {
  const text = String(value ?? '1-1')
  const [fromRaw, toRaw] = text.split('-', 2)

  return {
    from: clampOpacity(fromRaw, 1),
    to: clampOpacity(toRaw, 1)
  }
}

function colorToDecimal(color: string): number {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(color)
    ? color.replace('#', '')
    : DEFAULT_COLOR.replace('#', '')

  return parseInt(normalized, 16)
}

function decimalToColor(value: unknown): string {
  const color = Math.max(0, Math.min(0xffffff, Math.round(toSafeNumber(value, colorToDecimal(DEFAULT_COLOR)))))
  return `#${color.toString(16).padStart(6, '0').toLowerCase()}`
}

function formatFontForXml(font: string): string {
  return font === DEFAULT_FONT ? '"Microsoft YaHei"' : font
}

function normalizeFontFromXml(font: unknown): string {
  let normalized = String(font ?? DEFAULT_FONT).trim()
  if (!normalized) {
    return DEFAULT_FONT
  }

  while (normalized.startsWith('"') && normalized.endsWith('"') && normalized.length >= 2) {
    normalized = normalized.slice(1, -1).trim()
  }

  return normalized === '微软雅黑' ? DEFAULT_FONT : normalized
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function hasLayerConflict(
  danmakus: DanmakuItem[],
  startTime: number,
  duration: number,
  layer: number
): boolean {
  return danmakus.some((danmaku) => {
    if (danmaku.layer !== layer) {
      return false
    }

    return startTime < danmaku.startTime + danmaku.animation.duration &&
      danmaku.startTime < startTime + duration
  })
}

function assignLayersForImportedDanmakus(entries: ParsedXmlDanmaku[]): DanmakuItem[] {
  const sortedEntries = [...entries].sort((a, b) => {
    return a.item.startTime - b.item.startTime ||
      a.sendTime - b.sendTime ||
      a.sourceIndex - b.sourceIndex
  })

  const assignedDanmakus: DanmakuItem[] = []
  let nextId = 1
  let index = 0

  while (index < sortedEntries.length) {
    const currentStartTime = sortedEntries[index].item.startTime
    let minimumLayerForCurrentStartTime = 0

    while (index < sortedEntries.length && sortedEntries[index].item.startTime === currentStartTime) {
      const currentEntry = sortedEntries[index]
      let targetLayer = minimumLayerForCurrentStartTime

      while (
        targetLayer < MAX_LAYERS &&
        hasLayerConflict(
          assignedDanmakus,
          currentEntry.item.startTime,
          currentEntry.item.animation.duration,
          targetLayer
        )
      ) {
        targetLayer++
      }

      currentEntry.item.layer = Math.min(targetLayer, MAX_LAYERS - 1)
      currentEntry.item.id = String(nextId)
      nextId++

      assignedDanmakus.push(currentEntry.item)
      minimumLayerForCurrentStartTime = currentEntry.item.layer + 1
      index++
    }
  }

  return assignedDanmakus
}

function createXmlDanmakuMetadata(node: Element, index: number): XmlDanmakuMetadata {
  return {
    index: index + 1,
    p: node.getAttribute('p') ?? '',
    rawContent: node.textContent ?? '',
    outerXML: node.outerHTML ?? ''
  }
}

function parseXmlBody(text: string, metadata: XmlDanmakuMetadata): unknown[] {
  const trimmed = text.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      throw new Error('body is not an array')
    }
    return parsed
  } catch {
    throw new XmlDanmakuParseError(`第 ${metadata.index} 条 XML 弹幕内容解析失败`, metadata)
  }
}

function createDanmakuFromXmlNode(node: Element, index: number): ParsedXmlDanmaku {
  const metadata = createXmlDanmakuMetadata(node, index)
  const p = metadata.p.split(',')
  if (p.length < 5) {
    throw new XmlDanmakuParseError(`第 ${metadata.index} 条 XML 弹幕缺少必要的 p 参数`, metadata)
  }

  const body = parseXmlBody(metadata.rawContent, metadata)
  const opacity = parseOpacity(body[2])
  const startX = toSafeNumber(body[0], 0)
  const startY = toSafeNumber(body[1], 0)

  const item: DanmakuItem = {
    id: String(index + 1),
    layer: 0,
    startTime: Math.max(0, Math.round(toSafeNumber(p[0], 0) * 1000)),
    content: {
      text: String(body[4] ?? ''),
      font: normalizeFontFromXml(body[12]),
      size: Math.max(1, Math.round(toSafeNumber(p[2], DEFAULT_SIZE))),
      color: decimalToColor(p[3]),
      stroke: toSafeNumber(body[11], 0) !== 0
    },
    transform: {
      start: { x: startX, y: startY },
      end: {
        x: toSafeNumber(body[7], startX),
        y: toSafeNumber(body[8], startY)
      },
      zRotate: toSafeNumber(body[5], 0),
      yRotate: toSafeNumber(body[6], 0)
    },
    opacity,
    animation: {
      duration: Math.max(1, Math.round(toSafeNumber(body[3], DEFAULT_DURATION_MS / 1000) * 1000)),
      moveDuration: Math.max(0, Math.round(toSafeNumber(body[9], DEFAULT_MOVE_DURATION_MS))),
      delay: Math.max(0, Math.round(toSafeNumber(body[10], 0))),
      easing: toSafeNumber(body[13], 1) === 1 ? 'speedup' : 'speeddown'
    }
  }

  return {
    item,
    sendTime: Math.round(toSafeNumber(p[4], index)),
    sourceIndex: index
  }
}

function buildXmlDanmakuTag(danmaku: DanmakuItem, sendTime: number): string {
  const p = [
    (danmaku.startTime / 1000).toFixed(5),
    7,
    Math.max(1, Math.round(toSafeNumber(danmaku.content.size, DEFAULT_SIZE))),
    colorToDecimal(danmaku.content.color),
    sendTime,
    0,
    '0',
    sendTime,
    10
  ].join(',')

  const body = JSON.stringify([
    toSafeNumber(danmaku.transform.start.x, 0),
    toSafeNumber(danmaku.transform.start.y, 0),
    `${clampOpacity(danmaku.opacity.from)}-${clampOpacity(danmaku.opacity.to)}`,
    Number((Math.max(1, toSafeNumber(danmaku.animation.duration, DEFAULT_DURATION_MS)) / 1000).toFixed(3)),
    danmaku.content.text,
    toSafeNumber(danmaku.transform.zRotate, 0),
    toSafeNumber(danmaku.transform.yRotate, 0),
    toSafeNumber(danmaku.transform.end.x, danmaku.transform.start.x),
    toSafeNumber(danmaku.transform.end.y, danmaku.transform.start.y),
    Math.max(0, Math.round(toSafeNumber(danmaku.animation.moveDuration, DEFAULT_MOVE_DURATION_MS))),
    Math.max(0, Math.round(toSafeNumber(danmaku.animation.delay, 0))),
    danmaku.content.stroke ? 1 : 0,
    formatFontForXml(danmaku.content.font),
    danmaku.animation.easing === 'speedup' ? 1 : 0
  ])

  return `  <d p="${p}">${escapeXmlText(body)}</d>`
}

export function toXML(list: DanmakuItem[]): string {
  const sortedDanmakus = [...list].sort((a, b) => {
    return a.startTime - b.startTime ||
      a.layer - b.layer ||
      toSafeNumber(a.id, 0) - toSafeNumber(b.id, 0)
  })

  const baseSendTime = Math.floor(Date.now() / 1000)
  const danmakuTags = sortedDanmakus.map((danmaku, index) => {
    return buildXmlDanmakuTag(danmaku, baseSendTime + index)
  }).join('\n')

  const xmlParts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<i>',
    '  <chatserver>chat.bilibili.com</chatserver>',
    '  <chatid>0</chatid>',
    '  <mission>0</mission>',
    `  <maxlimit>${sortedDanmakus.length}</maxlimit>`,
    '  <state>0</state>',
    '  <real_name>0</real_name>',
    '  <source>k-v</source>'
  ]

  if (danmakuTags) {
    xmlParts.push(danmakuTags)
  }

  xmlParts.push('</i>')
  return xmlParts.join('\n')
}

export function parseXML(xml: string): XmlParseResult {
  const parser = new DOMParser()
  const document = parser.parseFromString(xml, 'application/xml')
  const parserError = document.querySelector('parsererror')

  if (parserError) {
    throw new Error('XML 文件格式无效，无法解析')
  }

  const nodes = Array.from(document.getElementsByTagName('d'))
  const parsedDanmakus: ParsedXmlDanmaku[] = []
  const errors: XmlDanmakuParseError[] = []

  nodes.forEach((node, index) => {
    try {
      parsedDanmakus.push(createDanmakuFromXmlNode(node, index))
    } catch (error) {
      if (error instanceof XmlDanmakuParseError) {
        errors.push(error)
        return
      }

      const metadata = createXmlDanmakuMetadata(node, index)
      errors.push(
        new XmlDanmakuParseError(
          `第 ${metadata.index} 条 XML 弹幕解析时发生未知错误: ${error instanceof Error ? error.message : String(error)}`,
          metadata
        )
      )
    }
  })

  return {
    danmakus: assignLayersForImportedDanmakus(parsedDanmakus),
    errors
  }
}
