<template>
  <div class="app-container">
    <div v-if="editorReady" class="main-content">
      <div class="player-section">
        <Player />
      </div>
      <div v-if="!store.screenRecordingMode" class="toolbar-section">
        <ToolBar />
      </div>
      <div v-if="!store.screenRecordingMode" class="editor-section">
        <EditorPanel />
      </div>
    </div>
    <div
      v-if="editorReady && !store.screenRecordingMode"
      class="timeline-container"
      :style="{ height: timelineHeight + 'px' }"
      @mousedown="onTimelineDragStart"
    >
      <Timeline />
      <div class="timeline-resize-handle" @mousedown.stop="onResizeStart" />
    </div>

    <TopSidebar v-if="editorReady" @export-video="showVideoExport = true" />
    <VideoExportDialog v-model:visible="showVideoExport" />

    <CreationTools
      :visible="editorReady && store.showCreationTools && !store.screenRecordingMode"
      @update:visible="store.showCreationTools = $event"
    />
    <DanmakuTemplateManager v-if="editorReady && store.showTemplateManager && !store.screenRecordingMode" />
    <ProjectManager
      v-if="nativeRuntime"
      :visible="store.showProjectManager"
      @close="store.showProjectManager = false"
      @loaded="editorReady = true"
    />
    <About />
    <GlobalNotice />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import Player from './components/player/Player.vue'
import VideoExportDialog from './components/preference/VideoExportDialog.vue'
import TopSidebar from './components/preference/TopSideBar.vue'
import EditorPanel from './components/editor/editorPanel.vue'
import Timeline from './components/timeline/timeline.vue'
import ToolBar from './components/editor/ToolBar.vue'
import CreationTools from './components/editor/creationTools.vue'
import DanmakuTemplateManager from './components/editor/TemplateManager.vue'
import About from './components/preference/about.vue'
import ProjectManager from './components/preference/projectManager.vue'
import GlobalNotice from './components/notice/GlobalNotice.vue'
import { useEditorStore } from './store/editor'
import { useNoticeStore } from './store/notice'
import { useHelpStore } from './store/help.ts'
import type { EditorApiMethod } from './core/editorApi'
import { isTauriRuntime } from './utils/tauriBackend'
import {
  generateDanmakuDraftsFromAgentRules,
  type AgentCreationRequest
} from './utils/danmakuGenerator'
import { runVideoFrameCaptureInRenderWindow } from './core/videoExport/exportCoordinator'

const store = useEditorStore()
const notice = useNoticeStore()
const help = useHelpStore()
const nativeRuntime = isTauriRuntime()
type McpCommandPayload = {
  requestId: string
  method: string
  params?: Record<string, unknown>
}
let stopMcpListener: (() => void) | null = null
const showVideoExport = ref(false)
const editorReady = ref(!nativeRuntime)
const timelineHeight = ref(Math.max(100, window.innerHeight - store.screenHeight * store.screenScale / 100 - 80))
const screenScaleBeforeRecording = ref(store.screenScale)
const currentTimeBeforeRecording = ref(store.currentTime)
const timeLineOffsetBeforeRecording =ref(store.timelineOffset) 
const H_LONG_PRESS_MS = 150
const DANMAKU_VISIBILITY_EVENT = 'danmaku-selection-visibility'

async function handleMcpCommand(payload: McpCommandPayload) {
  const { requestId, method, params = {} } = payload
  let result: unknown = null
  let error: string | null = null
  try {
    if (method === 'editor.getState') {
      result = { ...store.getMcpEditorState(), ready: editorReady.value }
    } else if (method === 'editor.getDanmakus') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程')
      result = store.getMcpDanmakus(params as { ids?: string[]; selectedOnly?: boolean; offset?: number; limit?: number })
    } else if (method === 'editor.getLogs') {
      result = store.getMcpLogs(params as { type?: string; offset?: number; limit?: number })
    } else if (method === 'editor.getHistorySnapshots') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程')
      result = store.getMcpHistorySnapshots()
    } else if (method === 'editor.getHistorySnapshot') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程')
      if (typeof params.snapshotId !== 'string' || !params.snapshotId) throw new Error('快照 ID 不能为空')
      result = store.getMcpHistorySnapshot(params.snapshotId, params as { offset?: number; limit?: number })
    } else if (method === 'editor.createGeneratedDanmakus') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程，暂不能创建弹幕')
      const input = params as AgentCreationRequest & { relativeToCurrentTime?: boolean }
      const drafts = generateDanmakuDraftsFromAgentRules(input, store.currentTime, store.allowNegativeValues)
      const response = await store.applyFieldUpdate('@danmaku.create', {
        danmakus: drafts,
        relativeToCurrentTime: input.relativeToCurrentTime === true
      })
      result = response
      reportMcpEditResult('@danmaku.create', response)
    } else if (method === 'editor.captureFrame') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程，暂不能获取画面')
      const timeMs = params.timeMs
      const maxDimension = params.maxDimension ?? 1280
      if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0) {
        throw new Error('截图时间 timeMs 必须是非负有限数字')
      }
      if (typeof maxDimension !== 'number' || !Number.isInteger(maxDimension)) {
        throw new Error('maxDimension 必须是整数')
      }
      notice.log(`MCP 正在渲染 ${Math.round(timeMs)} ms 的画面`, 'info')
      const frame = await runVideoFrameCaptureInRenderWindow({
        screenWidth: store.screenWidth,
        screenHeight: store.screenHeight,
        mediaDuration: store.mediaDuration,
        mediaUrl: store.mediaUrl,
        mediaFilePath: store.mediaUrl ? store.mediaFilePath : '',
        danmakus: store.danmakus
      }, timeMs, maxDimension)
      result = frame
      notice.log(`MCP 已返回 ${frame.width}×${frame.height} 帧图像`, 'success')
    } else if (method === 'editor.saveFolderProject' || method === 'editor.backupFolderProject') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程')
      result = await store.saveFolderProjectForMcp(method === 'editor.backupFolderProject')
    } else if (method === 'editor.applyFieldUpdate') {
      if (!editorReady.value) throw new Error('编辑器尚未加载工程，暂不能编辑')
      if (typeof params.field !== 'string' || !params.field) throw new Error('字段或操作名称不能为空')
      const field = params.field
      const response = await store.applyFieldUpdate(field, params.method as EditorApiMethod)
      result = response
      reportMcpEditResult(field, response)
    } else {
      throw new Error('不支持的编辑器桥接方法：' + method)
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
    notice.alert('MCP：' + error, 'warn')
  }

  try {
    await invoke('complete_mcp_request', { requestId, result, error })
  } catch (cause) {
    console.error('[MCP] 返回编辑器操作结果失败:', cause)
  }
}

function reportMcpEditResult(field: string, response: Awaited<ReturnType<typeof store.applyFieldUpdate>>) {
  if (!response.ok) {
    notice.alert('MCP 编辑失败：' + response.message, 'warn')
    return
  }

  response.warnings.forEach((warning) => notice.alert('MCP：' + warning, 'warn'))
  const summary = field === '@selection.filter'
    ? 'MCP 筛选完成：当前选中 ' + response.selectedIds.length + ' 条弹幕'
    : field === '@editor.currentTime'
      ? 'MCP 已设置当前播放时间'
      : field === '@editor.settings'
        ? 'MCP 已更新画布或层数设置'
        : field === '@danmaku.create'
          ? 'MCP 已创建 ' + response.createdIds.length + ' 条弹幕'
          : 'MCP 编辑完成：修改 ' + response.changedIds.length + ' 条，新增 ' + response.createdIds.length + ' 条弹幕'
  if (response.changedIds.length || response.createdIds.length || field === '@selection.filter' || field.startsWith('@history.') || field.startsWith('@editor.')) {
    notice.log(summary, 'success')
  }
}

type DanmakuVisibilityMode = 'hide' | 'only'

let activeHMode: DanmakuVisibilityMode | null = null
let hPressTimer: ReturnType<typeof setTimeout> | null = null
let hPressWasLong = false
let hPressCanShowHelp = false
let hPressCanApplyVisibility = false

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

function canApplyDanmakuVisibilityShortcut() {
  return (
    editorReady.value &&
    store.selectedIds.length > 0 &&
    !store.screenRecordingMode &&
    !store.showCreationTools &&
    !store.showProjectManager &&
    !store.showTemplateManager &&
    !help.isVisible &&
    !notice.isVisible &&
    !isTextEditingTarget(document.activeElement)
  )
}

function dispatchDanmakuVisibility(mode: DanmakuVisibilityMode | null) {
  window.dispatchEvent(new CustomEvent(DANMAKU_VISIBILITY_EVENT, { detail: mode }))
}

function beginHPress(event: KeyboardEvent) {
  if (activeHMode !== null) {
    return
  }

  activeHMode = event.shiftKey ? 'only' : 'hide'
  hPressWasLong = false
  hPressCanShowHelp = !event.shiftKey && !store.screenRecordingMode
  hPressCanApplyVisibility = canApplyDanmakuVisibilityShortcut()
  hPressTimer = setTimeout(() => {
    hPressWasLong = true
    if (hPressCanApplyVisibility && canApplyDanmakuVisibilityShortcut()) {
      dispatchDanmakuVisibility(activeHMode)
    }
  }, H_LONG_PRESS_MS)
}

function showContextualHelp() {
  if (store.showProjectManager) {
    if (!help.isVisible) {
      help.show('interface-project-manager')
    } else {
      help.hide()
    }
    return
  }

  if (store.showTemplateManager) {
    if (!help.isVisible) {
      help.show('interface-template-manager')
    } else {
      help.hide()
    }
    return
  }

  if (store.showCreationTools) {
    if (!help.isVisible) {
      help.show('interface-creation')
    } else {
      help.hide()
    }
    return
  }

  if (store.selectedIds.length !== 0) {
    if (!help.isVisible) {
      help.show('interface-editor')
    } else {
      help.hide()
    }
    return
  }

  help.toggle()
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.code !== 'KeyH' || activeHMode === null) {
    return
  }

  if (hPressTimer) {
    clearTimeout(hPressTimer)
    hPressTimer = null
  }

  const wasLong = hPressWasLong
  const canShowHelp = hPressCanShowHelp
  activeHMode = null
  hPressWasLong = false
  hPressCanShowHelp = false
  hPressCanApplyVisibility = false

  if (wasLong) {
    dispatchDanmakuVisibility(null)
  } else if (canShowHelp) {
    showContextualHelp()
  }
}

function handleWindowBlur() {
  if (hPressTimer) {
    clearTimeout(hPressTimer)
    hPressTimer = null
  }
  if (hPressWasLong) {
    dispatchDanmakuVisibility(null)
  }
  activeHMode = null
  hPressWasLong = false
  hPressCanShowHelp = false
  hPressCanApplyVisibility = false
}

// 全局快捷键
async function handleKeyDown(e: KeyboardEvent) {
  const isCtrl = e.ctrlKey || e.metaKey
  const isAlt = e.altKey
  const isShift = e.shiftKey

  if (isTextEditingTarget(e.target)) {
    return
  }

  if (notice.isVisible) {
    return
  }

  if (e.code === 'Backquote' && !isCtrl && !isAlt && !isShift && nativeRuntime && !store.InitializationPhase) {
    e.preventDefault()
    store.showProjectManager = !store.showProjectManager
    return
  }

  if ((e.code === 'KeyR' && isCtrl && !isAlt && isShift) || (e.key === 'F5' && isCtrl && !isAlt && !isShift)) {
    e.preventDefault()
    if (store.InitializationPhase) {
      return
    }
    const confirmed = await notice.confirm('确定要重载页面吗？这将丢失未保存的进度')
    if (confirmed) {
      window.location.reload()
    }
    return
  }

  if (e.code === 'KeyH' && !isCtrl && !isAlt) {
    e.preventDefault()
    if (!e.repeat) {
      if (canApplyDanmakuVisibilityShortcut()) {
        beginHPress(e)
      } else {
        showContextualHelp()
      }
    }
    return
  }

  if (!editorReady.value) {
    return
  }

  if (e.key === "'" && !isCtrl && !isAlt && !isShift && !store.screenRecordingMode && !store.showProjectManager) {
    e.preventDefault()
    store.showTemplateManager = !store.showTemplateManager
    store.showCreationTools = false
    help.hide()
    return
  }

  if (e.key === 'Escape' && help.isVisible) {
    e.preventDefault()
    help.hide()
    return
  }

  if (e.key === 'Escape' && store.showProjectManager) {
    e.preventDefault()
    store.showProjectManager = false
    return
  }

  if (e.key === 'Escape' && store.showTemplateManager) {
    e.preventDefault()
    store.showTemplateManager = false
    return
  }

  if (e.code === 'Semicolon' && isCtrl && !isAlt && !isShift && !store.screenRecordingMode && !store.showProjectManager) {
    e.preventDefault()
    store.showCreationTools = !store.showCreationTools
    store.showTemplateManager = false
    help.hide()
    return
  }

  if (e.code === 'Escape' && store.showCreationTools) {
    e.preventDefault()
    if (help.isVisible) {
      help.hide()
      return
    }
    store.showCreationTools = false
    return
  }

  const target = e.target instanceof HTMLElement ? e.target : null

  if (store.showCreationTools && target?.closest('.creation-tools-overlay')) {
    return
  }

  // 空格播放/暂停
  if (e.code === 'Space' && !isCtrl && !isAlt && !isShift && !store.screenRecordingMode) {
    e.preventDefault()
    if (store.showCreationTools) {
      return
    }
    if (store.playing) {
      store.pausePlayback()
      return
    } else {
      store.startPlayback()
      return
    }
  }
  
  // Ctrl+S 导出JSON
  if (e.key === 's' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    void store.downloadProject()
    return
  }

  if (e.key === 's' && isCtrl && isAlt && !isShift) {
    e.preventDefault()
    void store.backupActiveFolderProject()
    return
  }

  // `ctrl+d` 保存工程
  if (e.key === 'd' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.saveToLocal()
    notice.log('[快捷键] 保存工程')
    return
  }
  
  // `ctrl+del` 清空缓存工程
  if (e.key === 'Delete' && isCtrl && !isAlt && !isShift) {
    e.preventDefault()
    store.clearCache()
    return
  }

  // `ctrl+shift+del` 清空所有缓存
  if (e.key === 'Delete' && isCtrl && !isAlt && isShift) {
    e.preventDefault()
    const confirmed = await notice.confirm('确定要清空所有缓存吗？这将删除所有未保存的工程数据和预设，此操作不可撤销')
    if (confirmed) {
      localStorage.clear()
      notice.log('[快捷键] 清空所有缓存', 'success')
    }
    return
  }

  if (e.code === 'Space' && isCtrl && isAlt && !isShift) {
    e.preventDefault()
    if (!store.screenRecordingMode) {
      screenScaleBeforeRecording.value = store.screenScale
      currentTimeBeforeRecording.value = store.currentTime
      timeLineOffsetBeforeRecording.value = store.timelineOffset
      store.showCreationTools = false
      help.hide()
      store.screenRecordingMode = true
      store.aggressiveOptimization = true
      store.currentTime = 0
      store.screenScale = Math.min(Math.round(window.innerHeight / store.screenHeight * 1 * 100), Math.round(window.innerWidth / store.screenWidth * 1 * 100))
      store.startPlayback()
    } else {
      store.currentTime = 0
      store.screenScale = Math.min(Math.round(window.innerHeight / store.screenHeight * 1 * 100), Math.round(window.innerWidth / store.screenWidth * 1 * 100))
      store.startPlayback()
    }
  }

  if (e.key === 'Escape' && store.screenRecordingMode) {
    e.preventDefault()
    const confirmed = await notice.confirm('确定要退出屏幕录制模式吗？')
    if (confirmed) {
      store.screenRecordingMode = false
      store.aggressiveOptimization = false
      store.screenScale = screenScaleBeforeRecording.value
      store.currentTime = currentTimeBeforeRecording.value
      store.timelineOffset = timeLineOffsetBeforeRecording.value
      store.playing = false
      notice.log('已退出录屏模式', 'success')
    }
  }
}

onMounted(() => {
  if (nativeRuntime) {
    void listen<McpCommandPayload>('mcp-command', (event) => { void handleMcpCommand(event.payload) })
      .then(async (stop) => {
        stopMcpListener = stop
        await invoke('set_mcp_frontend_ready', { ready: true })
      })
      .catch((error) => console.error('[MCP] 本机桥事件监听启动失败:', error))
  }
  void store.loadDanmakuTemplates().catch((error) => console.error('[模板] 加载失败:', error))
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  stopMcpListener?.()
  stopMcpListener = null
  if (nativeRuntime) void invoke('set_mcp_frontend_ready', { ready: false }).catch(() => {})
  if (hPressTimer) {
    clearTimeout(hPressTimer)
  }
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
})

watch(
  () =>
    editorReady.value &&
    store.selectedIds.length > 0 &&
    !store.screenRecordingMode &&
    !store.showCreationTools &&
    !store.showProjectManager &&
    !help.isVisible &&
    !notice.isVisible,
  (available) => {
    if (!available) {
      hPressCanApplyVisibility = false
      if (hPressWasLong) {
        dispatchDanmakuVisibility(null)
      }
    }
  }
)

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

watch(
  () => store.screenHeight | store.screenScale,
  () => {
    timelineHeight.value = Math.max(100, window.innerHeight - store.screenHeight * store.screenScale / 100 - 80)
  }
)
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
