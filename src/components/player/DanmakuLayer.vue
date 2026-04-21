<template>
  <div class="layer">
    <div
      v-for="d in visibleDanmakus"
      :key="d.id"
      class="danmaku"
      :style="getStyle(d)"
    >
      <div
        class="danmaku-content"
        v-html="formatText(d.content.text)"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

// 可见弹幕过滤（生存时间）
const visibleDanmakus = computed(() => {
  return store.danmakus.filter((d: any) => {
    return (
      store.currentTime >= d.startTime &&
      store.currentTime <= d.startTime + d.animation.duration
    )
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
function getStyle(d: any) {
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

  // 透明度插值
  const opacity =
    d.opacity.from +
    (d.opacity.to - d.opacity.from) * progress

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

    color: d.content.color,
    fontSize: d.content.size + 'px',
    fontFamily: d.content.font,
    fontWeight: 'bold' as const,
    lineHeight: 1,

    // 性能优化
    willChange: 'transform, opacity',
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
  perspective: 1000px;
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
}
</style>