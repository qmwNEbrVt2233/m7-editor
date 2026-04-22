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
      
      <!-- 框选矩形 -->
      <div
        v-if="selectionBox.visible"
        class="selection-box"
        :style="{
          left: Math.min(selectionBox.startX, selectionBox.endX) + 'px',
          top: Math.min(selectionBox.startY, selectionBox.endY) + 'px',
          width: Math.abs(selectionBox.endX - selectionBox.startX) + 'px',
          height: Math.abs(selectionBox.endY - selectionBox.startY) + 'px'
        }"
      />
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
  
  if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
    e.preventDefault()
    newScale = scale.value / zoomStep
  } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
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
  const isCtrl = e.ctrlKey || e.metaKey
  const isAlt = e.altKey
  
  // 计算移动的距离
  let panDistance = 0 // 0表示不移动
  
  if (isCtrl && isAlt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // Ctrl+Alt: 移动30000ms (30秒)
    panDistance = 30000
  } else if (isCtrl && !isAlt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // Ctrl: 移动10000ms
    panDistance = 10000
  } else if (!isCtrl && !isAlt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // 普通方向键: 移动播放头到最近的stepMs的整数倍位置（排除当前位置）
    const stepMs = store.playheadStepMs
    const EPS = stepMs * 1e-4
    
    const current = store.currentTime
    const ratio = current / stepMs
    
    function quantizeTime(t: number, step: number) {
      return Math.round(t / step) * step
    }

    let newTime: number
    
    if (e.key === 'ArrowLeft') {
      // 向左
      let base = Math.floor(ratio) * stepMs
      
      // 如果正好在刻度上，则再往前一个step
      if (Math.abs(ratio - Math.round(ratio)) < EPS) {
        base -= stepMs
      }
      
      newTime = Math.max(0, base)
    } else {
      // 向右
      let base = Math.ceil(ratio) * stepMs
      
      // 如果正好在刻度上，则再往后一个step
      if (Math.abs(ratio - Math.round(ratio)) < EPS) {
        base += stepMs
      }
      
      newTime = base
    }

    newTime = quantizeTime(newTime, stepMs)
    
    store.setTime(newTime)
    e.preventDefault()
    return
  }
  
  // 如果需要平移视图
  if (panDistance > 0) {
    e.preventDefault()
    
    // 平移视图
    if (e.key === 'ArrowLeft') {
      offset.value = Math.max(0, offset.value - panDistance)
    } else if (e.key === 'ArrowRight') {
      offset.value = offset.value + panDistance
    }
    
    // 同时平移播放头（Ctrl+方向键和Ctrl+Alt+方向键都平移播放头）
    const stepMs = store.playheadStepMs
    
    function quantizeTime(t: number, step: number) {
      return Math.round(t / step) * step
    }
    let newTime = e.key === 'ArrowLeft'
      ? Math.max(0, store.currentTime - panDistance)
      : store.currentTime + panDistance
    
    newTime = quantizeTime(newTime, stepMs)
    store.setTime(newTime)
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
    position: 'absolute' as const,
    left: (d.startTime - offset.value) * scale.value + 'px',
    width: d.animation.duration * scale.value + 'px',
    top: d.layer * rowHeight + 'px'
  }
}

// ===== 拖动播放头 =====
const dragging = ref(false)

function onMouseDown(e: MouseEvent) {
  // 检测是否在空白处点击（用于框选和取消选择）
  const isOnBlock = (e.target as HTMLElement).closest('.block')
  const isOnHandle = (e.target as HTMLElement).closest('.handle')
  const isCtrlPressed = e.ctrlKey || e.metaKey
  
  // 点击空白处取消所有选择
  if (!isOnBlock && !isOnHandle && !isCtrlPressed) {
    store.clearSelection()
  }
  
  if (isCtrlPressed && !isOnBlock && !isOnHandle) {
    // 进入框选模式
    isBoxSelectingMode.value = true
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tracksElement = document.querySelector('.tracks') as HTMLElement
    const scrollTop = tracksElement.scrollTop
    
    selectionBox.value = {
      visible: true,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top - 20 + scrollTop, // 考虑ruler高度(20px)和scrollTop
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top - 20 + scrollTop
    }
    return
  }
  
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

// 记录拖动时所有选中弹幕的初始状态
interface DragState {
  startTime: number
  layer: number
  duration: number
}
const dragInitialStates = ref<Map<string, DragState>>(new Map())
const dragStartPageX = ref(0)
const dragStartPageY = ref(0)

// 当前操作的弹幕块ID（用于准确标识用户在拖动/resize哪个弹幕块）
const activeBlockId = ref<string | null>(null)

function getLayerDanmakus(layer: number) {
  if (!Array.isArray(store.danmakus)) return []
  return store.danmakus.filter(
    (d) => d && typeof d === 'object' && d.layer === layer
  )
}

function onBlockMouseDown(e: MouseEvent, d: any) {
  const isCtrlPressed = e.ctrlKey || e.metaKey
  
  // Ctrl按下时不进入拖动模式，让onSelect处理多选
  if (isCtrlPressed) {
    return
  }
  
  draggingBlock.value = d
  dragMode.value = 'move'

  if (!store.selectedIds.includes(d.id)) {
    store.selectDanmaku(d.id)
  }

  draggingIds.value = [...store.selectedIds]
  activeBlockId.value = d.id // 标记当前操作的弹幕块
  
  // 记录所有选中弹幕的初始状态
  recordDragInitialStates()
  
  // 根据activeBlockId（被点击的弹幕块）计算基准点
  const activeDanmaku = store.danmakus.find((d: any) => d.id === activeBlockId.value)
  if (activeDanmaku) {
    const activeStartTimeX = (activeDanmaku.startTime - offset.value) * scale.value
    
    const timelineRect = (document.querySelector('.timeline') as HTMLElement).getBoundingClientRect()
    const tracksElement = document.querySelector('.tracks') as HTMLElement
    const scrollTop = tracksElement.scrollTop
    
    dragOffsetX.value = e.clientX - timelineRect.left - activeStartTimeX
    dragOffsetY.value = e.clientY - timelineRect.top
    
    // dragStartLayer应该考虑ruler高度(20px)和scrollTop
    dragStartLayer.value = Math.floor((e.clientY - timelineRect.top - 20 + scrollTop) / rowHeight)
  }
  
  // 记录全局鼠标位置（用于计算多选拖动的delta）
  dragStartPageX.value = e.pageX
  dragStartPageY.value = e.pageY
}

const dragMode = ref<'move' | 'resize-left' | 'resize-right' | null>(null)
const draggingIds = ref<string[]>([])

// 记录拖动开始时的layer（用于正确处理滚动时的layer计算）
const dragStartLayer = ref(0)

// 框选相关
interface SelectionBox {
  visible: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

const selectionBox = ref<SelectionBox>({
  visible: false,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0
})

const isBoxSelectingMode = ref(false)

function recordDragInitialStates() {
  dragInitialStates.value.clear()
  draggingIds.value.forEach(id => {
    const d = store.danmakus.find((d: any) => d.id === id)
    if (d) {
      dragInitialStates.value.set(id, {
        startTime: d.startTime,
        layer: d.layer,
        duration: d.animation.duration
      })
    }
  })
}

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
  activeBlockId.value = d.id // 标记当前操作的弹幕块
  
  // 记录所有选中弹幕的初始状态
  recordDragInitialStates()
  
  // 根据activeBlockId（被点击的弹幕块）计算基准点
  const activeDanmaku = store.danmakus.find((d: any) => d.id === activeBlockId.value)
  if (activeDanmaku) {
    const activeStartTimeX = (activeDanmaku.startTime - offset.value) * scale.value
    const timelineRect = (document.querySelector('.timeline') as HTMLElement).getBoundingClientRect()
    dragOffsetX.value = e.clientX - timelineRect.left - activeStartTimeX
  }
  
  // 记录鼠标位置（用于计算resize的delta）
  dragStartPageX.value = e.pageX
}

// 时间舍入函数，确保精度
function roundTime(time: number) {
  return Math.round(time)
}

function snapTime(time: number) {
  const threshold = 30 // ms 吸附范围

  let targets: number[] = []

  // 播放头
  targets.push(store.currentTime)

  // 所有弹幕起点和结束点（排除正在被拖动的对象）
  store.danmakus.forEach((d: any) => {
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
  // 框选模式
  if (isBoxSelectingMode.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tracksElement = document.querySelector('.tracks') as HTMLElement
    const scrollTop = tracksElement.scrollTop
    
    selectionBox.value.endX = e.clientX - rect.left
    selectionBox.value.endY = e.clientY - rect.top - 20 + scrollTop // 考虑ruler高度(20px)和scrollTop
    return
  }
  
  // 拖动播放头
  if (dragging.value && !dragMode.value) {
    updateTime(e)
    return
  }

  // 拖动弹幕块
  if (!dragMode.value) return

  // 问题3修复：从.tracks获取scrollTop，而不是e.currentTarget（timeline）
  const tracksElement = document.querySelector('.tracks') as HTMLElement
  const scrollTop = tracksElement.scrollTop
  const timelineRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  
  const x = e.clientX - timelineRect.left
  const y = e.clientY - timelineRect.top - 20 + scrollTop // -20是ruler的高度

  const rawTime = x / scale.value + offset.value
  const layer = Math.floor(y / rowHeight)

  if (dragMode.value === 'move') {
    // 批量拖动：基于activeBlockId计算delta，然后应用到所有选中弹幕
    const activeInitial = dragInitialStates.value.get(activeBlockId.value!)
    
    if (activeInitial) {
      // 计算activeBlockId弹幕应该移动到的位置
      let deltaTime = Math.max(0, rawTime - dragOffsetX.value / scale.value) - activeInitial.startTime
      deltaTime = snapTime(activeInitial.startTime + deltaTime) - activeInitial.startTime
      
      // 使用dragStartLayer计算deltaLayer
      const deltaLayer = layer - dragStartLayer.value
      
      // 应用delta给所有选中弹幕
      draggingIds.value.forEach(id => {
        const d = store.danmakus.find((d: any) => d.id === id)
        const initial = dragInitialStates.value.get(id)
        if (!d || !initial) return
        
        d.startTime = Math.max(0, initial.startTime + deltaTime)
        d.layer = Math.max(0, initial.layer + deltaLayer)
      })
    }
  }

  if (dragMode.value === 'resize-left') {
    // 批量左边缩放：基于activeBlockId计算delta，应用到所有选中弹幕
    let leftTime = snapTime(rawTime)
    
    const activeInitial = dragInitialStates.value.get(activeBlockId.value!)
    
    if (activeInitial) {
      // 计算activeBlockId弹幕的startTime改变量
      const end = activeInitial.startTime + activeInitial.duration
      const newStartTime = Math.min(leftTime, end - 50)
      const deltaStartTime = newStartTime - activeInitial.startTime
      
      // 将delta应用到所有选中弹幕
      draggingIds.value.forEach(id => {
        const d = store.danmakus.find((d: any) => d.id === id)
        const initial = dragInitialStates.value.get(id)
        if (!d || !initial) return
        
        const initialEnd = initial.startTime + initial.duration
        const newStart = Math.max(0, initial.startTime + deltaStartTime)
        d.startTime = Math.min(newStart, initialEnd - 50)
        d.animation.duration = Math.round(initialEnd - d.startTime)
      })
    }
  }

  if (dragMode.value === 'resize-right') {
    // 批量右边缩放：基于activeBlockId计算delta，应用到所有选中弹幕
    let rightTime = snapTime(rawTime)
    
    const activeInitial = dragInitialStates.value.get(activeBlockId.value!)
    
    if (activeInitial) {
      // 计算activeBlockId弹幕的duration改变量
      const activeEnd = activeInitial.startTime + activeInitial.duration
      const deltaDuration = rightTime - activeEnd
      
      // 将delta应用到所有选中弹幕
      draggingIds.value.forEach(id => {
        const d = store.danmakus.find((d: any) => d.id === id)
        const initial = dragInitialStates.value.get(id)
        if (!d || !initial) return
        
        const newDuration = Math.max(50, initial.duration + deltaDuration)
        d.animation.duration = newDuration
      })
    }
  }
}

function onMouseUp() {
  // 框选模式处理
  if (isBoxSelectingMode.value) {
    isBoxSelectingMode.value = false
    
    // 计算选择框的边界
    const minX = Math.min(selectionBox.value.startX, selectionBox.value.endX)
    const maxX = Math.max(selectionBox.value.startX, selectionBox.value.endX)
    const minY = Math.min(selectionBox.value.startY, selectionBox.value.endY)
    const maxY = Math.max(selectionBox.value.startY, selectionBox.value.endY)
    
    // 找出被选中的弹幕
    const selectedInBox: string[] = []
    store.danmakus.forEach((d: any) => {
      const blockLeft = (d.startTime - offset.value) * scale.value
      const blockRight = blockLeft + d.animation.duration * scale.value
      const blockTop = d.layer * rowHeight + 20 // +20是因为ruler的高度
      const blockBottom = blockTop + 28
      
      // 检查弹幕块是否与选择框相交
      if (blockRight > minX && blockLeft < maxX && blockBottom > minY && blockTop < maxY) {
        selectedInBox.push(d.id)
      }
    })
    
    // 更新选中状态（框选会替换之前的选择）
    if (selectedInBox.length > 0) {
      store.selectedIds = selectedInBox
    }
    
    selectionBox.value.visible = false
    return
  }
  
  dragging.value = false
  dragMode.value = null
  activeBlockId.value = null // 清除当前操作的弹幕块ID
  
  // 不清空dragInitialStates，在下一次拖动开始时通过recordDragInitialStates()更新
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

.tracks::-webkit-scrollbar {
  width: 8px;
}

.tracks::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.tracks::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 4px;
}

.tracks::-webkit-scrollbar-thumb:hover {
  background: #5a5a5a;
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

.selection-box {
  position: absolute;
  background: rgba(100, 200, 255, 0.2);
  border: 2px solid rgba(100, 200, 255, 0.8);
  pointer-events: none;
  z-index: 5;
}
</style>