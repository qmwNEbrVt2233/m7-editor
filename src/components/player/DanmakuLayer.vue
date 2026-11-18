<template>
  <div class="layer">
    <template v-if="!isAggressivePlaybackActive">
      <div
        v-for="(d, index) in standardDanmakus"
        :key="d.id"
        class="danmaku"
        :style="getPausedStyle(d, +index)"
      >
        <div class="danmaku-content">{{ d.content.text }}</div>
      </div>
    </template>

    <div
      ref="playbackLayer"
      class="playbackLayer"
      :class="{ active: isAggressivePlaybackActive }"
    >
    </div>
  </div>

  <div class="ghostLayer" aria-hidden="true">
    <div
      v-for="(request, index) in ghostRequests"
      :key="request.requestId"
      :ref="(el) => setGhostElement(request.requestId, el)"
      class="danmaku"
      :style="getGhostStyle(request.danmaku, index)"
    >
      <div class="danmaku-content">{{ request.danmaku.content.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { shallowRef, computed, watch, nextTick, ref, onMounted, onBeforeUnmount } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'
import { TOOLBAR_MEASURE_EVENT } from '@/core/danmakuMeasurement'
import type { ToolbarMeasure, ToolbarMeasureRequest, ToolbarMeasureEventDetail } from '@/core/danmakuMeasurement'
import { useEditorStore } from '@/store/editor'

const store = useEditorStore()
const props = defineProps<{
  renderTimeMs?: number | null
  renderDanmakus?: DanmakuItem[]
}>()

const BUFFER_WINDOW = 10000 // 缓存窗口：10秒
const PRELOAD_THRESHOLD = 1000 // 预加载阈值：1秒
const JITTER_TOLERANCE = 500 // 抖动容差：500ms（解决视频时间微小倒退导致的频繁重算）
const MAX_PLAYBACK_NODE_POOL = 500
const DANMAKU_VISIBILITY_EVENT = 'danmaku-selection-visibility'

type DanmakuVisibilityMode = 'hide' | 'only'

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
  'fangsong'
])

function formatFontFamilyForCss(font: string): string {
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

// 使用 shallowRef 拒绝深度 Proxy 劫持
const activeBuffer = shallowRef<DanmakuItem[]>([])
const standardDanmakus = shallowRef<DanmakuItem[]>([])
const ghostRequests = ref<ToolbarMeasureRequest[]>([])
const selectionVisibilityMode = ref<DanmakuVisibilityMode | null>(null)
const playbackLayer = ref<HTMLDivElement | null>(null)
const ghostElements = new Map<string, HTMLDivElement>()

let currentBufferStart = -1
let currentBufferEnd = -1
let playbackFrameId: number | null = null
let playbackVisibleDanmakus: DanmakuItem[] = []
let playbackNextStartIndex = 0
let playbackLastTime = 0
let playbackResyncRequested = false
let measureQueue: Promise<void> = Promise.resolve()
// 对编辑器修改引发的全量重算进行防抖（Debounce）
let editTimeout: ReturnType<typeof setTimeout> | null = null

const playbackActiveNodes = new Map<string, HTMLDivElement>()
const playbackNodePool: HTMLDivElement[] = []

const selectedIdSet = computed(() => new Set(store.selectedIds))

const isSnapshotRender = computed(() => props.renderTimeMs !== undefined && props.renderTimeMs !== null)
const isAggressivePlaybackActive = computed(() => {
  return !isSnapshotRender.value && store.playing && store.aggressiveOptimization
})

const renderTime = computed(() => props.renderTimeMs ?? store.currentTime)
const renderSource = computed(() => props.renderDanmakus
  ? sortDanmakus(props.renderDanmakus)
  : store.danmakus)

function sortDanmakus(danmakus: DanmakuItem[]) {
  return [...danmakus].sort((a: DanmakuItem, b: DanmakuItem) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }

    const layerA = a.layer || 0
    const layerB = b.layer || 0
    return layerA - layerB
  })
}

function getDanmakuDuration(d: DanmakuItem): number {
  const duration = Number(d.animation?.duration)
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

function isVisibleAtTime(d: DanmakuItem, time: number) {
  const startTime = Number(d.startTime)
  if (!Number.isFinite(startTime) || !Number.isFinite(time)) {
    return false
  }
  return time >= startTime && time <= startTime + getDanmakuDuration(d)
}

function hasVisibleAppearance(d: DanmakuItem): boolean {
  if (!d.content?.text) {
    return false
  }
  const opacityFrom = Number(d.opacity?.from ?? 1)
  const opacityTo = Number(d.opacity?.to ?? 1)
  return !(opacityFrom <= 0 && opacityTo <= 0)
}

function shouldRenderDanmaku(d: DanmakuItem) {
  if (!hasVisibleAppearance(d)) return false
  if (isSnapshotRender.value) return true
  if (selectionVisibilityMode.value === 'hide') {
    return !selectedIdSet.value.has(d.id)
  }
  if (selectionVisibilityMode.value === 'only') {
    return selectedIdSet.value.has(d.id)
  }
  return true
}

function syncStandardRenderList(time: number) {
  if (isSnapshotRender.value) {
    const sorted = renderSource.value
    const nextVisible: DanmakuItem[] = []
    for (let i = 0; i < sorted.length; i += 1) {
      const d = sorted[i]
      if ((Number(d.startTime) || 0) > time) {
        break
      }
      if (isVisibleAtTime(d, time) && shouldRenderDanmaku(d)) {
        nextVisible.push(d)
      }
    }
    standardDanmakus.value = nextVisible
    return
  }

  standardDanmakus.value = activeBuffer.value.filter((d: DanmakuItem) => {
    return isVisibleAtTime(d, time) && shouldRenderDanmaku(d)
  })
}

function requestPlaybackResync() {
  playbackResyncRequested = true
}

// 低频刷新核心
function updateBuffer(time: number) {
  if (editTimeout) {
    clearTimeout(editTimeout)
    editTimeout = null
  }
  const safeTime = Number.isFinite(time) ? time : 0
  currentBufferStart = safeTime - PRELOAD_THRESHOLD
  currentBufferEnd = safeTime + BUFFER_WINDOW
  const includeStart = currentBufferStart - JITTER_TOLERANCE

  const nextBuffer = renderSource.value.filter((d: DanmakuItem) => {
    const startTime = Number(d.startTime)
    if (!Number.isFinite(startTime)) return false
    const dEnd = startTime + getDanmakuDuration(d)
    return dEnd >= includeStart && startTime <= currentBufferEnd
  })
  activeBuffer.value = sortDanmakus(nextBuffer)

  if (isAggressivePlaybackActive.value) {
    requestPlaybackResync()
    return
  }

  syncStandardRenderList(safeTime)
}

// 监听时间轴：加入容差判断
watch(() => store.currentTime, (newTime) => {
  if (isSnapshotRender.value) return
  // 减去 JITTER_TOLERANCE，忽略播放器的微小时间回退
  if (
    newTime < currentBufferStart - JITTER_TOLERANCE ||
    newTime > currentBufferEnd - PRELOAD_THRESHOLD
  ) {
    updateBuffer(newTime)
    return
  }

  if (!isAggressivePlaybackActive.value) {
    syncStandardRenderList(newTime)
  }
}, { immediate: true })

watch([() => props.renderTimeMs, () => props.renderDanmakus], () => {
  if (!isSnapshotRender.value) {
    updateBuffer(store.currentTime)
    return
  }

  syncStandardRenderList(renderTime.value)
}, { immediate: true })

watch(selectionVisibilityMode, () => {
  if (isAggressivePlaybackActive.value) {
    requestPlaybackResync()
    return
  }
  syncStandardRenderList(renderTime.value)
})

watch(() => store.selectedIds.join('\0'), () => {
  if (!selectionVisibilityMode.value) {
    return
  }
  if (isAggressivePlaybackActive.value) {
    requestPlaybackResync()
    return
  }
  syncStandardRenderList(renderTime.value)
})
function scheduleBufferRebuild() {
  if (editTimeout) clearTimeout(editTimeout)
  editTimeout = setTimeout(() => {
    editTimeout = null
    updateBuffer(renderTime.value)
  }, 200)
}

watch(() => store.danmakus, () => {
  if (isSnapshotRender.value) return
  scheduleBufferRebuild()
}, { deep: true })

// 监听 XML/JSON 导入完成标志，立即重构缓冲池
watch(() => store.importTimestamp, (newTimestamp) => {
  if (newTimestamp > 0) {
    updateBuffer(renderTime.value)
  }
})

watch(() => store.screenRecordingMode, () => {
    updateBuffer(renderTime.value)
})

// 缓动函数
function applyEasing(progress: number, easing: string) {
  if (easing === 'speedup') {
    return progress * progress
  }

  return 1 - (1 - progress) * (1 - progress)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getRenderState(d: DanmakuItem, currentTime: number) {
  const startTime = Number(d.startTime) || 0
  const duration = getDanmakuDuration(d)
  const t = currentTime - startTime
  const moveDuration = Number(d.animation?.moveDuration) || 0
  const delay = Number(d.animation?.delay) || 0
  const easing = d.animation?.easing === 'speedup' ? 'speedup' : 'speeddown'

  let progress = 0

  if (moveDuration <= 0) {
    progress = 1
  } else if (t <= delay) {
    progress = 0
  } else {
    progress = (t - delay) / moveDuration
  }

  progress = clamp(Number.isFinite(progress) ? progress : 0, 0, 1)
  progress = applyEasing(progress, easing)

  const startX = Number(d.transform?.start?.x) || 0
  const startY = Number(d.transform?.start?.y) || 0
  const endX = Number(d.transform?.end?.x) || 0
  const endY = Number(d.transform?.end?.y) || 0

  const x = startX + (endX - startX) * progress
  const y = startY + (endY - startY) * progress

  const lifeProgress = duration > 0
    ? clamp(t / duration, 0, 1)
    : 1

  const opacityFrom = Number(d.opacity?.from ?? 1)
  const opacityTo = Number(d.opacity?.to ?? 1)
  const rawOpacity = opacityFrom + (opacityTo - opacityFrom) * lifeProgress
  const opacity = clamp(Number.isFinite(rawOpacity) ? rawOpacity : 1, 0, 1)

  return { x, y, opacity }
}

function buildTransform(d: DanmakuItem, x: number, y: number) {
  const transformParts = [`translate3d(${x}px, ${y}px, 0)`]
  const zRotate = Number(d.transform?.zRotate) || 0
  const yRotate = Number(d.transform?.yRotate) || 0

  if (zRotate !== 0) {
    transformParts.push(`rotateZ(${zRotate}deg)`)
  }

  if (yRotate !== 0) {
    transformParts.push(`rotateY(${360 - yRotate}deg)`)
  }

  return transformParts.join(' ')
}

function buildBaseStyle(d: DanmakuItem, index: number) {
  const fontSize = Number(d.content?.size)
  const safeSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24
  return {
    position: 'absolute' as const,
    zIndex: index,
    color: d.content?.color || '#ffffff',
    fontSize: `${safeSize}px`,
    fontFamily: formatFontFamilyForCss(d.content?.font ?? ''),
    fontWeight: 'bold' as const,
    lineHeight: 1,
    textShadow: d.content?.stroke ? `
      1px 1px 1px #000,
      -1px -1px 1px #000,
      -1px 1px 1px #000,
      1px -1px 1px #000,
      1px 0px 1px #000,
      0px 1px 1px #000,
      -1px 0px 1px #000,
      0px -1px 1px #000
    ` : undefined
  }
}

// 使用原生 DOM API 直接设置样式，避免 Vue 的响应式系统带来的性能开销（激进优化模式下）
function applyBaseStyleToElement(
  element: HTMLDivElement,
  d: DanmakuItem,
  index: number,
  willChange: string
) {
  const baseStyle = buildBaseStyle(d, index)
  element.style.position = baseStyle.position
  element.style.zIndex = String(baseStyle.zIndex)
  element.style.color = baseStyle.color
  element.style.fontSize = baseStyle.fontSize
  element.style.fontFamily = baseStyle.fontFamily
  element.style.fontWeight = baseStyle.fontWeight
  element.style.lineHeight = String(baseStyle.lineHeight)
  element.style.textShadow = baseStyle.textShadow ?? ''
  element.style.willChange = willChange
  element.style.transformOrigin = '0% 0%'
}

function getPausedStyle(d: DanmakuItem, index: number) {
  const { x, y, opacity } = getRenderState(d, renderTime.value)
  const transform = buildTransform(d, x, y)

  return {
    ...buildBaseStyle(d, index),
    transform,
    opacity
  }
}

// 幽灵层复用同一套文本渲染样式，只去掉位移，便于测量真实包围盒
function getGhostStyle(d: DanmakuItem, index: number) {
  const transform = `
    translate3d(0px, 0px, 0)
  `

  return {
    ...buildBaseStyle(d, index),
    transform,
    opacity: 1,
    willChange: 'auto'
  }
}

function ensurePlaybackNode() {
  const reusedNode = playbackNodePool.pop()
  if (reusedNode) {
    return reusedNode
  }

  const node = document.createElement('div')
  node.className = 'danmaku'

  const content = document.createElement('div')
  content.className = 'danmaku-content'
  content.style.wordBreak = 'break-word'
  content.style.whiteSpace = 'pre'
  node.appendChild(content)

  return node
}

function setGhostElement(
  requestId: string,
  el: Element | ComponentPublicInstance | null
) {
  if (el instanceof HTMLDivElement) {
    ghostElements.set(requestId, el)
    return
  }

  ghostElements.delete(requestId)
}

function recyclePlaybackNode(danmakuId: string) {
  const node = playbackActiveNodes.get(danmakuId)
  if (!node) {
    return
  }

  playbackActiveNodes.delete(danmakuId)
  node.remove()
  if (playbackNodePool.length < MAX_PLAYBACK_NODE_POOL) {
    node.style.transform = 'translate3d(0px, 0px, 0)'
    node.style.opacity = '0'
    node.style.willChange = 'auto'
    playbackNodePool.push(node)
  }
}

function mountPlaybackDanmaku(d: DanmakuItem, order: number, time: number) {
  if (playbackActiveNodes.has(d.id) || !playbackLayer.value) {
    return
  }

  const node = ensurePlaybackNode()
  const content = node.firstElementChild as HTMLDivElement | null
  if (content) {
    content.textContent = d.content?.text ?? ''
  }
  applyBaseStyleToElement(node, d, order, 'transform, opacity')
  playbackLayer.value.appendChild(node)
  playbackActiveNodes.set(d.id, node)

  const { x, y, opacity } = getRenderState(d, time)
  node.style.transform = buildTransform(d, x, y)
  node.style.opacity = String(opacity)
}

function clearPlaybackNodes() {
  Array.from(playbackActiveNodes.keys()).forEach((danmakuId) => {
    recyclePlaybackNode(danmakuId)
  })
  playbackVisibleDanmakus = []
}

function rebuildPlaybackNodes(time: number) {
  clearPlaybackNodes()

  for (let index = 0; index < activeBuffer.value.length; index += 1) {
    const danmaku = activeBuffer.value[index]
    if (!isVisibleAtTime(danmaku, time) || !shouldRenderDanmaku(danmaku)) {
      continue
    }

    playbackVisibleDanmakus.push(danmaku)
    mountPlaybackDanmaku(danmaku, index, time)
  }

  playbackNextStartIndex = 0
  while (
    playbackNextStartIndex < activeBuffer.value.length &&
    activeBuffer.value[playbackNextStartIndex].startTime <= time
  ) {
    playbackNextStartIndex += 1
  }

  playbackLastTime = time
  playbackResyncRequested = false
}

function syncPlaybackVisibility(time: number) {
  if (playbackResyncRequested || time < playbackLastTime) {
    rebuildPlaybackNodes(time)
    return
  }

  const nextVisibleDanmakus: DanmakuItem[] = []
  playbackVisibleDanmakus.forEach((d: DanmakuItem) => {
    if (isVisibleAtTime(d, time) && shouldRenderDanmaku(d)) {
      nextVisibleDanmakus.push(d)
      return
    }

    recyclePlaybackNode(d.id)
  })
  playbackVisibleDanmakus = nextVisibleDanmakus

  while (
    playbackNextStartIndex < activeBuffer.value.length &&
    activeBuffer.value[playbackNextStartIndex].startTime <= time
  ) {
    const danmaku = activeBuffer.value[playbackNextStartIndex]
    if (isVisibleAtTime(danmaku, time) && shouldRenderDanmaku(danmaku)) {
      mountPlaybackDanmaku(danmaku, playbackNextStartIndex, time)
      playbackVisibleDanmakus.push(danmaku)
    }

    playbackNextStartIndex += 1
  }

  playbackLastTime = time
}

function applyPlaybackStyles(time: number) {
  playbackVisibleDanmakus.forEach((d: DanmakuItem) => {
    const element = playbackActiveNodes.get(d.id)
    if (!element) {
      return
    }

    const { x, y, opacity } = getRenderState(d, time)
    element.style.transform = buildTransform(d, x, y)
    element.style.opacity = String(opacity)
  })
}

function playbackTick() {
  if (!store.playing || !isAggressivePlaybackActive.value) {
    playbackFrameId = null
    return
  }

  const time = store.currentTime
  syncPlaybackVisibility(time)
  applyPlaybackStyles(time)
  playbackFrameId = requestAnimationFrame(playbackTick)
}

function startPlaybackMode() {
  if (playbackFrameId !== null) {
    cancelAnimationFrame(playbackFrameId)
  }

  rebuildPlaybackNodes(store.currentTime)
  playbackFrameId = requestAnimationFrame(playbackTick)
}

function stopPlaybackMode() {
  if (playbackFrameId !== null) {
    cancelAnimationFrame(playbackFrameId)
    playbackFrameId = null
  }

  clearPlaybackNodes()
  playbackNextStartIndex = 0
  playbackLastTime = renderTime.value
  playbackResyncRequested = false
  syncStandardRenderList(renderTime.value)
}

watch(isAggressivePlaybackActive, (enabled) => {
  if (enabled) {
    startPlaybackMode()
    return
  }

  stopPlaybackMode()
}, { immediate: true })

async function runToolbarMeasure(detail: ToolbarMeasureEventDetail) {
  if (detail.requests.length === 0) {
    detail.resolve({})
    return
  }

  try {
    ghostRequests.value = detail.requests
    await nextTick()

    const result: ToolbarMeasure = {}

    detail.requests.forEach((request) => {
      const element = ghostElements.get(request.requestId) as HTMLElement
      if (!element) {
        return
      }

      // 1. 获取元素原始的排版宽高
      const originW = element.offsetWidth || 0
      const originH = element.offsetHeight || 0

      // 2. 获取 Z 轴旋转角度，并转换为弧度
      const zRotate = request.danmaku.transform?.zRotate || 0
      const radians = zRotate * (Math.PI / 180)

      // 3. 通过纯数学三角函数计算旋转后的视觉包围盒宽高
      const boundingWidth = Math.abs(originW * Math.cos(radians)) + Math.abs(originH * Math.sin(radians))
      const boundingHeight = Math.abs(originW * Math.sin(radians)) + Math.abs(originH * Math.cos(radians))

      result[request.requestId] = {
        width: boundingWidth,
        height: boundingHeight,
        rawWidth: originW,
        rawHeight: originH
      }
    })

    detail.resolve(result)
  } catch (error) {
    detail.reject(error)
  } finally {
    ghostRequests.value = []
    ghostElements.clear()
  }
}

function handleToolbarMeasure(event: Event) {
  const customEvent = event as CustomEvent<ToolbarMeasureEventDetail>
  const detail = customEvent.detail

  if (!detail) {
    return
  }

  measureQueue = measureQueue
    .then(() => runToolbarMeasure(detail))
    .catch((error) => detail.reject(error))
}

function handleTabKeyPress(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) {
    return
  }
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }

  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault()
    updateBuffer(store.currentTime)
    console.log('[DanmakuLayer] 快捷键：手动触发缓冲池重构')
  }
}

function handleUpdateBufferRequest(event: Event) {
  const customEvent = event as CustomEvent<{ time?: number }>
  const nextTime = customEvent.detail?.time
  updateBuffer(typeof nextTime === 'number' && Number.isFinite(nextTime) ? nextTime : renderTime.value)
}

function handleDanmakuVisibilityRequest(event: Event) {
  const customEvent = event as CustomEvent<DanmakuVisibilityMode | null>
  selectionVisibilityMode.value = customEvent.detail
}

onMounted(() => {
  window.addEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
  window.addEventListener(DANMAKU_VISIBILITY_EVENT, handleDanmakuVisibilityRequest as EventListener)
  window.addEventListener('keydown', handleTabKeyPress)
  window.addEventListener('danmaku-update-buffer', handleUpdateBufferRequest as EventListener)
  if (isAggressivePlaybackActive.value && playbackFrameId === null) {
    startPlaybackMode()
  }
})

onBeforeUnmount(() => {
  if (editTimeout) {
    clearTimeout(editTimeout)
    editTimeout = null
  }

  if (playbackFrameId !== null) {
    cancelAnimationFrame(playbackFrameId)
    playbackFrameId = null
  }

  clearPlaybackNodes()
  playbackNodePool.length = 0
  ghostElements.clear()
  window.removeEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
  window.removeEventListener(DANMAKU_VISIBILITY_EVENT, handleDanmakuVisibilityRequest as EventListener)
  window.removeEventListener('keydown', handleTabKeyPress)
  window.removeEventListener('danmaku-update-buffer', handleUpdateBufferRequest as EventListener)
})
</script>

<style scoped>
.layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  perspective: 500px;
}

.ghostLayer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  perspective: 500px;
  visibility: hidden;
  overflow: visible;
}

.playbackLayer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  visibility: hidden;
  overflow: visible;
  perspective: 500px;
}

.playbackLayer.active {
  visibility: visible;
}

.danmaku {
  position: absolute;
  white-space: nowrap;
  transform-style: preserve-3d;
  transform-origin: 0% 0%;
}

.danmaku-content {
  word-break: break-word;
  white-space: pre;
}
</style>
