<template>
  <div
    v-if="!store.screenRecordingMode && notice.logList.length >= 1"
    ref="logRef"
    class="log"
    :class="{
      faded: shouldFade,
      expanded: logExpanded
    }"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div
      v-if="logExpanded"
      ref="logListRef"
      class="log-list have-scrollbar"
      @click.stop
    >
      <div v-if="omittedLogCount > 0" class="log-truncated-hint">
        已省略较早的 {{ omittedLogCount }} 条日志（导出可查看全部）
      </div>
      <div
        v-for="item in displayedLogs"
        :key="item.id"
        class="log-item"
        :class="`log-type-${item.type ?? 'log'}`"
      >
        <span>[{{ item.timestamp }}]</span>
        <span>{{ item.message }}</span>
      </div>
    </div>

    <div class="log-current">
      <span class="log-current-text" @click.stop="toggleLog">
        {{ notice.logMessage || '点击展开'}}
      </span>
      <button
        type="button"
        class="log-export-btn"
        @click.stop="notice.exportLogs"
      >
        导出
      </button>
    </div>
  </div>
  
  <Transition name="fade">
    <div v-if="notice.isVisible" class="custom-modal-mask">
      <div
        ref="modalContainerRef"
        class="custom-modal-container"
        :class="notice.type"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3>{{ notice.title }}</h3>
        </div>
        <div class="modal-body have-scrollbar">
          <p>{{ notice.popMessage }}</p>
        </div>
        <div class="modal-footer">
          <button v-if="notice.isConfirm" class="btn-cancel" @click="notice.handleAction(false)">取消</button>
          <button class="btn-confirm" @click="notice.handleAction(true)">确定</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
const store = useEditorStore()
const notice = useNoticeStore()

const MAX_RENDERED_LOGS = 500
const LOG_FADE_DELAY_MS = 1000

const hovering = ref(false)
const logExpanded = ref(false)
const logRef = ref<HTMLElement>()
const logListRef = ref<HTMLElement>()
const modalContainerRef = ref<HTMLElement>()
const isIdle = ref(Date.now() - notice.lastLogTime > LOG_FADE_DELAY_MS)
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let modalKeyListenerAttached = false

const displayedLogs = computed(() => {
  if (notice.logList.length <= MAX_RENDERED_LOGS) {
    return notice.logList
  }
  return notice.logList.slice(-MAX_RENDERED_LOGS)
})

const omittedLogCount = computed(() => Math.max(0, notice.logList.length - MAX_RENDERED_LOGS))

const shouldFade = computed(() => isIdle.value && !hovering.value && !logExpanded.value)

function scheduleFadeTimer() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  const elapsed = Date.now() - notice.lastLogTime
  if (elapsed > LOG_FADE_DELAY_MS) {
    isIdle.value = true
    return
  }
  isIdle.value = false
  fadeTimer = setTimeout(() => {
    isIdle.value = true
    fadeTimer = null
  }, Math.max(0, LOG_FADE_DELAY_MS - elapsed) + 20)
}

const toggleLog = () => {
  logExpanded.value = !logExpanded.value
}

const handleClickOutside = (e: MouseEvent) => {
  if (
    logExpanded.value &&
    logRef.value &&
    !logRef.value.contains(e.target as Node)
  ) {
    logExpanded.value = false
  }
}

const handleModalKeyDown = (e: KeyboardEvent) => {
  if (!notice.isVisible || e.isComposing || e.keyCode === 229 || e.repeat) {
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    notice.handleAction(false)
  }
}

function attachModalKeyListener() {
  if (!modalKeyListenerAttached) {
    window.addEventListener('keydown', handleModalKeyDown, true)
    modalKeyListenerAttached = true
  }
}

function detachModalKeyListener() {
  if (modalKeyListenerAttached) {
    window.removeEventListener('keydown', handleModalKeyDown, true)
    modalKeyListenerAttached = false
  }
}

watch(
  () => notice.lastLogTime,
  () => {
    scheduleFadeTimer()
  },
  { immediate: true }
)

watch(
  () => notice.isVisible,
  async (visible) => {
    if (!visible) {
      detachModalKeyListener()
      return
    }
    await nextTick()
    if (!notice.isVisible) return
    modalContainerRef.value?.focus()
    attachModalKeyListener()
  }
)

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  scheduleFadeTimer()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  detachModalKeyListener()

  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
})

const scrollToBottom = async () => {
  if (!logExpanded.value) {
    return
  }

  await nextTick()

  const el = logListRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

watch(
  () => [logExpanded.value, notice.logList.length],
  () => {
    void scrollToBottom()
  }
)

</script>

<style scoped>
.log {
  position: fixed;
  left: 0;
  bottom: 0;
  background: #333;
  border: 1px solid #444;
  border-radius: 0 5px 0 0;
  padding: 4px;
  font-size: 11px;
  z-index: 9999;
  max-width: 40%;
  max-height: 60%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    opacity 0.5s ease,
    transform 0.3s ease,
    width 0.3s ease,
    height 0.3s ease;
}

.log.faded {
  opacity: 0.15;
}

.log.expanded {
  max-width: 40%;
  max-height: 60%;
}

.log-list {
  margin-bottom: 8px;
  overflow-y: auto;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 4px;
}

.log-current {
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  flex-shrink: 0;
}

.log-current-text {
  cursor: pointer;
  min-width: 0;
  word-break: break-all;
}

.log-export-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
}

.log-item {
  padding: 4px;
  border-bottom: 1px solid #444;
  word-break: break-all;
}

.log-truncated-hint {
  padding: 4px 6px;
  color: #aaa;
  font-size: 11px;
  border-bottom: 1px dashed #555;
}

.log-item.log-type-log {
  background-color: transparent;
}

.log-item.log-type-info {
  background-color: rgba(33, 150, 243, 0.2);
}

.log-item.log-type-success {
  background-color: rgba(76, 175, 80, 0.2);
}

.log-item.log-type-warn {
  background-color: rgba(255, 152, 0, 0.2);
}

.log-item.log-type-error {
  background-color: rgba(244, 67, 54, 0.22);
}

.custom-modal-mask {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.custom-modal-container {
  background: rgb(69, 69, 69);
  padding: 20px;
  border-radius: 10px;
  border: 1px solid #333;
  width: min(460px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-left: 5px solid #2196f3;
  outline: none;
  box-sizing: border-box;
}

/* 根据不同类型显示不同边框颜色 */
.custom-modal-container.success { border-left-color: #4caf50; }
.custom-modal-container.warn { border-left-color: #ff9800; }
.custom-modal-container.error { border-left-color: #f44336; }

.modal-header { flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 18px; color: #ececec; }
.modal-body {
  margin: 15px 0;
  color: #a5a5a5;
  font-size: 14px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  min-height: 0;
}
.modal-body p { margin: 0; }
.modal-footer { display: flex; justify-content: flex-end; gap: 13px; flex-shrink: 0; }

button {
  padding: 6px 16px;
  cursor: pointer;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 15px;
  transition: all 0.2s ease;
}

button:hover {
  filter: brightness(0.9);
}

.btn-confirm {
  background: #2196f3;
  color: white;
}

.success .btn-confirm {
  background: #4caf50;
}

.warn .btn-confirm {
  background: #ff9800;
}

.error .btn-confirm {
  background: #f44336;
}

.btn-cancel {
  background: #eee;
  color: #333;
}
</style>
