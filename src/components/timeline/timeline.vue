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
        v-for="d in store.danmakus"
        :key="d.id"
        class="block"
        :style="getBlockStyle(d)"
      >
        {{ d.content.text }}
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
    top: '30px'
  }
}

// ===== 拖动播放头 =====
const dragging = ref(false)

function onMouseDown(e: MouseEvent) {
  dragging.value = true
  updateTime(e)
}

function onMouseMove(e: MouseEvent) {
  if (!dragging.value) return
  updateTime(e)
}

function onMouseUp() {
  dragging.value = false
}

function updateTime(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  const x = e.clientX - rect.left

  const time = x / scale + offset.value

  store.setTime(time)
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
</style>