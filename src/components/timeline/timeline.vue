<template>
  <div
    class="timeline"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
  >
    <!-- 刻度 -->
    <div class="ruler">
      <div
        v-for="tick in ticks"
        :key="tick.time"
        class="tick"
        :style="{ left: tick.x + 'px' }"
      >
        {{ formatTime(tick.time) }}
      </div>
    </div>

    <!-- 播放头 -->
    <div
      class="playhead"
      :style="{ left: playheadX + 'px' }"
    ></div>

    <!-- 弹幕块 -->
    <div class="tracks">
      <div
        v-for="layer in 100"
        :key="layer"
        class="track-row"
        :style="{ top: (layer - 1) * rowHeight + 'px' }"
      >
        <!-- 当前layer的弹幕 -->
        <div
          v-for="d in getLayerDanmakus(layer - 1)"
          :key="d.id"
          class="block"
          :class="{ selected: store.selectedIds.includes(d.id) }"
          :style="getBlockStyle(d)"
          @mousedown.stop="onBlockMouseDown($event, d)"
          @click.stop="onSelect($event, d)"
        >
          <div class="handle left" @mousedown.stop="onResizeStart($event, d, 'left')" />
          <div class="handle right" @mousedown.stop="onResizeStart($event, d, 'right')" />
          {{ d.content.text }}
        </div>
      </div>

      <!-- 用于显示滚动条的占位符 -->
      <div class="scrollbar-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

// ⭐ 时间轴核心参数
const scale = ref(0.1) // 1ms = 0.1px
const offset = ref(0)

// 可视宽度（从容器动态获取）
const containerWidth = ref(800)

// 刻度间隔（1秒）
const step = 1000

const rowHeight = 30

// 初始化容器宽度
function initContainerWidth() {
  const timelineEl = document.querySelector('.timeline')
  if (timelineEl) {
    containerWidth.value = timelineEl.clientWidth
  }
}

// ===== 缩放功能 =====
function handleZoom(e: KeyboardEvent) {
  const minScale = 0.01 // 最小缩放 1ms = 0.01px
  const maxScale = 1 // 最大缩放 1ms = 1px
  const zoomStep = 1.2
  
  let newScale = scale.value
  
  if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    newScale = scale.value / zoomStep
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    newScale = scale.value * zoomStep
  } else {
    return
  }
  
  // 限制缩放范围
  newScale = Math.max(minScale, Math.min(maxScale, newScale))
  
  // 以播放头位置缩放（保持播放头位置不变）
  const playheadTime = store.currentTime
  const oldPlayheadX = (playheadTime - offset.value) * scale.value
  
  scale.value = newScale
  
  // 调整offset使播放头保持在同一位置，并限制最小值为0
  let newOffset = playheadTime - oldPlayheadX / newScale
  offset.value = Math.max(0, newOffset)
}

// ===== 平移功能 =====
function handlePan(e: KeyboardEvent) {
  const panStep = 10000 // 每次平移10000ms
  
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    offset.value = Math.max(0, offset.value - panStep)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    offset.value = offset.value + panStep
  }
}

function handleKeyboardShortcuts(e: KeyboardEvent) {
  handleZoom(e)
  handlePan(e)
}

onMounted(() => {
  initContainerWidth()
  window.addEventListener('keydown', handleKeyboardShortcuts)
  window.addEventListener('resize', initContainerWidth)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  window.removeEventListener('resize', initContainerWidth)
})

// ===== 刻度计算 =====
const ticks = computed(() => {
  const list = []

  const start = Math.floor(offset.value / step) * step
  const end = offset.value + containerWidth.value / scale.value

  for (let t = start; t < end; t += step) {
    list.push({
      time: t,
      x: (t - offset.value) * scale.value
    })
  }

  return list
})

function formatTime(ms: number) {
  return (ms / 1000).toFixed(1)
}

// ===== 播放头 =====
const playheadX = computed(() => {
  return (store.currentTime - offset.value) * scale.value
})

// ===== 弹幕块 =====
function getBlockStyle(d: any) {
  return {
    position: 'absolute',
    left: (d.startTime - offset.value) * scale.value + 'px',
    width: d.animation.duration * scale.value + 'px',
    top: d.layer * rowHeight + 'px'
  }
}

// ===== 拖动播放头 =====
const dragging = ref(false)

function onMouseDown(e: MouseEvent) {
  dragging.value = true
  updateTime(e)
}

function updateTime(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  const x = e.clientX - rect.left

  const time = roundTime(x / scale.value + offset.value)

  store.setTime(time)
}

const draggingBlock = ref<null | any>(null)
const dragOffsetX = ref(0)
const dragOffsetY = ref(0)

function getLayerDanmakus(layer: number) {
  if (!Array.isArray(store.danmakus)) return []
  return store.danmakus.filter(
    (d) => d && typeof d === 'object' && d.layer === layer
  )
}

function onBlockMouseDown(e: MouseEvent, d: any) {
  draggingBlock.value = d

  const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  // 记录鼠标相对于弹幕块左上角的偏移
  dragOffsetX.value = e.clientX - blockRect.left
  dragOffsetY.value = e.clientY - blockRect.top
  dragMode.value = 'move'

  if (!store.selectedIds.includes(d.id)) {
    store.selectDanmaku(d.id)
  }

  draggingIds.value = [...store.selectedIds]
}

const dragMode = ref<'move' | 'resize-left' | 'resize-right' | null>(null)
const draggingIds = ref<string[]>([])

function onSelect(e: MouseEvent, d: any) {
  const multi = e.ctrlKey || e.metaKey
  store.selectDanmaku(d.id, multi)
}

function onResizeStart(e: MouseEvent, d: any, side: 'left' | 'right') {
  dragMode.value = side === 'left' ? 'resize-left' : 'resize-right'

  if (!store.selectedIds.includes(d.id)) {
    store.selectDanmaku(d.id)
  }

  draggingIds.value = [...store.selectedIds]
}

// 时间舍入函数，确保精度
function roundTime(time: number) {
  return Math.round(time)
}

function snapTime(time: number) {
  const threshold = 100 // 100ms 吸附范围

  let targets: number[] = []

  // 播放头
  targets.push(store.currentTime)

  // 所有弹幕起点和结束点（排除正在被拖动的对象）
  store.danmakus.forEach(d => {
    if (!draggingIds.value.includes(d.id)) {
      targets.push(d.startTime)
      targets.push(d.startTime + d.animation.duration)
    }
  })

  // 找最近的吸附点
  let closestTarget = null
  let minDistance = Infinity

  for (let t of targets) {
    const distance = Math.abs(t - time)
    if (distance < minDistance) {
      minDistance = distance
      closestTarget = t
    }
  }

  // 如果最近的点在阈值范围内，就吸附到它，否则返回原时间
  if (closestTarget !== null && minDistance < threshold) {
    return roundTime(closestTarget)
  }

  return roundTime(time)
}

function onMouseMove(e: MouseEvent) {
  // 拖动播放头
  if (dragging.value && !dragMode.value) {
    updateTime(e)
    return
  }

  // 拖动弹幕块
  if (!dragMode.value) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const rawTime = x / scale.value + offset.value
  const layer = Math.floor(y / rowHeight)

  draggingIds.value.forEach(id => {
    const d = store.danmakus.find(d => d.id === id)
    if (!d) return

    if (dragMode.value === 'move') {
      // 先计算实际 startTime，再吸附，最后舍入
      let startTime = Math.max(0, rawTime - dragOffsetX.value / scale.value)
      startTime = snapTime(startTime)
      d.startTime = startTime
      d.layer = Math.max(0, layer - Math.floor(dragOffsetY.value / rowHeight))
    }

    if (dragMode.value === 'resize-left') {
      // 左边缩放吸附
      let leftTime = snapTime(rawTime)
      const end = d.startTime + d.animation.duration
      d.startTime = Math.min(leftTime, end - 50)
      d.animation.duration = Math.round(end - d.startTime)
    }

    if (dragMode.value === 'resize-right') {
      // 右边缩放吸附
      let rightTime = snapTime(rawTime)
      d.animation.duration = Math.max(50, Math.round(rightTime - d.startTime))
    }
  })
}

function onMouseUp() {
  dragging.value = false
  dragMode.value = null
  draggingIds.value = []
}
</script>

<style scoped>
.timeline {
  position: relative;
  width: 100%;
  height: 100%;
  background: #222;
  user-select: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 刻度 */
.ruler {
  position: relative;
  height: 20px;
  background: #333;
  border-bottom: 1px solid #444;
  overflow: hidden;
  flex-shrink: 0;
}

.tick {
  position: absolute;
  top: 0;
  color: #aaa;
  font-size: 10px;
  white-space: nowrap;
  padding: 2px 4px;
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: red;
  z-index: 10;
  pointer-events: none;
}

/* 轨道 */
.tracks {
  position: relative;
  flex: 1;
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.block {
  position: absolute;
  height: 28px;
  background: #4caf50;
  color: white;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  border-radius: 2px;
  padding: 0 4px;
  line-height: 28px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  clip-path: inset(0);
  outline: 2px solid #d8d8d8;
  outline-offset: -2px;
}

.block:hover {
  background: #66bb6a;
}

.block.selected {
  outline: 2px solid yellow;
  outline-offset: -2px;
  background: #81c784;
  z-index: 1000;
}

.handle {
  position: absolute;
  width: 6px;
  top: 0;
  bottom: 0;
  background: #fff;
  cursor: ew-resize;
  opacity: 0;
  transition: opacity 0.2s;
}

.block:hover .handle {
  opacity: 1;
}

.handle.left {
  left: 0;
}

.handle.right {
  right: 0;
}

.scrollbar-spacer {
  position: relative;
  height: 3000px;
  pointer-events: none;
}
</style>