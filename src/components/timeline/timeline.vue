<template>
  <div
    class="timeline"
    ref="timelineRef"
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
        :class="{ 'major': tick.isMajor }"
        :style="{ left: tick.x + 'px' }"
      >
        <span v-if="tick.isMajor" class="tick-label">
          {{ tick.label }}
        </span>
      </div>
    </div>

    <!-- 播放头 -->
    <div
      class="playhead"
      :style="{ left: playheadX + 'px' }"
    ></div>

    <!-- 弹幕块 -->
    <div class="tracks" ref="tracksRef" @scroll="onTracksScroll">
      <div
        v-for="layer in visibleLayers"
        :key="layer"
        class="track-row"
        :style="{ top: (layer - 1) * rowHeight + 'px' }"
      >
        <div
          v-for="d in (visibleDanmakusByLayer[layer - 1] || [])"
          :key="d.id"
          class="block"
          :class="{ selected: store.selectedIds.includes(d.id) }"
          :style="getBlockStyle(d)"
          @mousedown.stop="onBlockMouseDown($event, d)"
          @click.stop="onSelect($event, d)"
          @mouseenter="onBlockMouseEnter(d.id)"
          @mouseleave="onBlockMouseLeave"
        >
          <!-- 宽度过小时隐藏文字 -->
          <span v-if="d.animation.duration * scale >= 10">{{ d.content.text }}</span>

          <!-- 手柄只在悬停时渲染 -->
          <template v-if="hoveredBlockId === d.id">
            <div class="handle left" @mousedown.stop="onResizeStart($event, d, 'left')" />
            <div class="handle right" @mousedown.stop="onResizeStart($event, d, 'right')" />
          </template>
        </div>
      </div>

      <!-- 用于显示滚动条的占位符 -->
      <div class="scrollbar-spacer" :style="{ height: scrollbarSpacerHeight + 'px' }"></div>
      
      <!-- 框选矩形 -->
      <div
        v-if="selectionBoxStyle"
        class="selection-box"
        :style="selectionBoxStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useEditorStore } from '../../store/editor'
import { historyManager } from '../../core/history'

const store = useEditorStore()
const timelineRef = ref<HTMLElement | null>(null)
const tracksRef = ref<HTMLElement | null>(null)

// ⭐ 时间轴核心参数
const scale = ref(0.1) // 1ms = 0.1px
const offset = ref(0)

// 可视宽度（从容器动态获取）
const containerWidth = ref(800)

const rowHeight = 30
const RULER_HEIGHT = 20

// ---------- 纵向虚拟滚动相关 ----------
const tracksScrollTop = ref(0)
const tracksViewHeight = ref(0)

function onTracksScroll() {
  if (!tracksRef.value) return
  tracksScrollTop.value = tracksRef.value.scrollTop
}

function updateTracksViewHeight() {
  if (tracksRef.value) {
    tracksViewHeight.value = tracksRef.value.clientHeight
  }
}

// 可见的层范围（1-based）
const visibleLayers = computed(() => {
  const maxLayer = store.maxLayers
  if (maxLayer <= 0) return []
  
  const startIdx = Math.floor(tracksScrollTop.value / rowHeight) // 0-based
  const endIdx = Math.ceil((tracksScrollTop.value + tracksViewHeight.value) / rowHeight)
  const startLayer = Math.max(1, startIdx + 1)
  const endLayer = Math.min(maxLayer, endIdx)
  
  const layers: number[] = []
  for (let i = startLayer; i <= endLayer; i++) {
    layers.push(i)
  }
  return layers
})

let tracksResizeObserver: ResizeObserver | null = null

const hoveredBlockId = ref<string | null>(null)

function onBlockMouseEnter(id: string) {
  hoveredBlockId.value = id
}
function onBlockMouseLeave() {
  hoveredBlockId.value = null
}

// 初始化容器宽度
function initContainerWidth() {
  const timelineEl = timelineRef.value
  if (timelineEl) {
    containerWidth.value = timelineEl.clientWidth
  }
}

function ensurePlayheadVisible() {
  const visibleDuration = containerWidth.value / scale.value
  if (!Number.isFinite(visibleDuration) || visibleDuration <= 0) {
    return
  }

  const currentTime = store.currentTime
  const visibleStart = offset.value
  const visibleEnd = visibleStart + visibleDuration
  const edgePaddingPx = Math.min(containerWidth.value * 1)
  const edgePaddingTime = edgePaddingPx / scale.value

  if (currentTime < visibleStart) {
    offset.value = Math.max(0, currentTime - edgePaddingTime)
    return
  }

  if (currentTime > visibleEnd) {
    offset.value = Math.max(0, currentTime - visibleDuration + edgePaddingTime)
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
  
  // 避免在输入框中触发快捷键
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }
  
  // 计算移动的距离
  let panDistance = 0 // 0表示不移动
  
  if (isCtrl && isAlt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // Ctrl+Alt: 移动30000ms (30秒)
    panDistance = 30000
  } else if (isCtrl && !isAlt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // Ctrl: 移动视图的一半
    panDistance = containerWidth.value * 0.5 / scale.value
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
  
  const isCtrl = e.ctrlKey || e.metaKey
  const isAlt = e.altKey
  const isShift = e.shiftKey
  
  // 避免在输入框中触发快捷键
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }

  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isCtrl && !isAlt && !isShift) {
    if (store.selectedIds.length > 0) {
      e.preventDefault()
      store.moveSelectedLayers(e.key === 'ArrowUp' ? -1 : 1)
    }
    return
  }
  
  // ====== 需求#1：弹幕创建/删除/复制/粘贴 ======
  
  // `;` 创建单条弹幕
  if (e.key === ';' && !isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.createSingleDanmaku()
    console.log('[快捷键] 创建单条弹幕')
    return
  }
  
  // `del` 删除弹幕
  if (e.key === 'Delete' && !isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    if (store.selectedIds.length > 0) {
      store.deleteSelectedDanmakus()
      console.log('[快捷键] 删除选中弹幕')
    }
    return
  }
  
  // `ctrl+c` 复制
  if (e.key === 'c' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.copySelectedDanmakus()
    console.log('[快捷键] 复制弹幕')
    return
  }
  
  // `ctrl+v` 粘贴
  if (e.key === 'v' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.pasteDanmakus().catch((err) => {
      console.error('[快捷键] 粘贴失败:', err)
    })
    console.log('[快捷键] 粘贴弹幕')
    return
  }
  
  // ====== 需求#2：回滚/重做 ======
  
  // `ctrl+z` 撤销
  if (e.key === 'z' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.undo()
    console.log('[快捷键] 撤销')
    return
  }
  
  // `ctrl+y` 重做
  if (e.key === 'y' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.redo()
    console.log('[快捷键] 重做')
    return
  }
  
  // ====== 需求#3：定位播放头到弹幕位置 ======
  
  // `[` 移动播放头到当前操作弹幕的起始位置
  if (e.key === '[' && !isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    if (activeBlockId.value) {
      const danmaku = store.danmakus.find((d: any) => d.id === activeBlockId.value)
      if (danmaku) {
        store.setTime(danmaku.startTime)
        console.log('[快捷键] 移动播放头到弹幕起始位置:', danmaku.startTime)
      }
    } else if (store.selectedIds.length > 0) {
      // 如果没有activeBlockId但有选中的弹幕，使用第一个选中的
      const firstSelected = store.danmakus.find((d: any) => d.id === store.selectedIds[0])
      if (firstSelected) {
        store.setTime(firstSelected.startTime)
        console.log('[快捷键] 移动播放头到弹幕起始位置:', firstSelected.startTime)
      }
    }
    return
  }
  
  // `]` 移动播放头到当前操作弹幕的结束位置
  if (e.key === ']' && !isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    if (activeBlockId.value) {
      const danmaku = store.danmakus.find((d: any) => d.id === activeBlockId.value)
      if (danmaku) {
        const endTime = danmaku.startTime + danmaku.animation.duration
        store.setTime(endTime)
        console.log('[快捷键] 移动播放头到弹幕结束位置:', endTime)
      }
    } else if (store.selectedIds.length > 0) {
      // 如果没有activeBlockId但有选中的弹幕，使用第一个选中的
      const firstSelected = store.danmakus.find((d: any) => d.id === store.selectedIds[0])
      if (firstSelected) {
        const endTime = firstSelected.startTime + firstSelected.animation.duration
        store.setTime(endTime)
        console.log('[快捷键] 移动播放头到弹幕结束位置:', endTime)
      }
    }
    return
  }
  
  // ====== 保存工程快捷键 ======
  
  // `ctrl+d` 保存工程
  if (e.key === 'd' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.saveToLocal()
    console.log('[快捷键] 保存工程')
    return
  }
  
  // ====== 清空缓存快捷键 ======
  
  // `ctrl+del` 清空缓存工程
  if (e.key === 'Delete' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.clearCache()
    console.log('[快捷键] 清空缓存工程')
    return
  }
}

onMounted(() => {
  initContainerWidth()
  updateTracksViewHeight()
  window.addEventListener('keydown', handleKeyboardShortcuts)
  window.addEventListener('resize', () => {
    initContainerWidth()
    updateTracksViewHeight()
  })
  // 初始化时确保第一次垂直范围正确
  if (tracksRef.value) {
    tracksScrollTop.value = tracksRef.value.scrollTop
  }
  if (tracksRef.value) {
    tracksResizeObserver = new ResizeObserver(() => {
      updateTracksViewHeight()
    })
    tracksResizeObserver.observe(tracksRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  window.removeEventListener('resize', initContainerWidth)
  if (offsetAnimationFrame !== null) {
    cancelAnimationFrame(offsetAnimationFrame)
  }
  if (tracksResizeObserver) {
    tracksResizeObserver.disconnect()
    tracksResizeObserver = null
  }
})

watch(
  () => store.currentTime,
  () => {
    ensurePlayheadVisible()
  }
)

// ===== 刻度计算 =====
// 预设步长
const TIME_STEPS = [100, 500, 1000, 2000, 5000, 10000]

const ticks = computed(() => {
  const list = []
  
  // 目标：主刻度之间的物理间距保持在 80px - 160px 左右
  const targetPx = 100
  const idealStep = targetPx / scale.value
  
  // 找到最合适的步长
  const step = TIME_STEPS.find(s => s >= idealStep) || 20000
  // 子刻度：固定将主刻度五等分
  const subStep = step / 5

  const start = Math.floor(offset.value / subStep) * subStep
  const end = offset.value + containerWidth.value / scale.value

  for (let t = start; t < end; t += subStep) {
    const currentTime = Math.round(t * 1000) / 1000 // 防止浮点误差
    const isMajor = Math.abs(currentTime % step) < 0.001

    list.push({
      time: currentTime,
      x: (currentTime - offset.value) * scale.value,
      isMajor,
      // 只有主刻度返回格式化后的数字串，子刻度不返回内容
      label: isMajor ? formatTime(currentTime) : ''
    })
  }

  return list
})

// 无单位格式化：1000ms -> 1, 1500ms -> 1.5, 500ms -> 500
function formatTime(ms: number) {
  if (ms === 0) return '0'
  return parseFloat((ms / 1000).toFixed(2)).toString()
}

// ===== 播放头 =====
const playheadX = computed(() => {
  return (store.currentTime - offset.value) * scale.value
})

const scrollbarSpacerHeight = computed(() => {
  return Math.max(store.maxLayers * rowHeight, rowHeight)
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

// ---------- 横向虚拟滚动 ----------
const visibleDanmakusByLayer = computed(() => {
  const map: Record<number, any[]> = {}
  if (!Array.isArray(store.danmakus)) return map
  const visStart = offset.value
  const visEnd = offset.value + containerWidth.value / scale.value
  for (const d of store.danmakus) {
    if (!d || typeof d !== 'object') continue
    const blockStart = d.startTime
    const blockEnd = d.startTime + d.animation.duration
    // 相交即渲染
    if (blockEnd >= visStart && blockStart <= visEnd) {
      const layer = d.layer
      if (!map[layer]) map[layer] = []
      map[layer].push(d)
    }
  }
  return map
})

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
    lastAutoScrollAt = 0
    const anchorTime = getTimeFromClientX(e.clientX)
    const anchorLayer = getLayerFromClientY(e.clientY)

    selectionBox.value = {
      visible: true,
      anchorTime,
      anchorLayer,
      anchorClientX: e.clientX,
      anchorClientY: e.clientY,
      pointerClientX: e.clientX,
      pointerClientY: e.clientY
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
const dragInteractionChanged = ref(false)

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

let hasRecordedSnapshotDuringDrag = false
let hasRecordedSnapshotDuringResize = false
let lastAutoScrollAt = 0
let offsetAnimationFrame: number | null = null

const AUTO_SCROLL_X_TRIGGER_PX = 50
const AUTO_SCROLL_Y_TRIGGER_PX = 20
const AUTO_SCROLL_X_STEP_PX = 130
const AUTO_SCROLL_Y_STEP_PX = 30
const AUTO_SCROLL_INTERVAL_MS = 100
const DRAG_THRESHOLD_PX = 3

function animateOffsetTo(targetOffset: number) {
  const clampedTarget = Math.max(0, targetOffset)
  if (!Number.isFinite(clampedTarget)) {
    return
  }

  if (offsetAnimationFrame !== null) {
    cancelAnimationFrame(offsetAnimationFrame)
  }

  const startOffset = offset.value
  const delta = clampedTarget - startOffset
  if (Math.abs(delta) < 0.001) {
    offset.value = clampedTarget
    return
  }

  const startTime = performance.now()
  const duration = 120

  const step = (now: number) => {
    const progress = Math.min(1, (now - startTime) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    offset.value = startOffset + delta * eased

    if (progress < 1) {
      offsetAnimationFrame = requestAnimationFrame(step)
    } else {
      offset.value = clampedTarget
      offsetAnimationFrame = null
    }
  }

  offsetAnimationFrame = requestAnimationFrame(step)
}

function maybeAutoScrollDuringDrag(e: MouseEvent) {
  if ((!dragMode.value && !isBoxSelectingMode.value) || !timelineRef.value || !tracksRef.value) {
    return
  }

  const now = performance.now()
  if (now - lastAutoScrollAt < AUTO_SCROLL_INTERVAL_MS) {
    return
  }

  const timelineRect = timelineRef.value.getBoundingClientRect()
  const tracksRect = tracksRef.value.getBoundingClientRect()
  let didScroll = false

  if (e.clientX <= timelineRect.left + AUTO_SCROLL_X_TRIGGER_PX) {
    animateOffsetTo(offset.value - AUTO_SCROLL_X_STEP_PX / scale.value)
    didScroll = true
  } else if (e.clientX >= timelineRect.right - AUTO_SCROLL_X_TRIGGER_PX) {
    animateOffsetTo(offset.value + AUTO_SCROLL_X_STEP_PX / scale.value)
    didScroll = true
  }

  if (e.clientY <= tracksRect.top + AUTO_SCROLL_Y_TRIGGER_PX) {
    const nextTop = Math.max(0, tracksRef.value.scrollTop - AUTO_SCROLL_Y_STEP_PX)
    if (nextTop !== tracksRef.value.scrollTop) {
      tracksRef.value.scrollTo({ top: nextTop, behavior: 'smooth' })
      didScroll = true
    }
  } else if (e.clientY >= tracksRect.bottom - AUTO_SCROLL_Y_TRIGGER_PX) {
    const maxScrollTop = Math.max(0, tracksRef.value.scrollHeight - tracksRef.value.clientHeight)
    const nextTop = Math.min(maxScrollTop, tracksRef.value.scrollTop + AUTO_SCROLL_Y_STEP_PX)
    if (nextTop !== tracksRef.value.scrollTop) {
      tracksRef.value.scrollTo({ top: nextTop, behavior: 'smooth' })
      didScroll = true
    }
  }

  if (didScroll) {
    lastAutoScrollAt = now
  }
}

function onBlockMouseDown(e: MouseEvent, d: any) {
  const isCtrlPressed = e.ctrlKey || e.metaKey
  // Ctrl按下时不进入拖动模式，让onSelect处理多选
  if (isCtrlPressed) {
    return
  }
  
  draggingBlock.value = d
  dragMode.value = 'move'
  hasRecordedSnapshotDuringDrag = false
  dragInteractionChanged.value = false
  lastAutoScrollAt = 0

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
    
    const timelineRect = timelineRef.value?.getBoundingClientRect()
    const tracksElement = tracksRef.value
    if (!timelineRect || !tracksElement) return
    const scrollTop = tracksElement.scrollTop
    
    dragOffsetX.value = e.clientX - timelineRect.left - activeStartTimeX
    dragOffsetY.value = e.clientY - timelineRect.top
    
    // dragStartLayer应该考虑ruler高度和scrollTop
    dragStartLayer.value = Math.floor((e.clientY - timelineRect.top - RULER_HEIGHT + scrollTop) / rowHeight)

    window.addEventListener('mousemove', onGlobalMouseMove)
    window.addEventListener('mouseup', onGlobalMouseUp)
  }
  
  // 记录全局鼠标位置（用于计算多选拖动的delta）
  dragStartPageX.value = e.pageX
  dragStartPageY.value = e.pageY
}

function onGlobalMouseMove(e: MouseEvent) {
  if (!dragMode.value) return

  // 计算位移距离，防止极其微小的抖动误触发
  const dx = Math.abs(e.pageX - dragStartPageX.value)
  const dy = Math.abs(e.pageY - dragStartPageY.value)

  if (dragMode.value === 'move' && (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) && !hasRecordedSnapshotDuringDrag) {
    hasRecordedSnapshotDuringDrag = true
    dragInteractionChanged.value = true
  }

  if ((dragMode.value === 'resize-left' || dragMode.value === 'resize-right') && dx > DRAG_THRESHOLD_PX && !hasRecordedSnapshotDuringResize) {
    hasRecordedSnapshotDuringResize = true
    dragInteractionChanged.value = true
  }

  onMouseMove(e) 
}

function onGlobalMouseUp() {
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup', onGlobalMouseUp)
  finishBlockInteraction()
}

function finishBlockInteraction() {
  const completedMode = dragMode.value

  if (dragInteractionChanged.value && completedMode) {
    historyManager.recordSnapshot(
      store.danmakus,
      completedMode === 'move' ? '拖动弹幕' : '调整弹幕时长'
    )
    store._clearPendingChangeTracking()
  }

  dragMode.value = null
  draggingBlock.value = null
  activeBlockId.value = null
  draggingIds.value = []
  dragInteractionChanged.value = false
  hasRecordedSnapshotDuringDrag = false
  hasRecordedSnapshotDuringResize = false
}

const dragMode = ref<'move' | 'resize-left' | 'resize-right' | null>(null)
const draggingIds = ref<string[]>([])

// 记录拖动开始时的layer（用于正确处理滚动时的layer计算）
const dragStartLayer = ref(0)

// 框选相关
interface SelectionBox {
  visible: boolean
  anchorTime: number
  anchorLayer: number
  anchorClientX: number
  anchorClientY: number
  pointerClientX: number
  pointerClientY: number
}

const selectionBox = ref<SelectionBox>({
  visible: false,
  anchorTime: 0,
  anchorLayer: 0,
  anchorClientX: 0,
  anchorClientY: 0,
  pointerClientX: 0,
  pointerClientY: 0
})

// 框选相关
const isBoxSelectingMode = ref(false)

function clampLayer(layer: number) {
  return Math.max(0, Math.min(store.maxLayers - 1, layer))
}

function getTimeFromClientX(clientX: number) {
  const rect = timelineRef.value?.getBoundingClientRect()
  if (!rect) {
    return 0
  }

  const x = clientX - rect.left
  return roundTime(Math.max(0, x / scale.value + offset.value))
}

function getLayerFromClientY(clientY: number) {
  const tracksRect = tracksRef.value?.getBoundingClientRect()
  if (!tracksRect) {
    return 0
  }

  const y = clientY - tracksRect.top + tracksScrollTop.value
  return clampLayer(Math.floor(y / rowHeight))
}

const selectionRange = computed(() => {
  if (!selectionBox.value.visible) {
    return null
  }

  const pointerTime = getTimeFromClientX(selectionBox.value.pointerClientX)
  const pointerLayer = getLayerFromClientY(selectionBox.value.pointerClientY)

  return {
    minTime: Math.min(selectionBox.value.anchorTime, pointerTime),
    maxTime: Math.max(selectionBox.value.anchorTime, pointerTime),
    minLayer: Math.min(selectionBox.value.anchorLayer, pointerLayer),
    maxLayer: Math.max(selectionBox.value.anchorLayer, pointerLayer)
  }
})

const selectionBoxStyle = computed(() => {
  if (!selectionRange.value) {
    return null
  }

  return {
    left: (selectionRange.value.minTime - offset.value) * scale.value + 'px',
    top: selectionRange.value.minLayer * rowHeight + 'px',
    width: (selectionRange.value.maxTime - selectionRange.value.minTime) * scale.value + 'px',
    height: (selectionRange.value.maxLayer - selectionRange.value.minLayer + 1) * rowHeight + 'px'
  }
})

function resetSelectionBox() {
  selectionBox.value = {
    visible: false,
    anchorTime: 0,
    anchorLayer: 0,
    anchorClientX: 0,
    anchorClientY: 0,
    pointerClientX: 0,
    pointerClientY: 0
  }
}

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
  dragInteractionChanged.value = false
  hasRecordedSnapshotDuringResize = false
  lastAutoScrollAt = 0

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
    const timelineRect = timelineRef.value?.getBoundingClientRect()
    if (!timelineRect) return
    dragOffsetX.value = e.clientX - timelineRect.left - activeStartTimeX
  }
  
  // 记录鼠标位置（用于计算resize的delta）
  dragStartPageX.value = e.pageX
  dragStartPageY.value = e.pageY

  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
}

// 时间舍入函数，确保精度
function roundTime(time: number) {
  return Math.round(time)
}

const SNAP_DISTANCE_PX = 5
const MIN_BLOCK_DURATION = 10

function getSnapThresholdMs() {
  return SNAP_DISTANCE_PX / scale.value
}

function getSnapTargets() {
  const targets: number[] = [store.currentTime]

  // 所有弹幕起点和结束点（排除正在被拖动的对象）
  store.danmakus.forEach((d: any) => {
    if (!draggingIds.value.includes(d.id)) {
      targets.push(d.startTime)
      targets.push(d.startTime + d.animation.duration)
    }
  })

  return targets
}

function snapTime(time: number) {
  const threshold = getSnapThresholdMs()
  const targets = getSnapTargets()

  let closestTarget: number | null = null
  let minDistance = Infinity

  for (const target of targets) {
    const distance = Math.abs(target - time)
    if (distance < minDistance) {
      minDistance = distance
      closestTarget = target
    }
  }

  if (closestTarget !== null && minDistance <= threshold) {
    return roundTime(closestTarget)
  }

  return roundTime(time)
}

function snapMoveStartTime(startTime: number, duration: number) {
  const threshold = getSnapThresholdMs()
  const targets = getSnapTargets()
  const endTime = startTime + duration

  let snappedStartTime = startTime
  let minDistance = Infinity

  for (const target of targets) {
    const startDistance = Math.abs(target - startTime)
    if (startDistance < minDistance) {
      minDistance = startDistance
      snappedStartTime = target
    }

    const endDistance = Math.abs(target - endTime)
    if (endDistance < minDistance) {
      minDistance = endDistance
      snappedStartTime = target - duration
    }
  }

  if (minDistance <= threshold) {
    return roundTime(Math.max(0, snappedStartTime))
  }

  return roundTime(Math.max(0, startTime))
}

function onMouseMove(e: MouseEvent) {
  // 框选模式
  if (isBoxSelectingMode.value) {
    selectionBox.value.pointerClientX = e.clientX
    selectionBox.value.pointerClientY = e.clientY
    maybeAutoScrollDuringDrag(e)
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
  const tracksElement = tracksRef.value
  const currentTimeline = timelineRef.value
  if (!tracksElement || !currentTimeline) return
  const scrollTop = tracksElement.scrollTop
  const timelineRect = currentTimeline.getBoundingClientRect()
  
  const x = e.clientX - timelineRect.left
  const y = e.clientY - timelineRect.top - RULER_HEIGHT + scrollTop // ruler高度补偿

  const rawTime = x / scale.value + offset.value
  const layer = clampLayer(Math.floor(y / rowHeight))

  if (dragMode.value === 'move') {
    // 批量拖动：基于activeBlockId计算delta，然后应用到所有选中弹幕
    const activeInitial = dragInitialStates.value.get(activeBlockId.value!)
    
    if (activeInitial) {
      // 计算activeBlockId弹幕应该移动到的位置
      const rawStartTime = Math.max(0, rawTime - dragOffsetX.value / scale.value)
      const snappedStartTime = snapMoveStartTime(rawStartTime, activeInitial.duration)
      const deltaTime = snappedStartTime - activeInitial.startTime
      
      // 使用dragStartLayer计算deltaLayer
      const initialLayers = draggingIds.value
        .map((id) => dragInitialStates.value.get(id)?.layer)
        .filter((value): value is number => value !== undefined)
      const minInitialLayer = initialLayers.length > 0 ? Math.min(...initialLayers) : 0
      const maxInitialLayer = initialLayers.length > 0 ? Math.max(...initialLayers) : 0
      const proposedDeltaLayer = layer - dragStartLayer.value
      const deltaLayer = Math.min(
        (store.maxLayers - 1) - maxInitialLayer,
        Math.max(-minInitialLayer, proposedDeltaLayer)
      )
      
      // 应用delta给所有选中弹幕
      draggingIds.value.forEach(id => {
        const d = store.danmakus.find((d: any) => d.id === id)
        const initial = dragInitialStates.value.get(id)
        if (!d || !initial) return
        
        d.startTime = Math.max(0, initial.startTime + deltaTime)
        d.layer = Math.max(0, Math.min(store.maxLayers - 1, initial.layer + deltaLayer))
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
      const newStartTime = Math.min(leftTime, end - MIN_BLOCK_DURATION)
      const deltaStartTime = newStartTime - activeInitial.startTime
      
      // 将delta应用到所有选中弹幕
      draggingIds.value.forEach(id => {
        const d = store.danmakus.find((d: any) => d.id === id)
        const initial = dragInitialStates.value.get(id)
        if (!d || !initial) return
        
        const initialEnd = initial.startTime + initial.duration
        const newStart = Math.max(0, initial.startTime + deltaStartTime)
        d.startTime = Math.min(newStart, initialEnd - MIN_BLOCK_DURATION)
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
        
        const newDuration = Math.max(MIN_BLOCK_DURATION, initial.duration + deltaDuration)
        d.animation.duration = newDuration
      })
    }
  }

  maybeAutoScrollDuringDrag(e)
}

function onMouseUp() {
  // 框选模式处理
  if (isBoxSelectingMode.value) {
    isBoxSelectingMode.value = false
    const range = selectionRange.value
    
    // 找出被选中的弹幕
    const selectedInBox: string[] = []
    if (range) {
      store.danmakus.forEach((d: any) => {
        const blockStart = d.startTime
        const blockEnd = d.startTime + d.animation.duration
        const intersectsTime = blockEnd > range.minTime && blockStart < range.maxTime
        const intersectsLayer = d.layer >= range.minLayer && d.layer <= range.maxLayer

        if (intersectsTime && intersectsLayer) {
          selectedInBox.push(d.id)
        }
      })
    }
    
    // 更新选中状态（框选会替换之前的选择）
    if (selectedInBox.length > 0) {
      store.selectedIds = selectedInBox
    }
    
    resetSelectionBox()
    return
  }
  
  dragging.value = false
  if (dragMode.value) {
    finishBlockInteraction()
  }
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

/* 基础刻度线（子刻度） */
.tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  height: 6px;
  background: #555;
}

/* 主刻度线 */
.tick.major {
  height: 12px;
  background: #888;
}

/* 刻度数字 */
.tick-label {
  position: absolute;
  top: -2px;
  left: 4px;
  color: #aaa;
  font-size: 10px;
  font-family: monospace;
  white-space: nowrap;
  pointer-events: none; /* 防止文字干扰鼠标事件 */
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
  scroll-behavior: smooth;
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