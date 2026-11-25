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
      @scroll="handleLogListScroll"
    >
      <div
        class="log-virtual-spacer"
        :style="{ height: `${logListTotalHeight}px` }"
      >
        <div
          class="log-virtual-content"
          :style="{ transform: `translateY(${logListOffset}px)` }"
        >
          <div
            v-for="item in visibleLogs"
            :key="item.id"
            :ref="(element) => setLogItemRef(element, item.id)"
            class="log-item"
            :class="[
              `log-type-${item.type ?? 'log'}`,
              { 'has-additional-info': hasAdditionalInfo(item) }
            ]"
            :role="hasAdditionalInfo(item) ? 'button' : undefined"
            :tabindex="hasAdditionalInfo(item) ? 0 : undefined"
            :aria-expanded="hasAdditionalInfo(item) ? expandedLogId === item.id : undefined"
            @click.stop="toggleAdditionalInfo(item)"
            @keydown.enter.prevent="toggleAdditionalInfo(item)"
            @keydown.space.prevent="toggleAdditionalInfo(item)"
          >
            <span>[{{ item.timestamp }}]</span>
            <span>{{ item.message }}</span>
            <pre
              v-if="expandedLogId === item.id"
              class="log-additional-info"
              @click.stop
            >{{ formatAdditionalInfo(item.AdditionalInfo) }}</pre>
          </div>
        </div>
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
import type { ComponentPublicInstance } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
const store = useEditorStore()
const notice = useNoticeStore()

const LOG_FADE_DELAY_MS = 1000
const LOG_ITEM_ESTIMATED_HEIGHT = 22
const LOG_ITEM_GAP = 4
const LOG_LIST_OVERSCAN = 50

const hovering = ref(false)
const logExpanded = ref(false)
const expandedLogId = ref<number | null>(null)
const logRef = ref<HTMLElement>()
const logListRef = ref<HTMLElement>()
const modalContainerRef = ref<HTMLElement>()
const virtualScrollTop = ref(0)
const virtualViewportHeight = ref(0)
const measuredLogHeights = ref(new Map<number, number>())
const isIdle = ref(Date.now() - notice.lastLogTime > LOG_FADE_DELAY_MS)
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let modalKeyListenerAttached = false
let logResizeObserver: ResizeObserver | null = null
const logItemElements = new Map<number, HTMLElement>()
const logElementIds = new WeakMap<Element, number>()

const logOffsets = computed(() => {
  const offsets = [0]
  notice.logList.forEach((item, index) => {
    const height = measuredLogHeights.value.get(item.id) ?? LOG_ITEM_ESTIMATED_HEIGHT
    offsets.push(offsets[index] + height + LOG_ITEM_GAP)
  })
  return offsets
})

const logListTotalHeight = computed(() => logOffsets.value[notice.logList.length] ?? 0)

function findLogIndexAtOffset(offset: number): number {
  let low = 0
  let high = notice.logList.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (logOffsets.value[middle + 1] <= offset) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

const logListStartIndex = computed(() =>
  findLogIndexAtOffset(Math.max(0, virtualScrollTop.value - LOG_LIST_OVERSCAN))
)
const logListEndIndex = computed(() =>
  Math.min(
    notice.logList.length,
    findLogIndexAtOffset(
      virtualScrollTop.value + virtualViewportHeight.value + LOG_LIST_OVERSCAN
    ) + 1
  )
)
const logListOffset = computed(() => logOffsets.value[logListStartIndex.value] ?? 0)
const visibleLogs = computed(() =>
  notice.logList.slice(logListStartIndex.value, logListEndIndex.value)
)

const shouldFade = computed(() => isIdle.value && !hovering.value && !logExpanded.value)

function setLogItemRef(
  element: Element | ComponentPublicInstance | null,
  id: number
) {
  const previousElement = logItemElements.get(id)
  if (previousElement && previousElement !== element) {
    logResizeObserver?.unobserve(previousElement)
    logItemElements.delete(id)
  }
  if (!(element instanceof HTMLElement)) {
    return
  }
  logItemElements.set(id, element)
  logElementIds.set(element, id)
  logResizeObserver?.observe(element)
}

function handleLogListScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  virtualScrollTop.value = element.scrollTop
  virtualViewportHeight.value = element.clientHeight
}

function updateLogMeasurements(entries: ResizeObserverEntry[]) {
  const listElement = logListRef.value
  const wasAtBottom = listElement
    ? listElement.scrollHeight - listElement.clientHeight - listElement.scrollTop <= 2
    : false
  const updatedHeights = new Map(measuredLogHeights.value)
  let measurementsChanged = false

  for (const entry of entries) {
    if (entry.target === listElement) {
      virtualViewportHeight.value = listElement.clientHeight
      continue
    }
    const id = logElementIds.get(entry.target)
    if (id === undefined) {
      continue
    }
    const height = (entry.target as HTMLElement).getBoundingClientRect().height
    if (Math.abs((updatedHeights.get(id) ?? 0) - height) > 1) {
      updatedHeights.set(id, height)
      measurementsChanged = true
    }
  }

  if (measurementsChanged) {
    measuredLogHeights.value = updatedHeights
    if (wasAtBottom) {
      void nextTick(() => scrollToBottom())
    }
  }
}

function hasAdditionalInfo(item: (typeof notice.logList)[number]) {
  return item.AdditionalInfo !== undefined && item.AdditionalInfo !== null
}

function toggleAdditionalInfo(item: (typeof notice.logList)[number]) {
  if (!hasAdditionalInfo(item)) {
    return
  }
  expandedLogId.value = expandedLogId.value === item.id ? null : item.id
}

function formatAdditionalInfo(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value !== 'object') {
    return String(value)
  }

  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => {
        if (typeof currentValue === 'bigint') {
          return `${currentValue}n`
        }
        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack
          }
        }
        if (currentValue && typeof currentValue === 'object') {
          if (seen.has(currentValue)) {
            return '[Circular]'
          }
          seen.add(currentValue)
        }
        return currentValue
      },
      2
    ) || String(value)
  } catch {
    return String(value)
  }
}

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
  logResizeObserver = new ResizeObserver(updateLogMeasurements)
  if (logListRef.value) {
    logResizeObserver.observe(logListRef.value)
    virtualViewportHeight.value = logListRef.value.clientHeight
  }
  for (const element of logItemElements.values()) {
    logResizeObserver.observe(element)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  detachModalKeyListener()
  logResizeObserver?.disconnect()
  logResizeObserver = null

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
    virtualViewportHeight.value = el.clientHeight
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
    virtualScrollTop.value = el.scrollTop
  }
}

watch(
  () => [logExpanded.value, notice.logList.length],
  () => {
    void scrollToBottom()
  }
)

watch(
  logListRef,
  (element, previousElement) => {
    if (previousElement) {
      logResizeObserver?.unobserve(previousElement)
    }
    if (element) {
      logResizeObserver?.observe(element)
      virtualViewportHeight.value = element.clientHeight
    }
  },
  { flush: 'post' }
)

watch(
  () => notice.logList[0]?.id,
  () => {
    const retainedIds = new Set(notice.logList.map((item) => item.id))
    const retainedHeights = new Map(
      [...measuredLogHeights.value].filter(([id]) => retainedIds.has(id))
    )
    if (retainedHeights.size !== measuredLogHeights.value.size) {
      measuredLogHeights.value = retainedHeights
    }
  },
  { flush: 'post' }
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
  overflow-y: auto;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.log-virtual-spacer {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
}

.log-virtual-content {
  position: relative;
  top: 0;
  left: 0;
  right: 0;
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
  margin-bottom: 4px;
  border-bottom: 1px solid #444;
  word-break: break-all;
}

.log-item.has-additional-info {
  cursor: pointer;
}

.log-item.has-additional-info:focus-visible {
  outline: 1px solid #888;
  outline-offset: -1px;
}

.log-additional-info {
  margin: 6px 0 2px;
  padding: 6px;
  border-left: 2px solid #666;
  color: #ccc;
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
