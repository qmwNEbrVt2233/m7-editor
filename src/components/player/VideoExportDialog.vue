<template>
  <div v-if="visible" class="video-export-dialog">
    <section class="dialog-card">
      <header class="dialog-header">
        <strong>导出视频</strong>
        <button class="icon-button" :disabled="busy" aria-label="关闭" @click="close">×</button>
      </header>

      <div class="dialog-body">
        <label>
          <span>开始时间 (ms)</span>
          <input v-model.number="startMs" type="number" min="0" :max="endMs" :disabled="busy" />
        </label>
        <label>
          <span>结束时间 (ms)</span>
          <input v-model.number="endMs" type="number" min="1" :disabled="busy" />
        </label>
        <label>
          <span>宽度</span>
          <input v-model.number="width" type="number" min="16" max="7680" step="2" :disabled="busy" @change="syncHeightToWidth" />
        </label>
        <label>
          <span>高度</span>
          <input v-model.number="height" type="number" min="16" max="4320" step="2" :disabled="busy" @change="syncWidthToHeight" />
        </label>
        <label>
          <span>帧率</span>
          <select v-model.number="fps" :disabled="busy">
            <option :value="24">24 fps</option>
            <option :value="30">30 fps</option>
            <option :value="60">60 fps</option>
          </select>
        </label>
        <label>
          <span>画质</span>
          <select v-model="quality" :disabled="busy">
            <option value="high">高质量</option>
            <option value="very-high">极高质量（速度更慢、文件更大）</option>
          </select>
        </label>
        <p class="output-hint">{{ outputHint }}</p>

        <div v-if="busy" class="progress-section">
          <progress :value="progress.percent" max="1"></progress>
          <div class="progress-caption">
            <span>{{ progressText }}</span>
            <span>{{ Math.round(progress.percent * 100) }}%</span>
          </div>
          <div class="render-stats">
            <div><span>总渲染时间</span><strong>{{ elapsedTimeText }}</strong></div>
            <div><span>预计完成</span><strong>{{ estimatedFinishText }}</strong></div>
            <div><span>平均每帧</span><strong>{{ averageFrameTimeText }}</strong></div>
          </div>
          <button class="cancel-button" @click="cancelExport">取消导出</button>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      </div>

      <footer class="dialog-footer">
        <button class="secondary-button" :disabled="busy" @click="close">关闭</button>
        <button class="primary-button" :disabled="busy" @click="startExport">
          {{ busy ? '正在导出…' : '开始导出' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { runVideoExportInRenderWindow, type ExportProgress } from '@/core/videoExport/exportCoordinator'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
}>()

const store = useEditorStore()
const notice = useNoticeStore()
const startMs = ref(0)
const endMs = ref(store.mediaDuration)
const fps = ref(30)
const quality = ref<'high' | 'very-high'>('very-high')
const width = ref(store.screenWidth)
const height = ref(store.screenHeight)
const busy = ref(false)
const errorMessage = ref('')
const abortController = ref<AbortController | null>(null)
const progress = ref<ExportProgress>({ completedFrames: 0, totalFrames: 0, percent: 0, stage: 'preparing' })
const elapsedMs = ref(0)
let renderStartedAt = 0
let renderTimer: number | undefined
const averageFrameMs = computed(() => progress.value.completedFrames > 0
  ? elapsedMs.value / progress.value.completedFrames
  : null)
const elapsedTimeText = computed(() => formatDuration(elapsedMs.value))
const averageFrameTimeText = computed(() => {
  if (averageFrameMs.value === null) return '计算中'
  return averageFrameMs.value >= 1000
    ? `${(averageFrameMs.value / 1000).toFixed(2)} 秒/帧`
    : `${Math.round(averageFrameMs.value)} 毫秒/帧`
})
const estimatedFinishText = computed(() => {
  const { stage, completedFrames, totalFrames } = progress.value
  if (stage === 'preparing' || totalFrames <= 0 || completedFrames <= 0) return '计算中'
  if (stage === 'finalizing') return '封装中'
  if (completedFrames >= totalFrames || averageFrameMs.value === null) return '即将完成'
  const remainingMs = averageFrameMs.value * (totalFrames - completedFrames)
  return new Date(Date.now() + remainingMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
})
const outputHint = computed(() => store.mediaUrl
  ? 'MP4 / H.264，默认使用工程画布尺寸并保留源视频音轨；输出宽高跟随工程比例。'
  : '未导入视频时导出弹幕画布，不包含音轨；默认时长取弹幕最晚结束时间，输出宽高跟随工程比例。')
const progressText = computed(() => {
  if (progress.value.stage === 'preparing') return '准备编码器与输出文件'
  if (progress.value.stage === 'finalizing') return store.mediaUrl ? '正在封装 MP4 与音轨' : '正在完成无音轨 MP4'
  return `${progress.value.completedFrames.toLocaleString()} / ${progress.value.totalFrames.toLocaleString()} 帧`
})

watch(() => props.visible, (visible) => {
  if (!visible) return
  startMs.value = 0
  endMs.value = getDefaultEndMs()
  width.value = store.screenWidth
  height.value = store.screenHeight
  errorMessage.value = ''
})

onBeforeUnmount(stopRenderTimer)

async function startExport() {
  if (busy.value) return
  errorMessage.value = ''
  if (store.mediaUrl && !store.mediaFilePath) {
    errorMessage.value = '独立渲染窗口需要本地媒体文件路径，请从本地文件重新导入视频后再导出。'
    return
  }
  if (
    !Number.isFinite(startMs.value) ||
    !Number.isFinite(endMs.value) ||
    startMs.value < 0 ||
    endMs.value <= startMs.value
  ) {
    errorMessage.value = '请检查导出时间范围。'
    return
  }
  if (width.value % 2 !== 0 || height.value % 2 !== 0) {
    errorMessage.value = 'H.264 视频的宽度和高度需要是偶数。'
    return
  }
  const projectAspectRatio = store.screenWidth / store.screenHeight
  const outputAspectRatio = width.value / height.value
  if (Math.abs(outputAspectRatio - projectAspectRatio) / projectAspectRatio > 0.002) {
    errorMessage.value = '导出宽高比例需要与工程画布一致。修改宽度或高度后离开输入框即可自动匹配。'
    return
  }

  busy.value = true
  elapsedMs.value = 0
  renderStartedAt = 0
  progress.value = { completedFrames: 0, totalFrames: 0, percent: 0, stage: 'preparing' }
  abortController.value = new AbortController()
  try {
    const result = await runVideoExportInRenderWindow({
      startMs: startMs.value,
      endMs: endMs.value,
      fps: fps.value,
      quality: quality.value,
      width: width.value,
      height: height.value,
      screenWidth: store.screenWidth,
      screenHeight: store.screenHeight,
      mediaUrl: store.mediaUrl,
      mediaFilePath: store.mediaUrl ? store.mediaFilePath : '',
      mediaDuration: store.mediaDuration,
      danmakus: store.danmakus
    }, abortController.value.signal, (value) => {
      progress.value = value
      if (value.stage === 'preparing' && renderStartedAt === 0) startRenderTimer()
    })

    if (!result.canceledByUser) {
      notice.log(`视频导出完成：${result.path}`, 'success')
      emit('update:visible', false)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      notice.log('视频导出已取消', 'info')
    } else {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      notice.alert(errorMessage.value, 'error', '视频导出失败')
    }
  } finally {
    stopRenderTimer()
    busy.value = false
    abortController.value = null
  }
}

function getDefaultEndMs() {
  return store.danmakus.reduce((latest, danmaku) => Math.max(
    latest,
    danmaku.startTime + danmaku.animation.duration,
    store.mediaUrl ? store.mediaDuration : 0
  ), 0)
}

function syncHeightToWidth() {
  const widthValue = Number(width.value)
  const aspectRatio = store.screenWidth / store.screenHeight
  if (Number.isFinite(widthValue) && widthValue > 0 && Number.isFinite(aspectRatio)) {
    height.value = Math.max(16, Math.round(widthValue / aspectRatio / 2) * 2)
  }
}

function syncWidthToHeight() {
  const heightValue = Number(height.value)
  const aspectRatio = store.screenWidth / store.screenHeight
  if (Number.isFinite(heightValue) && heightValue > 0 && Number.isFinite(aspectRatio)) {
    width.value = Math.max(16, Math.round(heightValue * aspectRatio / 2) * 2)
  }
}

function startRenderTimer() {
  stopRenderTimer()
  renderStartedAt = Date.now()
  elapsedMs.value = 0
  renderTimer = window.setInterval(() => {
    elapsedMs.value = Date.now() - renderStartedAt
  }, 500)
}

function stopRenderTimer() {
  if (renderTimer !== undefined) {
    window.clearInterval(renderTimer)
    renderTimer = undefined
  }
  if (renderStartedAt > 0) elapsedMs.value = Date.now() - renderStartedAt
  renderStartedAt = 0
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function cancelExport() {
  abortController.value?.abort()
}

function close() {
  if (busy.value) return
  emit('update:visible', false)
}
</script>

<style scoped>
.video-export-dialog {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 9994;
  pointer-events: none;
  color: #e8e8e8;
  font: 14px/1.45 system-ui, sans-serif;
}

.dialog-card {
  pointer-events: auto;
}

.dialog-card {
  width: min(480px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid #444;
  border-radius: 10px;
  background: #202124;
  box-shadow: 0 18px 60px rgb(0 0 0 / 55%);
}

.dialog-header,
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #393a3d;
}

.dialog-footer {
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #393a3d;
  border-bottom: 0;
}

.dialog-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 18px;
}

label {
  display: grid;
  gap: 5px;
  color: #c6c6c6;
}

input,
select {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid #4b4d50;
  border-radius: 5px;
  background: #151617;
  color: #eee;
}

.output-hint,
.progress-section,
.error-message {
  grid-column: 1 / -1;
  margin: 0;
}

.output-hint {
  color: #9a9da1;
  font-size: 12px;
}

progress {
  width: 100%;
  height: 8px;
  accent-color: #66aaff;
}

.progress-caption {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: #c6c6c6;
  font-size: 12px;
}

.render-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.render-stats > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #393a3d;
  border-radius: 6px;
  background: #1a1b1d;
}

.render-stats span {
  color: #9da0a5;
  font-size: 11px;
}

.render-stats strong {
  overflow: hidden;
  color: #f1f3f4;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cancel-button,
.secondary-button,
.primary-button,
.icon-button {
  border: 0;
  border-radius: 5px;
  padding: 7px 12px;
  background: #383a3d;
  color: #eee;
  cursor: pointer;
}

.cancel-button {
  margin-top: 10px;
}

.primary-button {
  background: #2476d2;
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

.icon-button {
  padding: 2px 8px;
  font-size: 22px;
}

.error-message {
  color: #ff9c9c;
}
</style>
