<template>
  <div class="app-container">
    <div class="main-content">
      <div class="player-section">
        <Player />
      </div>
      <div class="editor-section">
        <EditorPanel />
      </div>
    </div>
    <div 
      class="timeline-container"
      :style="{ height: timelineHeight + 'px' }"
      @mousedown="onTimelineDragStart"
    >
      <Timeline />
      <div class="timeline-resize-handle" @mousedown.stop="onResizeStart" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Player from './components/player/Player.vue'
import EditorPanel from './components/editor/editorPanel.vue'
import Timeline from './components/timeline/timeline.vue'
import { useEditorStore } from './store/editor'

const store = useEditorStore()
const timelineHeight = ref(window.innerHeight - 530)

// 全局快捷键
function handleKeyDown(e: KeyboardEvent) {
  
  // 避免在输入框中触发快捷键
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }
  
  // 空格播放/暂停
  if (e.code === 'Space') {
    e.preventDefault()
    if (store.playing) {
      store.pausePlayback()
    } else {
      store.startPlayback()
    }
  }
  
  // Ctrl+S 导出JSON
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
    e.preventDefault()
    store.downloadProject()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// 时间轴高度拖动
function onResizeStart(e: MouseEvent) {
  const startY = e.clientY
  const startHeight = timelineHeight.value

  function onMouseMove(moveEvent: MouseEvent) {
    const delta = moveEvent.clientY - startY
    timelineHeight.value = Math.max(100, startHeight - delta) // 最小100px
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onTimelineDragStart(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.timeline-resize-handle')) {
    return
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1a1a1a;
  color: #fff;
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: #222;
  display: flex;
  flex-direction: row;
}

.player-section {
  flex: 1;
  overflow: hidden;
  background: #222;
}

.editor-section {
  width: 350px;
  background: #1e1e1e;
  border-left: 1px solid #333;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.timeline-container {
  position: relative;
  border-top: 1px solid #444;
  background: #1a1a1a;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.timeline-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: #444;
  cursor: row-resize;
  transition: background 0.2s;
}

.timeline-resize-handle:hover {
  background: #666;
}
</style>