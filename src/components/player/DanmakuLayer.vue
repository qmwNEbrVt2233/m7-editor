<template>
  <div class="layer">
    <div
      v-for="d in visibleDanmakus"
      :key="d.id"
      class="danmaku"
      :style="getStyle(d)"
    >
      <div class="danmaku-content" v-html="formatText(d.content.text)"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

const visibleDanmakus = computed(() => {
  return store.danmakus.filter((d: any) => {
    return (
      store.currentTime >= d.startTime &&
      store.currentTime <= d.startTime + d.animation.duration
    )
  })
})

function getStyle(d: any) {
  const t = store.currentTime - d.startTime

  const progress = Math.min(
    Math.max(t / d.animation.moveDuration, 0),
    1
  )

  const x =
    d.transform.start.x +
    (d.transform.end.x - d.transform.start.x) * progress

  const y =
    d.transform.start.y +
    (d.transform.end.y - d.transform.start.y) * progress

  return {
    position: 'absolute' as const,
    left: x + 'px',
    top: y + 'px',
    color: d.content.color,
    fontSize: d.content.size + 'px',
    fontFamily: d.content.font,
    fontWeight: 'bold' as const,
    lineHeight: 1,
  }
}

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
}

.danmaku {
  white-space: nowrap;
}

.danmaku-content {
  word-break: break-word;
}
</style>