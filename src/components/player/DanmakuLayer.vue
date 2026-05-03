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
</template>

<script setup lang="ts">
import { shallowRef, computed, watch } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

const BUFFER_WINDOW = 10000 // 缓存窗口：10秒
const PRELOAD_THRESHOLD = 2000 // 预加载阈值：2秒
const JITTER_TOLERANCE = 500 // 抖动容差：500ms（解决视频时间微小倒退导致的频繁重算）

// 使用 shallowRef 拒绝深度 Proxy 劫持
const activeBuffer = shallowRef<any[]>([])
let currentBufferStart = -1
let currentBufferEnd = -1

// 低频刷新核心
function updateBuffer(time: number) {
  console.log(`[Buffer] 正在重构缓冲池，当前时间: ${time}`)
  currentBufferStart = time
  currentBufferEnd = time + BUFFER_WINDOW
  
  activeBuffer.value = store.danmakus.filter((d: any) => {
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
let editTimeout: any = null
watch(() => store.danmakus, () => {
  // 播放期间如果 store 发生莫名其妙的微小变动，防抖可以阻止其引发高频重算
  if (editTimeout) clearTimeout(editTimeout)
  editTimeout = setTimeout(() => {
    updateBuffer(store.currentTime)
  }, 200) // 延迟 200ms 重建
}, { deep: true }) 


// --- 高频刷新：实时可见弹幕 ---
const visibleDanmakus = computed(() => {
  const time = store.currentTime
  
  const filtered = activeBuffer.value.filter((d: any) => {
    return time >= d.startTime && time <= d.startTime + d.animation.duration
  })

  return filtered.sort((a: any, b: any) => {
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
    // 加速
    return progress * progress
  } else {
    // 减速
    return 1 - (1 - progress) * (1 - progress)
  }
}

// 核心样式计算
function getStyle(d: any, index: number) {
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

  // clamp
  progress = Math.max(0, Math.min(1, progress))

  // easing
  progress = applyEasing(progress, easing)

  // 坐标插值
  const x =
    d.transform.start.x +
    (d.transform.end.x - d.transform.start.x) * progress

  const y =
    d.transform.start.y +
    (d.transform.end.y - d.transform.start.y) * progress

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
  }
    //生命周期进度（用于透明度）
  const lifeProgress = clamp(
    (currentTime - d.startTime) / d.animation.duration,
    0,
    1
  )

  //  透明度插值
  const opacity =
    d.opacity.from +
    (d.opacity.to - d.opacity.from) * lifeProgress

  // 3D Transform
  const transform = `
    translate3d(${x}px, ${y}px, 0)
    rotateZ(${d.transform.zRotate}deg)
    rotateY(${360 - d.transform.yRotate}deg)
  `
  return {
    position: 'absolute' as const,
    transform,
    opacity,
    zIndex: index,
    color: d.content.color,
    fontSize: d.content.size + 'px',
    fontFamily: d.content.font,
    fontWeight: 'bold' as const,
    lineHeight: 1,
    willChange: 'transform, opacity',
    textShadow: d.content.stroke ? `
      1px 1px 1px #000,
      -1px -1px 1px #000,
      -1px 1px 1px #000,
      1px -1px 1px #000,
      1px 0px 1px #000,
      0px 1px 1px #000,
      -1px 0px 1px #000,
      0px -1px 1px #000
      `: undefined
  }
}

// 换行支持
function formatText(text: string) {
  return text.replace(/\n/g, '<br />')
}
</script>

<style scoped>
.layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;

  /* 关键：开启3D透视 */
  perspective: 500px;
}

.danmaku {
  position: absolute;
  white-space: nowrap;

  /* 关键：允许3D变换 */
  transform-style: preserve-3d;
  transform-origin:0% 0%;
}

.danmaku-content {
  word-break: break-word;
  white-space: pre
}
</style>