<template>
  <div class="player">
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

    <div class="controls">
      <button @click="toggle">
        {{ store.playing ? '暂停' : '播放' }}
      </button>
      <button @click="importVideo">导入视频</button>
      <button @click="save">保存工程</button>
      <button @click="load">加载工程</button>
      <button @click="download">导出JSON</button>
      <button @click="importProject">导入工程</button>
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
const lastSyncTime = ref(0) // 上次同步的时间戳
const previousCurrentTime = ref(0) // 上一帧的currentTime
const isSyncing = ref(false) // 标志位：是否正在同步

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
        lastSyncTime.value = performance.now()
        
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

function onVideoFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    // 使用 Object URL 创建本地视频 URL
    const url = URL.createObjectURL(file)
    store.setVideoUrl(url)
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

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    store.loadFromFile(file)
  }
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

.screen {
  width: 800px;
  height: 450px;
  background: #000;
  position: relative;
  overflow: hidden;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.controls button {
  padding: 8px 16px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  outline: 2px solid #AAAAAA;
}

.controls button:hover {
  background: #45a049;
}

.video-info {
  color: #aaa;
  font-size: 12px;
}
</style>