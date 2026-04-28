import type { DanmakuItem } from './danmaku'

/**
 * XML 导入导出模块
 *
 * 职责：
 * 1. 将编辑器内部的弹幕数据导出为 bilibili 风格 XML
 * 2. 将 XML 解析回编辑器内部的 DanmakuItem
 * 3. 在导入时根据 sendTime/date 反推 layer，并进行时间冲突避让
 * 4. 根据播放器 screen 宽高，处理比例坐标与像素坐标之间的互转
 */

const DEFAULT_FONT = 'Microsoft YaHei'
const DEFAULT_COLOR = '#ffffff'
const DEFAULT_SIZE = 60
const DEFAULT_DURATION_MS = 1000
const DEFAULT_MOVE_DURATION_MS = 500
const DEFAULT_SCREEN_WIDTH = 800
const DEFAULT_SCREEN_HEIGHT = 450
const MAX_LAYERS = 100

/**
 * XML 导出配置
 */
export interface XmlExportOptions {
  useRatioPosition?: boolean
  screenWidth?: number
  screenHeight?: number
}

/**
 * XML 导入配置
 */
export interface XmlImportOptions {
  screenWidth?: number
  screenHeight?: number
}

/**
 * 解析完成但尚未最终分配 layer 的中间对象
 */
interface ParsedXmlDanmaku {
  item: DanmakuItem
  sendTime: number
  sourceIndex: number
}

/**
 * 发生解析错误时携带的原始弹幕元数据
 */
export interface XmlDanmakuMetadata {
  index: number
  p: string
  rawContent: string
  outerXML: string
}

/**
 * 单条 XML 弹幕解析错误
 */
export class XmlDanmakuParseError extends Error {
  metadata: XmlDanmakuMetadata

  constructor(message: string, metadata: XmlDanmakuMetadata) {
    super(message)
    this.name = 'XmlDanmakuParseError'
    this.metadata = metadata
  }
}

/**
 * 整个 XML 的解析结果
 * danmakus 为成功导入的弹幕
 * errors 为被跳过的异常弹幕
 */
export interface XmlParseResult {
  danmakus: DanmakuItem[]
  errors: XmlDanmakuParseError[]
}

/**
 * 将任意输入安全转换为数值
 * 若转换失败则回退到 fallback
 */
function toSafeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/**
 * 规范化 screen 宽度，避免导入导出时出现 0 或非法值
 */
function normalizeScreenWidth(value: unknown): number {
  return Math.max(1, Math.round(toSafeNumber(value, DEFAULT_SCREEN_WIDTH)))
}

/**
 * 规范化 screen 高度，避免导入导出时出现 0 或非法值
 */
function normalizeScreenHeight(value: unknown): number {
  return Math.max(1, Math.round(toSafeNumber(value, DEFAULT_SCREEN_HEIGHT)))
}

/**
 * 将透明度约束到 0~1
 */
function clampOpacity(value: unknown, fallback = 1): number {
  const opacity = toSafeNumber(value, fallback)
  return Math.min(1, Math.max(0, opacity))
}

/**
 * 解析 XML body 中的 "起始透明度-结束透明度"
 */
function parseOpacity(value: unknown): { from: number; to: number } {
  const text = String(value ?? '1-1')
  const [fromRaw, toRaw] = text.split('-', 2)

  return {
    from: clampOpacity(fromRaw, 1),
    to: clampOpacity(toRaw, 1)
  }
}

/**
 * 将 #RRGGBB 转为 XML 所需的十进制颜色值
 */
function colorToDecimal(color: string): number {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(color)
    ? color.replace('#', '')
    : DEFAULT_COLOR.replace('#', '')

  return parseInt(normalized, 16)
}

/**
 * 将 XML 中的十进制颜色值转回 #RRGGBB
 */
function decimalToColor(value: unknown): string {
  const color = Math.max(0, Math.min(0xffffff, Math.round(toSafeNumber(value, colorToDecimal(DEFAULT_COLOR)))))
  return `#${color.toString(16).padStart(6, '0').toLowerCase()}`
}

/**
 * 微软雅黑需要按项目要求特殊写成 "\"Microsoft YaHei\""
 */
function formatFontForXml(font: string): string {
  return font === DEFAULT_FONT ? '"Microsoft YaHei"' : font
}

/**
 * 导入时去掉可能存在的多层引号，并统一字体名称
 */
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

/**
 * XML 文本转义，避免文本内容破坏 XML 结构
 */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 判断某个坐标值是否应视为比例值
 * 需求要求对 0~0.999 之间的坐标做特殊处理
 */
function isRatioCoordinate(value: number): boolean {
  return value >= 0 && value < 1
}

/**
 * 导入 XML 时：
 * 若值位于 0~0.999，则视为比例并转换为像素
 * 否则按普通像素值原样使用
 */
function convertCoordinateFromXml(value: unknown, axisSize: number, fallback = 0): number {
  const numeric = toSafeNumber(value, fallback)
  if (isRatioCoordinate(numeric)) {
    return Math.round(numeric * axisSize)
  }
  return numeric
}

/**
 * 导出 XML 时：
 * 若用户开启“按比例导出”，则将像素坐标换算为比例值
 * 否则保持像素值原样导出
 */
function convertCoordinateToXml(value: number, axisSize: number, useRatioPosition: boolean): number {
  if (!useRatioPosition) {
    return toSafeNumber(value, 0)
  }

  const ratio = toSafeNumber(value, 0) / axisSize
  return Number(ratio.toFixed(6))
}

/**
 * 判断指定 layer 上是否与已有弹幕发生时间冲突
 */
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

/**
 * 导入 XML 后重新分配 layer
 *
 * 规则：
 * 1. 先按 startTime 排序
 * 2. startTime 相同则按 sendTime/date 排序
 * 3. 同一时刻内，sendTime 越大，layer 越靠上
 * 4. 同时做时间冲突避让，避免重叠弹幕挤在同一层
 */
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

/**
 * 为异常弹幕收集元数据，便于错误日志定位
 */
function createXmlDanmakuMetadata(node: Element, index: number): XmlDanmakuMetadata {
  return {
    index: index + 1,
    p: node.getAttribute('p') ?? '',
    rawContent: node.textContent ?? '',
    outerXML: node.outerHTML ?? ''
  }
}

/**
 * 解析 XML body，也就是 d 节点内部的 JSON 数组
 */
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

/**
 * 将单个 XML d 节点转换为编辑器内部弹幕对象
 */
function createDanmakuFromXmlNode(
  node: Element,
  index: number,
  options: XmlImportOptions
): ParsedXmlDanmaku {
  const metadata = createXmlDanmakuMetadata(node, index)
  const p = metadata.p.split(',')
  if (p.length < 5) {
    throw new XmlDanmakuParseError(`第 ${metadata.index} 条 XML 弹幕缺少必要的 p 参数`, metadata)
  }

  const body = parseXmlBody(metadata.rawContent, metadata)
  const opacity = parseOpacity(body[2])
  const screenWidth = normalizeScreenWidth(options.screenWidth)
  const screenHeight = normalizeScreenHeight(options.screenHeight)

  const startX = convertCoordinateFromXml(body[0], screenWidth)
  const startY = convertCoordinateFromXml(body[1], screenHeight)

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
        x: convertCoordinateFromXml(body[7], screenWidth, startX),
        y: convertCoordinateFromXml(body[8], screenHeight, startY)
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

/**
 * 构造单条 XML d 节点文本
 */
function buildXmlDanmakuTag(
  danmaku: DanmakuItem,
  sendTime: number,
  options: Required<XmlExportOptions>
): string {
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
    convertCoordinateToXml(danmaku.transform.start.x, options.screenWidth, options.useRatioPosition),
    convertCoordinateToXml(danmaku.transform.start.y, options.screenHeight, options.useRatioPosition),
    `${clampOpacity(danmaku.opacity.from)}-${clampOpacity(danmaku.opacity.to)}`,
    Number((Math.max(1, toSafeNumber(danmaku.animation.duration, DEFAULT_DURATION_MS)) / 1000).toFixed(3)),
    danmaku.content.text,
    toSafeNumber(danmaku.transform.zRotate, 0),
    toSafeNumber(danmaku.transform.yRotate, 0),
    convertCoordinateToXml(danmaku.transform.end.x, options.screenWidth, options.useRatioPosition),
    convertCoordinateToXml(danmaku.transform.end.y, options.screenHeight, options.useRatioPosition),
    Math.max(0, Math.round(toSafeNumber(danmaku.animation.moveDuration, DEFAULT_MOVE_DURATION_MS))),
    Math.max(0, Math.round(toSafeNumber(danmaku.animation.delay, 0))),
    danmaku.content.stroke ? 1 : 0,
    formatFontForXml(danmaku.content.font),
    danmaku.animation.easing === 'speedup' ? 1 : 0
  ])

  return `  <d p="${p}">${escapeXmlText(body)}</d>`
}

/**
 * 导出 XML
 *
 * 规则：
 * 1. 先按 startTime 排序
 * 2. startTime 相同则按 layer 排序
 * 3. 生成 fake sendTime，保证同一时刻内 layer 越大，sendTime 越大
 * 4. 根据用户设置决定坐标是导出为像素还是比例
 */
export function toXML(list: DanmakuItem[], options: XmlExportOptions = {}): string {
  const normalizedOptions: Required<XmlExportOptions> = {
    useRatioPosition: options.useRatioPosition ?? false,
    screenWidth: normalizeScreenWidth(options.screenWidth),
    screenHeight: normalizeScreenHeight(options.screenHeight)
  }

  const sortedDanmakus = [...list].sort((a, b) => {
    return a.startTime - b.startTime ||
      a.layer - b.layer ||
      toSafeNumber(a.id, 0) - toSafeNumber(b.id, 0)
  })

  const baseSendTime = Math.floor(Date.now() / 1000)
  const danmakuTags = sortedDanmakus.map((danmaku, index) => {
    return buildXmlDanmakuTag(danmaku, baseSendTime + index, normalizedOptions)
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

/**
 * 解析 XML
 *
 * 注意：
 * 1. 单条弹幕解析失败时不会中断整批导入
 * 2. 失败弹幕会被收集到 errors 中
 * 3. 解析成功的弹幕会继续参与 layer 重建
 * 4. 坐标会根据 screen 宽高进行比例转像素
 */
export function parseXML(xml: string, options: XmlImportOptions = {}): XmlParseResult {
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
      parsedDanmakus.push(createDanmakuFromXmlNode(node, index, options))
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