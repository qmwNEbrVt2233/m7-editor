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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

// ⭐ 时间轴核心参数
const scale = 0.1 // 1ms = 0.1px
const offset = ref(0)

// 可视宽度
const width = 800

// 刻度间隔（1秒）
const step = 1000

// ===== 刻度计算 =====
const ticks = computed(() => {
  const list = []

  const start = Math.floor(offset.value / step) * step
  const end = offset.value + width / scale

  for (let t = start; t < end; t += step) {
    list.push({
      time: t,
      x: (t - offset.value) * scale
    })
  }

  return list
})

function formatTime(ms: number) {
  return (ms / 1000).toFixed(1)
}

// ===== 播放头 =====
const playheadX = computed(() => {
  return (store.currentTime - offset.value) * scale
})

// ===== 弹幕块 =====
function getBlockStyle(d: any) {
  return {
    position: 'absolute',
    left: (d.startTime - offset.value) * scale + 'px',
    width: d.animation.duration * scale + 'px',
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

  const time = x / scale + offset.value

  store.setTime(time)
}

const rowHeight = 30

function getLayerDanmakus(layer: number) {
  if (!Array.isArray(store.danmakus)) return []
  return store.danmakus.filter(
  (d) => d && typeof d === 'object' && d.layer === layer
  )
}

const draggingBlock = ref<null | any>(null)
const dragOffsetX = ref(0)
const dragOffsetY = ref(0)

function onBlockMouseDown(e: MouseEvent, d: any) {
  draggingBlock.value = d

  const rect = (e.target as HTMLElement).getBoundingClientRect()

  dragOffsetX.value = e.clientX - rect.left
  dragOffsetY.value = e.clientY - rect.top
  dragMode.value = 'move'

  if (!store.selectedIds.includes(d.id)) {
    store.selectDanmaku(d.id)
  }

  draggingIds.value = [...store.selectedIds]
}

function updateBlockDrag(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  const x = e.clientX - rect.left - dragOffsetX.value
  const y = e.clientY - rect.top - dragOffsetY.value

  // 时间
  const newTime = x / scale + offset.value

  // layer（关键）
  const newLayer = Math.floor(y / rowHeight)

  store.updateDanmaku(draggingBlock.value.id, {
    startTime: Math.max(0, newTime),
    layer: Math.max(0, newLayer)
  })
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

function snapTime(time: number) {
  const threshold = 100 // 100ms 吸附范围

  let targets: number[] = []

  // 播放头
  targets.push(store.currentTime)

  // 所有弹幕起点
  store.danmakus.forEach(d => {
    targets.push(d.startTime)
    targets.push(d.startTime + d.animation.duration)
  })

  for (let t of targets) {
    if (Math.abs(t - time) < threshold) {
      return t
    }
  }

  return time
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

  const time = snapTime(x / scale + offset.value)
  const layer = Math.floor(y / rowHeight)

  draggingIds.value.forEach(id => {
    const d = store.danmakus.find(d => d.id === id)
    if (!d) return

    if (dragMode.value === 'move') {
      d.startTime = Math.max(0, time)
      d.layer = Math.max(0, layer)
    }

    if (dragMode.value === 'resize-left') {
      const end = d.startTime + d.animation.duration
      d.startTime = Math.min(time, end - 50)
      d.animation.duration = end - d.startTime
    }

    if (dragMode.value === 'resize-right') {
      d.animation.duration = Math.max(50, time - d.startTime)
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
  width: 800px;
  height: 120px;
  background: #222;
  user-select: none;
}

/* 刻度 */
.ruler {
  position: relative;
  height: 20px;
  background: #333;
}

.tick {
  position: absolute;
  top: 0;
  color: #aaa;
  font-size: 10px;
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: red;
}

/* 轨道 */
.tracks {
  position: relative;
  height: 100px;
}

/* 弹幕块 */
.block {
  position: absolute;
  height: 30px;
  background: #4caf50;
  color: white;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
}

.block.selected {
  outline: 2px solid yellow;
}

.handle {
  position: absolute;
  width: 6px;
  top: 0;
  bottom: 0;
  background: #fff;
  cursor: ew-resize;
}

.handle.left {
  left: 0;
}

.handle.right {
  right: 0;
}
</style>