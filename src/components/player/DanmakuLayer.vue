<template>
  <div class="layer">
    <template v-if="!isAggressivePlaybackActive">
      <div
        v-for="(d, index) in standardDanmakus"
        :key="d.id"
        class="danmaku"
        :style="getPausedStyle(d, +index)"
      >
        <div
          class="danmaku-content"
          v-html="formatText(d.content.text)"
        ></div>
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
      <div
        class="danmaku-content"
        v-html="formatText(request.danmaku.content.text)"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { shallowRef, computed, watch, nextTick, ref, onMounted, onBeforeUnmount } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

const BUFFER_WINDOW = 10000 // 缓存窗口：10秒
const PRELOAD_THRESHOLD = 1000 // 预加载阈值：1秒
const JITTER_TOLERANCE = 500 // 抖动容差：500ms（解决视频时间微小倒退导致的频繁重算）
const TOOLBAR_MEASURE_EVENT = 'toolbar-measure-danmakus'

type ToolbarMeasureRequest = {
  requestId: string
  danmaku: DanmakuItem
}

type ToolbarMeasureResponse = Record<string, {
  width: number
  height: number
  rawWidth: number
  rawHeight: number
}>

type ToolbarMeasureEventDetail = {
  requests: ToolbarMeasureRequest[]
  resolve: (result: ToolbarMeasureResponse) => void
  reject: (reason?: unknown) => void
}

// 使用 shallowRef 拒绝深度 Proxy 劫持
const activeBuffer = shallowRef<DanmakuItem[]>([])
const standardDanmakus = shallowRef<DanmakuItem[]>([])
const ghostRequests = ref<ToolbarMeasureRequest[]>([])
const playbackLayer = ref<HTMLDivElement | null>(null)
const ghostElements = new Map<string, HTMLDivElement>()

let currentBufferStart = -1
let currentBufferEnd = -1
let playbackFrameId: number | null = null
let playbackVisibleDanmakus: DanmakuItem[] = []
let playbackNextStartIndex = 0
let playbackLastTime = 0
let playbackResyncRequested = false
const playbackActiveNodes = new Map<string, HTMLDivElement>()
const playbackNodePool: HTMLDivElement[] = []

const danmakuBufferSignature = computed(() => {
  return store.danmakus
    .map((d: DanmakuItem) => `${d.id}|${d.layer}|${d.startTime}|${d.animation.duration}`)
    .join(';')
})

const isAggressivePlaybackActive = computed(() => {
  return store.playing && store.aggressiveOptimization
})

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

function getDanmakuEndTime(d: DanmakuItem) {
  return d.startTime + d.animation.duration
}

function isVisibleAtTime(d: DanmakuItem, time: number) {
  return time >= d.startTime && time <= getDanmakuEndTime(d)
}

function syncStandardRenderList(time: number) {
  standardDanmakus.value = activeBuffer.value.filter((d: DanmakuItem) => {
    return isVisibleAtTime(d, time)
  })
}

function requestPlaybackResync() {
  playbackResyncRequested = true
}

// 低频刷新核心
function updateBuffer(time: number) {
  console.log(`[Buffer] 正在重构缓冲池，当前时间: ${time}`)
  currentBufferStart = time - PRELOAD_THRESHOLD
  currentBufferEnd = time + BUFFER_WINDOW

  const nextBuffer = store.danmakus.filter((d: DanmakuItem) => {
    const dEnd = d.startTime + d.animation.duration
    return dEnd >= currentBufferStart && d.startTime <= currentBufferEnd
  })
  activeBuffer.value = sortDanmakus(nextBuffer)
  console.log(`缓存池大小：${activeBuffer.value.length}条弹幕`)

  if (isAggressivePlaybackActive.value) {
    requestPlaybackResync()
    return
  }

  syncStandardRenderList(time)
}

// 监听时间轴：加入容差判断
watch(() => store.currentTime, (newTime) => {
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

// 对编辑器修改引发的全量重算进行防抖（Debounce）
let editTimeout: ReturnType<typeof setTimeout> | null = null
watch(danmakuBufferSignature, () => {
  // 播放期间如果 store 发生莫名其妙的微小变动，防抖可以阻止其引发高频重算
  if (editTimeout) clearTimeout(editTimeout)
  editTimeout = setTimeout(() => {
    updateBuffer(store.currentTime)
  }, 200) // 延迟 200ms 重建
})

// 监听 XML/JSON 导入完成标志，立即重构缓冲池
watch(() => store.importTimestamp, (newTimestamp) => {
  if (newTimestamp > 0) {
    updateBuffer(store.currentTime)
  }
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
  const t = currentTime - d.startTime
  const { delay, moveDuration, easing } = d.animation

  let progress = 0

  if (moveDuration <= 0) {
    progress = 1
  } else if (t <= delay) {
    progress = 0
  } else {
    progress = (t - delay) / moveDuration
  }

  progress = clamp(progress, 0, 1)
  progress = applyEasing(progress, easing)

  const x =
    d.transform.start.x +
    (d.transform.end.x - d.transform.start.x) * progress

  const y =
    d.transform.start.y +
    (d.transform.end.y - d.transform.start.y) * progress

  const lifeProgress = clamp(
    (currentTime - d.startTime) / d.animation.duration,
    0,
    1
  )

  const opacity =
    d.opacity.from +
    (d.opacity.to - d.opacity.from) * lifeProgress

  return { x, y, opacity }
}

function buildTransform(d: DanmakuItem, x: number, y: number) {
  const transformParts = [`translate3d(${x}px, ${y}px, 0)`]

  if (d.transform.zRotate !== 0) {
    transformParts.push(`rotateZ(${d.transform.zRotate}deg)`)
  }

  if (d.transform.yRotate !== 0) {
    transformParts.push(`rotateY(${360 - d.transform.yRotate}deg)`)
  }

  return transformParts.join(' ')
}

function buildBaseStyle(d: DanmakuItem, index: number) {
  return {
    position: 'absolute' as const,
    zIndex: index,
    color: d.content.color,
    fontSize: `${d.content.size}px`,
    fontFamily: `${d.content.font}, Arial, Helvetica, sans-serif`,
    fontWeight: 'bold' as const,
    lineHeight: 1,
    textShadow: d.content.stroke ? `
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
  const { x, y, opacity } = getRenderState(d, store.currentTime)
  const transform = buildTransform(d, x, y)

  return {
    ...buildBaseStyle(d, index),
    transform,
    opacity
  }
}

// 幽灵层复用同一套文本渲染样式，只去掉位移，便于测量真实包围盒。
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

function formatText(text: string) {
  return text.replace(/\n/g, '<br />')
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
  node.style.transform = 'translate3d(0px, 0px, 0)'
  node.style.opacity = '0'
  node.style.willChange = 'auto'
  playbackNodePool.push(node)
}

function mountPlaybackDanmaku(d: DanmakuItem, order: number, time: number) {
  if (playbackActiveNodes.has(d.id) || !playbackLayer.value) {
    return
  }

  const node = ensurePlaybackNode()
  const content = node.firstElementChild as HTMLDivElement | null
  if (content) {
    content.innerHTML = formatText(d.content.text)
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
    if (!isVisibleAtTime(danmaku, time)) {
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
  if (playbackResyncRequested || time < playbackLastTime - JITTER_TOLERANCE) {
    rebuildPlaybackNodes(time)
    return
  }

  const nextVisibleDanmakus: DanmakuItem[] = []
  playbackVisibleDanmakus.forEach((d: DanmakuItem) => {
    if (time <= getDanmakuEndTime(d)) {
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
    if (time <= getDanmakuEndTime(danmaku)) {
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
  if (!store.playing) {
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
  playbackLastTime = store.currentTime
  playbackResyncRequested = false
  syncStandardRenderList(store.currentTime)
}

watch(isAggressivePlaybackActive, (enabled) => {
  if (enabled) {
    startPlaybackMode()
    return
  }

  stopPlaybackMode()
}, { immediate: true })

async function handleToolbarMeasure(event: Event) {
  const customEvent = event as CustomEvent<ToolbarMeasureEventDetail>
  const detail = customEvent.detail

  if (!detail) {
    return
  }

  if (detail.requests.length === 0) {
    detail.resolve({})
    return
  }

  try {
    ghostRequests.value = detail.requests
    await nextTick()

    const result: ToolbarMeasureResponse = {}

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

      result[request.danmaku.id] = {
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

function handleTabKeyPress(event: KeyboardEvent) {
  // 避免在输入框中触发快捷键
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    updateBuffer(store.currentTime)
    console.log('[DanmakuLayer] TAB 快捷键：手动触发缓冲池重构')
  }
}

function handleUpdateBufferRequest(event: Event) {
  const customEvent = event as CustomEvent<{ time: number }>
  updateBuffer(customEvent.detail.time)
}

onMounted(() => {
  window.addEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
  window.addEventListener('keydown', handleTabKeyPress)
  window.addEventListener('danmaku-update-buffer', handleUpdateBufferRequest as EventListener)
})

onBeforeUnmount(() => {
  if (editTimeout) {
    clearTimeout(editTimeout)
  }

  if (playbackFrameId !== null) {
    cancelAnimationFrame(playbackFrameId)
  }

  clearPlaybackNodes()
  window.removeEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
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
