<template>
  <div class="player no-select">
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

    <div v-if="!store.screenRecordingMode && store.videoUrl && store.playing" class="video-info" :style="videoInfoStyle">
      媒体时长: {{ formatTime(store.videoDuration) }}
    </div>

    <div v-if="!store.screenRecordingMode && !store.playing" class="video-info" :style="videoInfoStyle">
      当前时间: {{ Math.round(store.currentTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import DanmakuLayer from './DanmakuLayer.vue'
import { ref, watch, onMounted, nextTick, computed } from 'vue'

const store = useEditorStore()
const notice = useNoticeStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const previousCurrentTime = ref(0)
const isSyncing = ref(false)

const screenStyle = computed(() => ({
  width: `${store.screenWidth}px`,
  height: `${store.screenHeight}px`,
  transformOrigin: `top left`,
  transform: `scale(${store.screenScale / 100})`,
  left: store.screenRecordingMode ? '0' : undefined,
  top: store.screenRecordingMode ? '0' : '60px'
}))

const videoInfoStyle = computed(() => ({
  top: `${store.screenHeight * store.screenScale / 100 + 60}px`
}))

// 初始化视频元素引用，并在 Tauri 中恢复工程内记录的真实媒体路径
onMounted(async () => {
  await store.resolveVideoPath()
  await nextTick()
  store.setVideoElement(videoRef.value)
})

watch(videoRef, (element) => {
  store.setVideoElement(element)
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
          notice.alert('播放失败', 'error', '错误')
        })
      })
    } else {
      videoRef.value.pause()
    }
  }
)

function onVideoLoaded() {
  if (videoRef.value) {
    store.setVideoDuration(videoRef.value.duration * 1000) // 秒转ms
  }
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

.screen {
  width: 800px;
  height: 450px;
  background: #000;
  position: relative;
  overflow: hidden;
  position: fixed;
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