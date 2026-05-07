<template>
  <div class="layer">
    <div
      v-for="(d, index) in visibleDanmakus"
      :key="d.id"
      class="danmaku"
      :style="getStyle(d, +index)"
    >
      <div
        class="danmaku-content"
        v-html="formatText(d.content.text)"
      ></div>
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
const PRELOAD_THRESHOLD = 2000 // 预加载阈值：2秒
const JITTER_TOLERANCE = 500 // 抖动容差：500ms（解决视频时间微小倒退导致的频繁重算）
const TOOLBAR_MEASURE_EVENT = 'toolbar-measure-danmakus'

type ToolbarMeasureRequest = {
  requestId: string
  danmaku: DanmakuItem
}

type ToolbarMeasureResponse = Record<string, { width: number; height: number }>

type ToolbarMeasureEventDetail = {
  requests: ToolbarMeasureRequest[]
  resolve: (result: ToolbarMeasureResponse) => void
  reject: (reason?: unknown) => void
}

// 使用 shallowRef 拒绝深度 Proxy 劫持
const activeBuffer = shallowRef<DanmakuItem[]>([])
const ghostRequests = ref<ToolbarMeasureRequest[]>([])
const ghostElements = new Map<string, HTMLDivElement>()

let currentBufferStart = -1
let currentBufferEnd = -1

const danmakuBufferSignature = computed(() => {
  return store.danmakus
    .map((d: DanmakuItem) => `${d.id}|${d.layer}|${d.startTime}|${d.animation.duration}`)
    .join(';')
})

// 低频刷新核心
function updateBuffer(time: number) {
  console.log(`[Buffer] 正在重构缓冲池，当前时间: ${time}`)
  currentBufferStart = time
  currentBufferEnd = time + BUFFER_WINDOW

  activeBuffer.value = store.danmakus.filter((d: DanmakuItem) => {
    const dEnd = d.startTime + d.animation.duration
    return dEnd >= currentBufferStart && d.startTime <= currentBufferEnd
  })
  console.log(`缓存池大小：${activeBuffer.value.length}条弹幕`)
}

// 监听时间轴：加入容差判断
watch(() => store.currentTime, (newTime) => {
  // 减去 JITTER_TOLERANCE，忽略播放器的微小时间回退
  if (
    newTime < currentBufferStart - JITTER_TOLERANCE ||
    newTime > currentBufferEnd - PRELOAD_THRESHOLD
  ) {
    updateBuffer(newTime)
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

// --- 高频刷新：实时可见弹幕 ---
const visibleDanmakus = computed(() => {
  const time = store.currentTime

  const filtered = activeBuffer.value.filter((d: DanmakuItem) => {
    return time >= d.startTime && time <= d.startTime + d.animation.duration
  })

  return filtered.sort((a: DanmakuItem, b: DanmakuItem) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    const layerA = a.layer || 0
    const layerB = b.layer || 0
    return layerA - layerB
  })
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

function getRenderState(d: DanmakuItem) {
  const currentTime = store.currentTime
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

function buildBaseStyle(d: DanmakuItem, index: number) {
  return {
    position: 'absolute' as const,
    zIndex: index,
    color: d.content.color,
    fontSize: `${d.content.size}px`,
    fontFamily: d.content.font,
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

// 核心样式计算
function getStyle(d: DanmakuItem, index: number) {
  const { x, y, opacity } = getRenderState(d)
  const transform = `
    translate3d(${x}px, ${y}px, 0)
    rotateZ(${d.transform.zRotate}deg)
    rotateY(${360 - d.transform.yRotate}deg)
  `

  return {
    ...buildBaseStyle(d, index),
    transform,
    opacity,
    willChange: 'transform, opacity'
  }
}

// 幽灵层复用同一套文本渲染样式，只去掉位移，便于测量真实包围盒。
function getGhostStyle(d: DanmakuItem, index: number) {
  const transform = `
    translate3d(0px, 0px, 0)
    rotateZ(${d.transform.zRotate}deg)
    rotateY(${360 - d.transform.yRotate}deg)
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
      const element = ghostElements.get(request.requestId)
      if (!element) {
        return
      }

      const rect = element.getBoundingClientRect()
      result[request.danmaku.id] = {
        width: rect.width,
        height: rect.height
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

onMounted(() => {
  window.addEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
})

onBeforeUnmount(() => {
  if (editTimeout) {
    clearTimeout(editTimeout)
  }

  window.removeEventListener(TOOLBAR_MEASURE_EVENT, handleToolbarMeasure as EventListener)
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
