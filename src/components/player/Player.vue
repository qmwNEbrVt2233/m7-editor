<template>
  <div class="player no-select">
    <div class="controls">
      <div class="logo-container" @mouseenter="showShortcutsNow" @mouseleave="hideShortcutsWithDelay">
        <a href="https://github.com/qmwNEbrVt2233/m7-editor"><img src="/favicon.svg" width="35" height="35" alt="logo"></a>
      </div>
      <div v-show="showShortcuts" class="shortcuts-tooltip have-scrollbar" @mouseenter="showShortcutsNow" @mouseleave="hideShortcutsWithDelay">
        <div class="shortcuts-content">
            <h3>快捷键</h3>
            
            <div class="shortcuts-section">
              <h4>播放与工程</h4>
              <table class="shortcuts-table">
                <tbody>
                  <tr><td>Space</td><td>播放 / 暂停</td></tr>
                  <tr><td>Ctrl + S</td><td>导出工程 JSON</td></tr>
                  <tr><td>Ctrl + D</td><td>保存工程到本地缓存</td></tr>
                  <tr><td>Ctrl + Delete</td><td>清空本地缓存工程</td></tr>
                  <tr><td>Tab</td><td>手动重构缓存池</td></tr>
                </tbody>
              </table>
            </div>

            <div class="shortcuts-section">
              <h4>弹幕编辑</h4>
              <table class="shortcuts-table">
                <tbody>
                  <tr><td>;</td><td>在当前播放头创建一条新弹幕</td></tr>
                  <tr><td>Ctrl + ;</td><td>唤出高级创建工具</td></tr>
                  <tr><td>Delete</td><td>删除当前选中的弹幕</td></tr>
                  <tr><td>Ctrl + C</td><td>复制选中的弹幕</td></tr>
                  <tr><td>Ctrl + Alt + C</td><td>复制当前帧的弹幕，保留当前状态</td></tr>
                  <tr><td>Ctrl + V</td><td>粘贴弹幕</td></tr>
                  <tr><td>Ctrl + A</td><td>全选弹幕</td></tr>
                  <tr><td>Ctrl + Z</td><td>撤销</td></tr>
                  <tr><td>Ctrl + Y</td><td>重做</td></tr>
                  <tr><td>[</td><td>将播放头移动到弹幕的开始位置</td></tr>
                  <tr><td>]</td><td>将播放头移动到弹幕的结束位置</td></tr>
                  <tr><td>Shift + Enter</td><td>编辑文本字段时换行</td></tr>
                  <tr><td>Enter</td><td>将弹幕数据写入</td></tr>
                </tbody>
              </table>
            </div>

            <div class="shortcuts-section">
              <h4>时间轴与播放头</h4>
              <table class="shortcuts-table">
                <tbody>
                  <tr><td>ArrowLeft</td><td>按步长向左移动播放头</td></tr>
                  <tr><td>ArrowRight</td><td>按步长向右移动播放头</td></tr>
                  <tr><td>ArrowUp</td><td>向上移动视图，若有选中的弹幕则将其layer-1（向上移动）</td></tr>
                  <tr><td>ArrowDown</td><td>向下移动视图，若有选中的弹幕则将其layer+1（向下移动）</td></tr>
                  <tr><td>Ctrl + ArrowLeft</td><td>向左平移时间轴一半视图</td></tr>
                  <tr><td>Ctrl + ArrowRight</td><td>向右平移时间轴一半视图</td></tr>
                  <tr><td>Ctrl + Alt + ArrowLeft</td><td>向左平移时间轴 30 秒</td></tr>
                  <tr><td>Ctrl + Alt + ArrowRight</td><td>向右平移时间轴 30 秒</td></tr>
                  <tr><td>Ctrl + -</td><td>缩小时间轴视图</td></tr>
                  <tr><td>Ctrl + =</td><td>放大时间轴视图</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      <button @click="toggle" class="btn">
        <svg  v-if="store.playing" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100" height="100" viewBox="0 0 100 100" xml:space="preserve" style="width: 13px; height: 13px;">
          <g transform="matrix(0.11 0 0 0.77 29.84 50)" id="obj-6"  >
            <rect style="stroke: rgb(255,255,255); stroke-opacity: 0; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  x="-99" y="-59" rx="0" ry="0" width="198" height="118" />
          </g>
          <g transform="matrix(0.11 0 0 0.77 70.09 49.79)" id="obj-8"  >
            <rect style="stroke: rgb(255,255,255); stroke-opacity: 0; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  x="-99" y="-59" rx="0" ry="0" width="198" height="118" />
          </g>
        </svg>

        <svg v-if="!store.playing" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100" height="100" viewBox="0 0 100 100" xml:space="preserve" style="width: 13px; height: 13px;">
          <g transform="matrix(0 0.58 -0.62 0 50.58 49.91)" id="obj-5"  >
            <path style="stroke: rgb(255,255,255); stroke-opacity: 0; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: round; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  transform=" translate(-100, -90)" d="M 100 10 L 185 170 L 15 170 L 100 10 Z" stroke-linecap="round" />
          </g>
        </svg>

      </button>

      <select v-model="activeMenu" class="menu-select">
        <option value="file">文件</option>
        <option value="config">配置</option>
        <option value="player">播放器</option>
        <option value="preprocess">预处理</option>
      </select>

      <div v-if="activeMenu === 'file'" class="menu-panel">
        <button @click="importVideo" class="btn">导入媒体</button>
        <button @click="saveProject" class="btn">导出工程</button>
        <button @click="importProject" class="btn">导入工程</button>
        <button @click="exportXml" class="btn">导出XML</button>
        <button @click="importXml" class="btn">导入XML</button>
        <button @click="saveCache" class="btn">保存缓存</button>
        <button @click="loadCache" class="btn">加载缓存</button>
        <button @click="clearCache" class="btn btn-danger">清空缓存工程</button>
      </div>

      <div v-if="activeMenu === 'config'" class="menu-panel">
        <div class="config-group">
          <span>播放头移动步长:</span>
          <input
            type="text"
            v-model="playheadStepInput"
            @change="onPlayheadStepChange"
            placeholder="如 33 或 /60"
            class="dark-input"
            title="输入毫秒数(如33)或帧率(如/60表示60fps)"
          />
        </div>
        
        <div class="divider"></div>

        <div class="config-group">
          <span>创建弹幕生存时间:</span>
          <input
            type="text"
            v-model="danmakuDurationInput"
            @change="onDanmakuDurationChange"
            placeholder="如 1000 或 *2"
            class="dark-input"
            title="输入毫秒数(如1000)或倍数(如*2表示2倍moveDuration)"
          />
          <span class="status-text">当前: {{ store.danmakuDuration.value }}{{ store.danmakuDuration.mode === 'multiplier' ? '倍' : 'ms' }}</span>
        </div>

        <div class="divider"></div>

        <div class="config-group">
          <span>Layer:</span>
          <input
            type="number"
            v-model="maxLayersInput"
            @change="onMaxLayersChange"
            min="1"
            class="dark-input"
          />
        </div>
      </div>

      <div v-if="activeMenu === 'player'" class="menu-panel">
        <div class="config-group">
          <span>宽:</span>
          <input
            type="number"
            v-model="screenWidthInput"
            @change="onScreenSizeChange"
            min="1"
            class="dark-input"
          />
        </div>

        <div class="config-group">
          <span>高:</span>
          <input
            type="number"
            v-model="screenHeightInput"
            @change="onScreenSizeChange"
            min="1"
            class="dark-input"
          />
        </div>

        <div class="divider"></div>

        <label class="config-group checkbox-group">
          <input
            type="checkbox"
            v-model="aggressiveOptimization"
            @change="onAggressiveOptimizationChange"
          />
          <span>激进优化</span>
        </label>
      </div>

      <div v-if="activeMenu === 'preprocess'" class="menu-panel">
        <label class="config-group checkbox-group">
          <input
            type="checkbox"
            v-model="exportXmlAsRatio"
            @change="onExportRatioChange"
          />
          <span>XML按百分比导出</span>
        </label>

        <div class="divider"></div>

        <label class="config-group checkbox-group">
          <input
            type="checkbox"
            v-model="importXmlDurationOffsetEnabled"
            @change="onImportDurationOffsetChange"
          />
          <span>对导入xml进行-50ms处理</span>
        </label>

        <label class="config-group checkbox-group">
          <input
            type="checkbox"
            v-model="exportXmlDurationOffsetEnabled"
            @change="onExportDurationOffsetChange"
          />
          <span>对导出xml进行+50ms处理</span>
        </label>
      </div>
      
      <input
        type="file"
        ref="videoInput"
        @change="onVideoFileChange"
        style="display: none"
        accept="video/*,audio/*"
      />
      <input
        type="file"
        ref="projectInput"
        @change="onFileChange"
        style="display: none"
        accept=".json"
      />
      <input
        type="file"
        ref="xmlInput"
        @change="onXmlFileChange"
        style="display: none"
        accept=".xml,text/xml,application/xml"
      />
    </div>
    
    <div class="screen" :style="screenStyle">
      <video
        v-if="store.videoUrl"
        ref="videoRef"
        class="video-element"
        :src="store.videoUrl"
        @loadedmetadata="onVideoLoaded"
      />
      <DanmakuLayer />
    </div>

    <div v-if="store.videoUrl" class="video-info" :style="videoInfoStyle">
      媒体时长: {{ formatTime(store.videoDuration) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '../../store/editor'
import DanmakuLayer from './DanmakuLayer.vue'
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import {
  getFileInputPath,
  isTauriRuntime,
  openMediaFileWithTauri,
  registerMediaPath
} from '@/utils/tauriMedia'

const store = useEditorStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const xmlInput = ref<HTMLInputElement | null>(null)
const previousCurrentTime = ref(0) // 上一帧的currentTime
const isSyncing = ref(false) // 标志位：是否正在同步
const activeMenu = ref<'file' | 'config' | 'player' | 'preprocess'>('file')
const showShortcuts = ref(false) // 快捷键提示框显示状态
let shortcutsHideTimer: ReturnType<typeof setTimeout> | null = null

// 快捷键配置相关
const playheadStepInput = ref(`${store.playheadStepMs.toFixed(6)}`)

// 弹幕生存时间配置
const danmakuDurationInput = ref(
  store.danmakuDuration.mode === 'multiplier'
    ? `*${store.danmakuDuration.value}`
    : `${store.danmakuDuration.value}`
)

const screenWidthInput = ref(String(store.screenWidth))
const screenHeightInput = ref(String(store.screenHeight))
const maxLayersInput = ref(String(store.maxLayers))
const exportXmlAsRatio = ref(store.exportXmlAsRatio)
const importXmlDurationOffsetEnabled = ref(store.importXmlDurationOffsetEnabled)
const exportXmlDurationOffsetEnabled = ref(store.exportXmlDurationOffsetEnabled)
const aggressiveOptimization = ref(store.aggressiveOptimization)

const screenStyle = computed(() => ({
  width: `${store.screenWidth}px`,
  height: `${store.screenHeight}px`
}))

const videoInfoStyle = computed(() => ({
  top: `${store.screenHeight + 60}px`
}))

// 处理播放头步长输入变化
function onPlayheadStepChange(e: Event) {
  const input = (e.target as HTMLInputElement).value.trim()
  
  if (!input) return
  
  let stepMs = 16.666667  // 默认60fps
  
  // 检查是否是帧率格式 '/60'
  if (input.startsWith('/')) {
    const fpsStr = input.substring(1)
    const fps = parseInt(fpsStr)
    if (fps > 0) {
      stepMs = 1000 / fps
    }
  } else {
    // 否则按ms处理
    const ms = parseFloat(input)
    if (ms > 0) {
      stepMs = ms
    }
  }
  
  // 验证合法性
  if (stepMs > 0 && stepMs <= 10000) {
    store.playheadStepMs = stepMs
    playheadStepInput.value = `${stepMs.toFixed(6)}`
  }
}

// 处理弹幕生存时间输入变化
function onDanmakuDurationChange(e: Event) {
  const input = (e.target as HTMLInputElement).value.trim()
  
  if (!input) return
  
  // 检查是否是倍数格式 '*2'
  if (input.startsWith('*')) {
    const multiplierStr = input.substring(1)
    const multiplier = parseFloat(multiplierStr)
    if (multiplier > 0) {
      store.setDanmakuDuration('multiplier', multiplier)
      danmakuDurationInput.value = input
    }
  } else {
    // 否则按ms处理
    const ms = parseFloat(input)
    if (ms > 0) {
      store.setDanmakuDuration('ms', ms)
      danmakuDurationInput.value = input
    }
  }
}

function onScreenSizeChange() {
  const width = parseInt(screenWidthInput.value, 10)
  const height = parseInt(screenHeightInput.value, 10)

  if (width > 0 && height > 0) {
    store.setScreenSize(width, height)
    screenWidthInput.value = String(store.screenWidth)
    screenHeightInput.value = String(store.screenHeight)
  }
}

function onExportRatioChange() {
  store.setExportXmlAsRatio(exportXmlAsRatio.value)
}

function onImportDurationOffsetChange() {
  store.setImportXmlDurationOffsetEnabled(importXmlDurationOffsetEnabled.value)
}

function onExportDurationOffsetChange() {
  store.setExportXmlDurationOffsetEnabled(exportXmlDurationOffsetEnabled.value)
}

function onMaxLayersChange() {
  const maxLayers = parseInt(maxLayersInput.value, 10)
  if (maxLayers > 0) {
    store.setMaxLayers(maxLayers)
  }
  maxLayersInput.value = String(store.maxLayers)
}

function onAggressiveOptimizationChange() {
  store.setAggressiveOptimization(aggressiveOptimization.value)
}

// 隐藏快捷键提示框，带有延迟以允许鼠标移入快捷键列表
function hideShortcutsWithDelay() {
  if (shortcutsHideTimer) clearTimeout(shortcutsHideTimer)
  shortcutsHideTimer = setTimeout(() => {
    showShortcuts.value = false
  }, 100)
}

// 显示快捷键并取消隐藏定时器
function showShortcutsNow() {
  if (shortcutsHideTimer) clearTimeout(shortcutsHideTimer)
  showShortcuts.value = true
}

// 初始化视频元素引用，并在 Tauri 中恢复工程内记录的真实媒体路径
onMounted(async () => {
  await store.resolveVideoPath()
  await nextTick()
  store.setVideoElement(videoRef.value)
})

watch(videoRef, (element) => {
  store.setVideoElement(element)
})

watch(
  () => store.screenWidth,
  (width) => {
    screenWidthInput.value = String(width)
  }
)

watch(
  () => store.screenHeight,
  (height) => {
    screenHeightInput.value = String(height)
  }
)

watch(
  () => store.exportXmlAsRatio,
  (enabled) => {
    exportXmlAsRatio.value = enabled
  }
)

watch(
  () => store.importXmlDurationOffsetEnabled,
  (enabled) => {
    importXmlDurationOffsetEnabled.value = enabled
  }
)

watch(
  () => store.exportXmlDurationOffsetEnabled,
  (enabled) => {
    exportXmlDurationOffsetEnabled.value = enabled
  }
)

watch(
  () => store.maxLayers,
  (value) => {
    maxLayersInput.value = String(value)
  }
)

watch(
  () => store.aggressiveOptimization,
  (enabled) => {
    aggressiveOptimization.value = enabled
  }
)

// 监听currentTime变化，同步视频
watch(
  () => store.currentTime,
  () => {
    if (!videoRef.value || !store.videoUrl || isSyncing.value) return
    
    const currentTime = store.currentTime
    const timeDelta = currentTime - previousCurrentTime.value
    
    // 检测用户拖动播放头（时间跳跃超过100ms）
    const isUserDrag = Math.abs(timeDelta) > 100
    
    // 在暂停状态或检测到拖动时进行同步
    if (!store.playing || isUserDrag) {
      const videoTime = currentTime / 1000 // ms转秒
      const videoDelta = Math.abs(videoRef.value.currentTime - videoTime)
      
      // 只有在偏差超过50ms时才同步
      if (videoDelta > 0.05) {
        isSyncing.value = true
        videoRef.value.currentTime = videoTime
        
        nextTick(() => {
          isSyncing.value = false
        })
      }
    }
    
    previousCurrentTime.value = currentTime
  }
)

// 监听播放状态变化
watch(
  () => store.playing,
  (isPlaying) => {
    if (!videoRef.value || !store.videoUrl) return
    
    if (isPlaying) {
      // 确保视频时间与编辑器时间同步后再播放
      const videoTime = store.currentTime / 1000
      if (Math.abs(videoRef.value.currentTime - videoTime) > 0.1) {
        videoRef.value.currentTime = videoTime
      }
      
      nextTick(() => {
        videoRef.value?.play().catch(() => {
          console.warn('播放失败')
        })
      })
    } else {
      videoRef.value.pause()
    }
  }
)

function toggle() {
  if (store.playing) {
    store.pausePlayback()
  } else {
    store.startPlayback()
  }
}

async function importVideo() {
  if (isTauriRuntime()) {
    try {
      const media = await openMediaFileWithTauri()

      if (media) {
        store.setVideoSource(media.url, media.path)
        console.log('媒体文件路径已设置:', media.path)
      }

      return
    } catch (error) {
      console.warn('[媒体] Tauri 文件选择失败，回退到浏览器文件选择', error)
    }
  }

  videoInput.value?.click()
}

function importProject() {
  projectInput.value?.click()
}

function importXml() {
  xmlInput.value?.click()
}

async function onVideoFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    const nativePath = getFileInputPath(file)

    if (nativePath && isTauriRuntime()) {
      try {
        const media = await registerMediaPath(nativePath)
        store.setVideoSource(media.url, media.path)
        console.log('媒体文件路径已设置:', media.path)
        input.value = ''
        return
      } catch (error) {
        console.warn('[媒体] 真实路径注册失败，回退到临时 Object URL', error)
      }
    }

    const url = URL.createObjectURL(file)
    store.setVideoSource(url, '')
    console.log('媒体文件已临时载入:', file.name)
  }

  input.value = ''
}

function onVideoLoaded() {
  if (videoRef.value) {
    store.setVideoDuration(videoRef.value.duration * 1000) // 秒转ms
  }
}

async function saveProject() {
  await store.downloadProject()
}

async function exportXml() {
  await store.downloadXml()
}

function saveCache() {
  store.saveToLocal()
}

function loadCache() {
  store.loadFromLocal()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    store.loadFromFile(file)
  }
}

function onXmlFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    store.loadXmlFromFile(file)
    input.value = ''
  }
}

/**
 * 清空缓存工程
 */
function clearCache() {
  store.clearCache()
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped lang="css">
.player {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 12px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  z-index: 11;
  background-color: #1e1e1e;
  padding: 3px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  position: fixed;
}

.logo-container {
  position: relative;
  display: flex;
  align-items: center;
}

.logo-container a {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.logo-container a img {
  transition: opacity 0.2s ease;
}

.logo-container a:hover img {
  opacity: 0.8;
}

/* 快捷键提示框样式 */
.shortcuts-tooltip {
  position: fixed;
  top: 60px;
  left: 16px;
  background-color: #252525;
  border: 1px solid #404040;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  max-height: 80vh;
  overflow-y: auto;
  font-size: 12px;
}

.shortcuts-content {
  padding: 16px;
  min-width: 300px;
}

.shortcuts-content h3 {
  margin: 0 0 16px 0;
  color: #e0e0e0;
  font-size: 14px;
  text-align: center;
  border-bottom: 1px solid #404040;
  padding-bottom: 12px;
}

.shortcuts-section {
  margin-bottom: 16px;
}

.shortcuts-section h4 {
  margin: 0 0 8px 0;
  color: #b0b0b0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.shortcuts-table {
  width: 100%;
  border-collapse: collapse;
}

.shortcuts-table tr {
  border-bottom: 1px solid #323232;
}

.shortcuts-table tr:last-child {
  border-bottom: none;
}

.shortcuts-table td {
  padding: 8px 12px;
  color: #d0d0d0;
  text-align: left;
}

.shortcuts-table td:first-child {
  color: #64b5f6;
  font-weight: 500;
  font-family: 'Courier New', monospace;
  width: 180px;
}

.shortcuts-table tr:hover {
  background-color: #2d2d2d;
}

/* 子面板容器 */
.menu-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 通用按钮黑色风格 */
.btn {
  padding: 10px 14px;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s ease;
}

.btn:hover {
  background: #3d3d3d;
  border-color: #666;
  color: #fff;
}

.btn:active {
  background: #222;
}

/* 危险操作按钮（清空缓存） */
.btn-danger {
  background: #5c2018;
  color: #ffb3b3;
  border-color: #8a2e24;
}

.btn-danger:hover {
  background: #7a2820;
  border-color: #a3382d;
  color: #fff;
}

/* 配置组文本与输入框 */
.config-group {
  display: flex;
  align-items: center;
  color: #b0b0b0;
  font-size: 13px;
}

.checkbox-group {
  gap: 8px;
  cursor: pointer;
}

.checkbox-group input[type='checkbox'] {
  cursor: pointer;
}

.dark-input {
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  width: 80px;
  padding: 10px 8px;
  margin: 0 8px;
  border-radius: 3px;
  outline: none;
  transition: border-color 0.2s;
}

.dark-input:focus {
  border-color: #64b5f6;
}

.status-text {
  color: #888;
  font-size: 12px;
}

/* 面板内的分割线 */
.divider {
  width: 1px;
  height: 20px;
  background-color: #444;
  margin: 0 4px;
}

/* 屏幕和视频区 */
.screen {
  width: 800px;
  height: 450px;
  background: #000;
  position: relative;
  overflow: hidden;
  position: fixed;
  top: 60px;
  z-index: 0
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-info {
  color: #aaa;
  font-size: 12px;
  position: fixed;
}
</style>