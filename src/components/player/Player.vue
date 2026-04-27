<template>
  <div class="player">
    <div class="controls">
      <a href="https://github.com/qmwNEbrVt2233/m7-editor"><img src="/favicon.svg" width="35" height="35" alt="logo"></a>

      <button @click="toggle" class="btn">
        <img :src="store.playing ? './pause.svg' : './play.svg'" alt="toggle" width="13" height="13"/>
      </button>

      <select v-model="activeMenu" class="menu-select">
        <option value="file">文件</option>
        <option value="config">配置</option>
      </select>

      <div v-if="activeMenu === 'file'" class="menu-panel">
        <button @click="importVideo" class="btn">导入视频</button>
        <button @click="save" class="btn">保存工程</button>
        <button @click="load" class="btn">加载工程</button>
        <button @click="download" class="btn">导出工程</button>
        <button @click="importProject" class="btn">导入工程</button>
        <button @click="exportXml" class="btn">导出XML</button>
        <button @click="importXml" class="btn">导入XML</button>
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
          <span class="status-text">当前: {{ store.playheadStepMs.toFixed(6) }}ms</span>
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
      </div>
      
      <input
        type="file"
        ref="videoInput"
        @change="onVideoFileChange"
        style="display: none"
        accept="video/*"
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
    
    <div class="screen">
      <video
        v-if="store.videoUrl"
        ref="videoRef"
        class="video-element"
        :src="store.videoUrl"
        @loadedmetadata="onVideoLoaded"
      />
      <DanmakuLayer />
    </div>

    <div v-if="store.videoUrl" class="video-info">
      视频时长: {{ formatTime(store.videoDuration) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '../../store/editor'
import DanmakuLayer from './DanmakuLayer.vue'
import { ref, watch, onMounted, nextTick } from 'vue'

const store = useEditorStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const xmlInput = ref<HTMLInputElement | null>(null)
const previousCurrentTime = ref(0) // 上一帧的currentTime
const isSyncing = ref(false) // 标志位：是否正在同步
const activeMenu = ref<'file' | 'config'>('file')

// 快捷键配置相关
const playheadStepInput = ref(`${store.playheadStepMs.toFixed(6)}`)

// 弹幕生存时间配置
const danmakuDurationInput = ref(
  store.danmakuDuration.mode === 'multiplier'
    ? `*${store.danmakuDuration.value}`
    : `${store.danmakuDuration.value}`
)

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

// 初始化视频元素引用
onMounted(() => {
  if (videoRef.value) {
    store.setVideoElement(videoRef.value)
  }
})

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
          console.warn('视频播放失败')
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

function importVideo() {
  videoInput.value?.click()
}

function importProject() {
  projectInput.value?.click()
}

function importXml() {
  xmlInput.value?.click()
}

function onVideoFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    // 使用 Object URL 创建本地视频 URL
    const url = URL.createObjectURL(file)
    store.setVideoUrl(url)
    
    // 设置视频文件的磁盘路径（用于导出）
    // 在浏览器中，我们无法直接获取完整路径，但可以保存文件名和大小作为标识
    store.setVideoFilePath(`file:///${file.name}`)
    console.log('视频文件路径已设置:', file.name)
  }
}

function onVideoLoaded() {
  if (videoRef.value) {
    store.setVideoDuration(videoRef.value.duration * 1000) // 秒转ms
  }
}

function save() {
  store.saveToLocal()
}

function load() {
  store.loadFromLocal()
}

function download() {
  store.downloadProject()
}

function exportXml() {
  store.downloadXml()
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

<style scoped>
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
  z-index: 1;
  background-color: #1e1e1e;
  padding: 3px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  position: fixed;
}

/* 下拉菜单样式 */
.menu-select {
  background-color: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.menu-select:hover,
.menu-select:focus {
  border-color: #666;
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
}
</style>
