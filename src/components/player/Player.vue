<template>
  <div class="player no-select">
    <div class="screen" :style="screenStyle">
      <video
        v-if="store.mediaUrl"
        ref="mediaRef"
        class="media-element"
        :src="store.mediaUrl"
        @loadedmetadata="onMediaLoaded"
      />
      <DanmakuLayer />
    </div>

    <div v-if="!store.screenRecordingMode && store.mediaUrl && store.playing" class="media-info" :style="mediaInfoStyle">
      媒体时长: {{ formatTime(store.mediaDuration) }}
    </div>

    <div v-if="!store.screenRecordingMode && !store.playing" class="media-info" :style="mediaInfoStyle">
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
const mediaRef = ref<HTMLMediaElement | null>(null)
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

const mediaInfoStyle = computed(() => ({
  top: `${store.screenHeight * store.screenScale / 100 + 60}px`
}))

// 初始化视频元素引用，并在 Tauri 中恢复工程内记录的真实媒体路径
onMounted(async () => {
  await store.resolveMediaPath()
  await nextTick()
  store.setMediaElement(mediaRef.value)
})

watch(mediaRef, (element) => {
  store.setMediaElement(element)
})

// 监听currentTime变化，同步视频
watch(
  () => store.currentTime,
  () => {
    if (!mediaRef.value || !store.mediaUrl || isSyncing.value) return
    
    const currentTime = store.currentTime
    const timeDelta = currentTime - previousCurrentTime.value
    
    // 检测用户拖动播放头（时间跳跃超过100ms）
    const isUserDrag = Math.abs(timeDelta) > 100
    
    // 在暂停状态或检测到拖动时进行同步
    if (!store.playing || isUserDrag) {
      const mediaTime = currentTime / 1000 // ms转秒
      const mediaDelta = Math.abs(mediaRef.value.currentTime - mediaTime)
      
      // 只有在偏差超过50ms时才同步
      if (mediaDelta > 0.05) {
        isSyncing.value = true
        mediaRef.value.currentTime = mediaTime
        
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
    if (!mediaRef.value || !store.mediaUrl) return
    
    if (isPlaying) {
      // 确保视频时间与编辑器时间同步后再播放
      const mediaTime = store.currentTime / 1000
      if (Math.abs(mediaRef.value.currentTime - mediaTime) > 0.1) {
        mediaRef.value.currentTime = mediaTime
      }
      
      nextTick(() => {
        mediaRef.value?.play().catch(() => {
          notice.alert('播放失败', 'error', '错误')
        })
      })
    } else {
      mediaRef.value.pause()
    }
  }
)

function onMediaLoaded() {
  if (mediaRef.value) {
    store.setMediaDuration(mediaRef.value.duration * 1000) // 秒转ms
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

.media-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.media-info {
  color: #aaa;
  font-size: 12px;
  position: fixed;
}
</style>