<template>
  <div class="layer">
    <div
      v-for="d in visibleDanmakus"
      :key="d.id"
      class="danmaku"
      :style="getStyle(d)"
    >
      {{ d.content.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../store/editor'

const store = useEditorStore()

const visibleDanmakus = computed(() => {
  return store.danmakus.filter(d => {
    return (
      store.currentTime >= d.startTime &&
      store.currentTime <= d.startTime + d.animation.duration
    )
  })
})

function getStyle(d: any) {
  return {
    position: 'absolute',
    left: d.transform.start.x + 'px',
    top: d.transform.start.y + 'px',
    color: d.content.color,
    fontSize: d.content.size + 'px'
  }
}
</script>