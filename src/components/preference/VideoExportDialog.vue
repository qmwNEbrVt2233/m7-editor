<template>
  <div v-if="visible" class="video-export-dialog no-select">
    <section ref="dialogRoot" class="dialog-card" :style="dialogPositionStyle">
      <header class="dialog-header" @pointerdown="startDialogDrag">
        <strong>导出视频</strong>
        <button class="icon-button" :aria-label="busy ? '隐藏导出进度' : '关闭'" @pointerdown.stop @click="close">✕</button>
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
            <option :value="120">120 fps</option>
          </select>
        </label>
        <label>
          <span>画质</span>
          <select v-model="quality" :disabled="busy">
            <option value="low">低质量（快速预览）</option>
            <option value="high">高质量</option>
            <option value="very-high">极高质量（速度更慢、文件更大）</option>
            <option value="near-lossless">近无损（速度很慢、文件极大）</option>
          </select>
        </label>
        <label class="checkbox-field" :class="{ disabled: busy || !nativeRuntime }">
          <input
            type="checkbox"
            :checked="effectiveUseWebgl"
            :disabled="busy || !nativeRuntime"
            @change="onUseWebglChange"
          />
          <span>使用 WebGL 渲染{{ nativeRuntime ? '' : '（网页版仅支持此模式）' }}</span>
        </label>
        <p class="output-hint">{{ renderModeHint }}</p>
        <p class="output-hint">{{ outputHint }}</p>

        <div v-if="busy" class="progress-section">
          <p class="snapshot-hint">使用导出开始时的弹幕快照；期间继续编辑不会改变当前渲染</p>
          <progress :value="progress.percent" max="1"></progress>
          <div class="progress-caption">
            <span>{{ progressText }}</span>
            <span>{{ Math.round(progress.percent * 100) }}%</span>
          </div>
          <div class="render-stats">
            <div><span>总渲染时间</span><strong>{{ elapsedTimeText }}</strong></div>
            <div><span>预计剩余时间</span><strong>{{ estimatedFinishText }}</strong></div>
            <div><span>平均每帧</span><strong>{{ averageFrameTimeText }}</strong></div>
          </div>
          <button class="cancel-button" @click="cancelExport">取消导出</button>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      </div>

      <footer class="dialog-footer">
        <button class="secondary-button" @click="close">{{ busy ? '隐藏' : '关闭' }}</button>
        <button class="primary-button" :disabled="busy" @click="startExport">
          {{ busy ? '正在导出…' : '开始导出' }}
        </button>
      </footer>
    </section>
  </div>
  <div v-if="busy && !visible" class="progress-notice no-select" @click="emit('update:visible', true)">
    <span>{{ progressText + '　预计剩余时间：' + estimatedFinishText }}</span>
    <progress :value="progress.percent" max="1"></progress>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  computeVideoExportStats,
  normalizeEvenVideoDimension,
  resolveVideoExportDimensions,
  useEditorStore
} from '@/store/editor'
import { formatDuration } from '@/utils/time'
import { isTauriRuntime } from '@/utils/tauriBackend'
import type { ExportQuality } from '@/core/videoExport/quality'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
}>()

const store = useEditorStore()
const nativeRuntime = isTauriRuntime()
const busy = computed(() => store.videoExport.status === 'running')
const effectiveUseWebgl = computed(() => (
  busy.value ? store.videoExport.useWebgl : (nativeRuntime ? store.useWebglVideoExport : true)
))
const dialogRoot = ref<HTMLElement | null>(null)
const dialogPosition = ref<{ left: number; top: number } | null>(null)
const dialogPositionStyle: any = computed(() => dialogPosition.value
  ? {
      left: `${dialogPosition.value.left}px`,
      top: `${dialogPosition.value.top}px`,
      right: 'auto',
      position: 'fixed'
    }
  : {})
const startMs = ref(0)
const endMs = ref(store.mediaDuration)
const fps = ref(60)
const quality = ref<ExportQuality>('very-high')
const width = ref(store.screenWidth)
const height = ref(store.screenHeight)
const errorMessage = ref('')
const progress = computed(() => store.videoExport.progress)
const elapsedMs = computed(() => store.videoExport.elapsedMs)
const exportStats = computed(() => computeVideoExportStats(progress.value, elapsedMs.value))
let dragOffset = { x: 0, y: 0 }
let activePointerId: number | null = null
const elapsedTimeText = computed(() => formatDuration(elapsedMs.value))
const averageFrameTimeText = computed(() => {
  const averageFrameMs = exportStats.value.averageFrameMs
  if (averageFrameMs === null) return '计算中'
  return averageFrameMs >= 1000
    ? `${(averageFrameMs / 1000).toFixed(2)} 秒/帧`
    : `${Math.round(averageFrameMs)} 毫秒/帧`
})
const estimatedFinishText = computed(() => {
  const { stage, completedFrames, totalFrames } = progress.value
  if (stage === 'preparing' || totalFrames <= 0 || completedFrames <= 0) return '计算中'
  if (stage === 'finalizing') return '封装中'
  const remainingMs = exportStats.value.estimatedRemainingMs
  if (completedFrames >= totalFrames || remainingMs === null) return '即将完成'
  return formatDuration(remainingMs)
})
const renderModeHint = computed(() => {
  if (!nativeRuntime) {
    return '网页版通过 WebGL + WebCodecs 离线渲染，导出完成后将直接写入所选文件或触发浏览器下载。'
  }
  if (effectiveUseWebgl.value) {
    return '已开启 WebGL 离屏渲染（默认开启，速度快数十倍；极小字号文字与预览的细微字距可能略有差异）。'
  }
  return '已关闭 WebGL：将使用独立桌面渲染窗口逐帧截图（所见即所得），但耗时将大幅增加数十倍。'
})
const outputHint = computed(() => store.mediaUrl
  ? 'MP4 / H.264，默认使用工程画布尺寸并保留源视频音轨；输出宽高跟随工程比例。'
  : '未导入视频时导出弹幕画布，不包含音轨；默认时长取弹幕最晚结束时间，输出宽高跟随工程比例。')
const progressText = computed(() => {
  if (progress.value.detail) return progress.value.detail
  if (progress.value.stage === 'preparing') return '准备编码器与输出文件'
  if (progress.value.stage === 'finalizing') return store.mediaUrl ? '正在封装 MP4 与音轨' : '正在完成无音轨 MP4'
  return `${progress.value.completedFrames.toLocaleString()} / ${progress.value.totalFrames.toLocaleString()} 帧`
})

watch(() => props.visible, (visible) => {
  if (!visible) {
    stopDialogDrag()
    return
  }
  errorMessage.value = ''
  if (busy.value) {
    startMs.value = store.videoExport.startMs
    endMs.value = store.videoExport.endMs
    fps.value = store.videoExport.fps
    quality.value = store.videoExport.quality
    width.value = store.videoExport.width
    height.value = store.videoExport.height
    return
  }
  startMs.value = 0
  endMs.value = store.getDefaultVideoExportEndMs()
  width.value = store.screenWidth
  height.value = store.screenHeight
})

onBeforeUnmount(() => {
  stopDialogDrag()
})

function startDialogDrag(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || !dialogRoot.value) return
  event.preventDefault()
  const bounds = dialogRoot.value.getBoundingClientRect()
  dialogPosition.value = { left: bounds.left, top: bounds.top }
  dragOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  activePointerId = event.pointerId
  window.addEventListener('pointermove', onDialogDragMove)
  window.addEventListener('pointerup', stopDialogDrag)
  window.addEventListener('pointercancel', stopDialogDrag)
}

function onDialogDragMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId || !dialogRoot.value || !dialogPosition.value) return
  const bounds = dialogRoot.value.getBoundingClientRect()
  dialogPosition.value = {
    left: Math.min(Math.max(0, event.clientX - dragOffset.x), Math.max(0, window.innerWidth - bounds.width)),
    top: Math.min(Math.max(0, event.clientY - dragOffset.y), Math.max(0, window.innerHeight - bounds.height))
  }
}

function stopDialogDrag(event?: PointerEvent) {
  if (event && event.pointerId !== activePointerId) return
  activePointerId = null
  window.removeEventListener('pointermove', onDialogDragMove)
  window.removeEventListener('pointerup', stopDialogDrag)
  window.removeEventListener('pointercancel', stopDialogDrag)
}

function onUseWebglChange(event: Event) {
  if (!nativeRuntime) return
  store.setUseWebglVideoExport((event.target as HTMLInputElement).checked)
}

async function startExport() {
  if (busy.value) return
  errorMessage.value = ''
  if (nativeRuntime && !effectiveUseWebgl.value && store.mediaUrl && !store.mediaFilePath) {
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
  let resolvedSize: { width: number; height: number }
  try {
    resolvedSize = resolveVideoExportDimensions(
      store.screenWidth,
      store.screenHeight,
      width.value,
      height.value
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    return
  }

  try {
    const result = await store.startVideoExportFromDialog({
      startMs: startMs.value,
      endMs: endMs.value,
      fps: fps.value,
      quality: quality.value,
      width: resolvedSize.width,
      height: resolvedSize.height,
      useWebgl: effectiveUseWebgl.value
    })
    if (result.status === 'completed') {
      emit('update:visible', false)
    } else if (result.status === 'failed' && result.error) {
      errorMessage.value = result.error
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function syncHeightToWidth() {
  const widthValue = Number(width.value)
  const aspectRatio = store.screenWidth / store.screenHeight
  if (Number.isFinite(widthValue) && widthValue > 0 && Number.isFinite(aspectRatio)) {
    height.value = normalizeEvenVideoDimension(widthValue / aspectRatio)
  }
}

function syncWidthToHeight() {
  const heightValue = Number(height.value)
  const aspectRatio = store.screenWidth / store.screenHeight
  if (Number.isFinite(heightValue) && heightValue > 0 && Number.isFinite(aspectRatio)) {
    width.value = normalizeEvenVideoDimension(heightValue * aspectRatio)
  }
}

function cancelExport() {
  void store.cancelVideoExport()
}

function close() {
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
}

.dialog-card {
  pointer-events: auto;
}

.dialog-card {
  width: min(480px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid #444;
  border-radius: 8px;
  background: #1e1e1e;
  box-shadow: 0 18px 60px rgb(0 0 0 / 55%);
}

.dialog-header,
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #393a3d;
  font-size: 14px;
}

.dialog-header {
  cursor: grab;
  touch-action: none;
}

.dialog-header:active {
  cursor: grabbing;
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
  font-size: 13px;
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
  border-radius: 3px;
  background: #151617;
  color: #eee;
}

.checkbox-field {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-field.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.checkbox-field input[type='checkbox'] {
  width: auto;
  min-height: 0;
  padding: 0;
  margin: 0;
  accent-color: #66aaff;
  cursor: inherit;
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

.snapshot-hint {
  margin: 0 0 8px;
  color: #9a9da1;
  font-size: 12px;
}

progress {
  width: 100%;
  accent-color: #66aaff;
}

.progress-caption {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: #c6c6c6;
  font-size: 12px;
}

.progress-notice {
  position: fixed;
  right: 0;
  bottom: 0;
  width: 400px;
  padding: 3px 7px;
  background-color: #333;
  z-index: 10000;
  border-radius: 4px 0 0 0;
  color: #c6c6c6;
  font-size: 12px;
  display: flex;
  align-items: center;
  flex-direction: column;
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
  border-radius: 3px;
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

.icon-button {
  padding: 2px 8px;
  font-size: 16px;
  background: none;
  border: none;
  color: #b7b7b7;
  cursor: pointer;
}

.icon-button:hover {
  color: #fff;
}

.cancel-button,
.secondary-button,
.primary-button {
  padding: 8px 13px;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s ease;
}

.cancel-button {
  margin-top: 10px;
}

.cancel-button:hover,
.secondary-button:hover {
  background: #3d3d3d;
  border-color: #666;
  color: #fff;
}

.primary-button {
  background: #2476d2;
}

.primary-button:hover {
  background: #387ccb;
  border-color: #6182b1;
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

.error-message {
  color: #ff9c9c;
}
</style>
