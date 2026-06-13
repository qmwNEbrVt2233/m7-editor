<template>
  <div class="app-container">
    <div class="main-content">
      <div class="player-section">
        <Player />
      </div>
      <div class="toolbar-section">
        <ToolBar/>
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

    <CreationTools
      :visible="store.showCreationTools"
      @update:visible="store.showCreationTools = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Player from './components/player/Player.vue'
import EditorPanel from './components/editor/editorPanel.vue'
import Timeline from './components/timeline/timeline.vue'
import { useEditorStore } from './store/editor'
import ToolBar from './components/editor/ToolBar.vue'
import CreationTools from './components/editor/creationTools.vue'

const store = useEditorStore()
const timelineHeight = ref(window.innerHeight - store.screenHeight - 80)

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

// 全局快捷键
function handleKeyDown(e: KeyboardEvent) {
  
  const isCtrl = e.ctrlKey || e.metaKey
  const isAlt = e.altKey
  const isShift = e.shiftKey

  if ((e.ctrlKey || e.metaKey) && e.code === 'Semicolon') {
    e.preventDefault()
    store.showCreationTools = !store.showCreationTools
    return
  }

  if (store.showCreationTools && e.code === 'Escape') {
    e.preventDefault()
    store.showCreationTools = false
    return
  }

  const target = e.target instanceof HTMLElement ? e.target : null

  if (store.showCreationTools && target?.closest('.creation-tools-overlay')) {
    return
  }

  // 避免在输入框中触发快捷键
  if (isTextEditingTarget(e.target)) {
    return
  }

  // 空格播放/暂停
  if (e.code === 'Space') {
    e.preventDefault()
    if (store.showCreationTools === true) {
      return
    }
    if (store.playing) {
      store.pausePlayback()
    } else {
      store.startPlayback()
    }
  }
  
  // Ctrl+S 导出JSON
  if (e.code === 'KeyS' && isCtrl) {
    e.preventDefault()
    void store.downloadProject()
  }

  // `ctrl+d` 保存工程
  if (e.key === 'd' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.saveToLocal()
    console.log('[快捷键] 保存工程')
    return
  }
  
  // `ctrl+del` 清空缓存工程
  if (e.key === 'Delete' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.clearCache()
    console.log('[快捷键] 清空缓存工程')
    return
  }

  // `ctrl+shift+del` 清空所有缓存
  if (e.key === 'Delete' && isCtrl && !isAlt && isShift) {
    e.preventDefault()
    if (window.confirm('确定要清空所有缓存吗？这将删除所有未保存的工程数据和预设，此操作不可撤销')) {
      localStorage.clear()
      console.log('[快捷键] 清空所有缓存')
    }
    return
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

.toolbar-section {
  display: flex;
  flex-direction: row;
  padding: 8px;
  background-color: #1e1e1e; 
  border-left: 1px solid #333; 
  width: max-content;
  box-sizing: border-box;
  z-index: 12;
}

.editor-section {
  width: 350px;
  background: #1e1e1e;
  border-left: 1px solid #333;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 12;
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