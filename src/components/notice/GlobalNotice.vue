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
      <div
        v-for="item in notice.logList"
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
        {{ notice.logMessage }}
      </span>
      <button
        type="button"
        class="log-export-btn"
        @click.stop="downloadLogs"
      >
        导出
      </button>
    </div>
  </div>
  
  <Transition name="fade">
    <div v-if="notice.isVisible" class="custom-modal-mask">
      <div class="custom-modal-container" :class="notice.type">
        <div class="modal-header">
          <h3>{{ notice.title }}</h3>
        </div>
        <div class="modal-body">
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
import { useEditorStore } from '@/store/editor';
import { useNoticeStore } from '../../store/notice'
import { saveBlobWithFallback } from '@/store/editor'
const store = useEditorStore()
const notice = useNoticeStore()

const hovering = ref(false)
const logExpanded = ref(false)
const logRef = ref<HTMLElement>()
const logListRef = ref<HTMLElement>()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const shouldFade = computed(() => {
  const idle =
    now.value - notice.lastLogTime > 1000

  return idle && !hovering.value && !logExpanded.value
})

const toggleLog = () => {
  logExpanded.value = !logExpanded.value
}

const pad = (value: number) => String(value).padStart(2, '0')

const formatDateTime = (value: number | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds())
  ].join('')
}

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}时${minutes}分${seconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }

  return `${seconds}秒`
}

const safeStringify = (value: unknown) => {
  const seen = new WeakSet<object>()

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
  )
}

const serializeAdditionalInfo = (value: unknown) => {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }

  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }

  try {
    return safeStringify(value) || ''
  } catch {
    return String(value)
  }
}

const buildLogMarkdown = () => {
  const logs = [...notice.logList]
  const createdAt = formatDateTime(Date.now())

  const timestamps = logs
    .map((item) => item.id)
    .filter((value): value is number => Number.isFinite(value))

  const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null
  const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null
  const timeSpan = firstTimestamp !== null && lastTimestamp !== null
    ? formatDuration(lastTimestamp - firstTimestamp)
    : '0秒'

  const lines: string[] = [
    '# 日志信息',
    '## 日志文件头',
    `- 文件生成时间：${createdAt}`,
    `- 日志数量：${logs.length}`,
    `- 起始时间：${firstTimestamp !== null ? formatDateTime(firstTimestamp) : '无'}`,
    `- 结束时间：${lastTimestamp !== null ? formatDateTime(lastTimestamp) : '无'}`,
    `- 时间跨度：${timeSpan}`,
    ''
  ]

  logs.forEach((item) => {
    const type = item.type ?? 'log'
    const extraInfo = serializeAdditionalInfo(item.AdditionalInfo)

    lines.push(`### 时间：${item.timestamp} id：${item.id}`)
    lines.push(`[${type}] ${item.message}`)

    if (extraInfo.trim()) {
      lines.push('')
      lines.push('```text')
      lines.push(extraInfo)
      lines.push('```')
    }

    lines.push('')
  })

  return lines.join('\n').trimEnd() + '\n'
}

const downloadLogs = async () => {
  const markdown = buildLogMarkdown()
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })

  await saveBlobWithFallback(blob, `notice-logs ${formatDateTime(Date.now())}.md`, {
    description: 'Markdown 日志文件',
    accept: {
      'text/markdown': ['.md']
    }
  })
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

onMounted(() => {
  document.addEventListener('click', handleClickOutside)

  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)

  if (timer) {
    clearInterval(timer)
    timer = null
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
  z-index: 9998;
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
  width: 35%;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-left: 5px solid #2196f3;
}

/* 根据不同类型显示不同边框颜色 */
.custom-modal-container.success { border-left-color: #4caf50; }
.custom-modal-container.warn { border-left-color: #ff9800; }
.custom-modal-container.error { border-left-color: #f44336; }

.modal-header h3 { margin: 0; font-size: 18px; color: #ececec; }
.modal-body { margin: 15px 0; color: #a5a5a5; font-size: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 13px; }

button {
  padding: 6px 16px;
  cursor: pointer;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
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

/* 动画效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
