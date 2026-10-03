<template>
  <div class="player no-select">
    <div ref="screenRef" class="screen" :style="screenStyle">
      <video
        v-if="store.mediaUrl"
        ref="mediaRef"
        class="media-element"
        :src="store.mediaUrl"
        @loadedmetadata="onMediaLoaded"
      />
      <DanmakuLayer :render-time-ms="exportTimeMs" :render-danmakus="exportDanmakus" />
    </div>

    <div v-if="!store.screenRecordingMode && !exportLayout && store.mediaUrl && store.playing" class="media-info" :style="mediaInfoStyle">
      媒体时长: {{ formatTime(store.mediaDuration) }}
    </div>

    <div v-if="!store.screenRecordingMode && !exportLayout && !store.playing" class="media-info" :style="mediaInfoStyle">
      当前时间: {{ Math.round(store.currentTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import DanmakuLayer from './DanmakuLayer.vue'
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'

const store = useEditorStore()
const notice = useNoticeStore()
const props = withDefaults(defineProps<{ exportLayout?: boolean; resolveMedia?: boolean }>(), {
  exportLayout: false,
  resolveMedia: true
})
const mediaRef = ref<HTMLMediaElement | null>(null)
const screenRef = ref<HTMLDivElement | null>(null)
const previousCurrentTime = ref(0)
const isSyncing = ref(false)
const exportTimeMs = ref<number | null>(null)
const exportDanmakus = ref<DanmakuItem[] | undefined>(undefined)
const screenScale = computed(() => store.screenScale / 100)
const screenStyle = computed(() => ({
  width: `${store.screenWidth}px`,
  height: `${store.screenHeight}px`,
  transformOrigin: `top left`,
  transform: `scale(${screenScale.value})`,
  left: props.exportLayout
    ? `${Math.max(0, (window.innerWidth - store.screenWidth * screenScale.value) / 2)}px`
    : store.screenRecordingMode || exportTimeMs.value !== null ? '0' : undefined,
  top: props.exportLayout
    ? `${Math.max(0, (window.innerHeight - store.screenHeight * screenScale.value) / 2)}px`
    : store.screenRecordingMode || exportTimeMs.value !== null ? '0' : '60px'
}))

const mediaInfoStyle = computed(() => ({
  top: `${store.screenHeight * store.screenScale / 100 + 60}px`
}))

// 初始化视频元素引用，并在 Tauri 中恢复工程内记录的真实媒体路径
onMounted(async () => {
  if (props.resolveMedia) {
    await store.resolveMediaPath()
  }
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
    if (!mediaRef.value || !store.mediaUrl || isSyncing.value || exportTimeMs.value !== null) return
    
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
    if (!mediaRef.value || !store.mediaUrl || exportTimeMs.value !== null) return
    
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

function waitForMediaEvent(video: HTMLMediaElement, eventName: 'seeked' | 'loadeddata', timeoutMs = 10000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(`等待视频${eventName}事件超时`))
    }, timeoutMs)

    const onEvent = () => {
      cleanup()
      resolve()
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener(eventName, onEvent)
    }

    video.addEventListener(eventName, onEvent, { once: true })
  })
}

function createPresentedVideoFrameWaiter(video: HTMLVideoElement) {
  let resolveFrame!: () => void
  let callbackId: number | undefined
  let fallbackTimeout = 0
  let seekCompleted = false
  let settled = false
  const supportsVideoFrameCallback = 'requestVideoFrameCallback' in video
  const promise = new Promise<void>((resolve) => { resolveFrame = resolve })

  const finish = () => {
    if (settled) return
    settled = true
    window.clearTimeout(fallbackTimeout)
    if (callbackId !== undefined && 'cancelVideoFrameCallback' in video) {
      video.cancelVideoFrameCallback(callbackId)
    }
    resolveFrame()
  }

  const onVideoFrame = () => {
    callbackId = undefined
    if (seekCompleted) {
      finish()
    } else if (supportsVideoFrameCallback) {
      callbackId = video.requestVideoFrameCallback(onVideoFrame)
    }
  }

  if (supportsVideoFrameCallback) {
    callbackId = video.requestVideoFrameCallback(onVideoFrame)
  }

  return {
    promise,
    cancel: finish,
    afterSeek() {
      seekCompleted = true
      if (!supportsVideoFrameCallback) {
        requestAnimationFrame(() => requestAnimationFrame(finish))
        return
      }

      // Some WebViews don't issue rVFC for a paused seek. The seeked event
      // already guarantees decoded data, so fall back after 100 ms instead
      // of stalling every output frame for the old 1.5 s timeout.
      fallbackTimeout = window.setTimeout(
        () => requestAnimationFrame(() => requestAnimationFrame(finish)),
        100
      )
    }
  }
}

async function renderAt(timeMs: number, snapshotDanmakus: DanmakuItem[]) {
  const video = mediaRef.value as HTMLVideoElement | null
  const screen = screenRef.value
  if (!screen || (store.mediaUrl && !video)) {
    throw new Error('播放器尚未准备好，无法导出视频')
  }

  exportDanmakus.value = snapshotDanmakus
  exportTimeMs.value = timeMs
  video?.pause()
  await nextTick()

  if (video) {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      const loaded = waitForMediaEvent(video, 'loadeddata')
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) await loaded
    }

    const targetSeconds = Math.max(0, Math.min(timeMs / 1000, Math.max(0, video.duration - 0.001)))
    const needsSeek = Math.abs(video.currentTime - targetSeconds) > 0.0005
    if (needsSeek) {
      const presentedFrame = createPresentedVideoFrameWaiter(video)
      try {
        const seeked = waitForMediaEvent(video, 'seeked')
        video.currentTime = targetSeconds
        await seeked
        presentedFrame.afterSeek()
        await presentedFrame.promise
      } catch (error) {
        presentedFrame.cancel()
        throw error
      }
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForMediaEvent(video, 'loadeddata')
    }
  }

  await document.fonts?.ready
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const bounds = screen.getBoundingClientRect()
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    viewportWidth,
    viewportHeight
  }
}

async function endRenderSession() {
  const video = mediaRef.value as HTMLVideoElement | null
  if (!video) return

  exportTimeMs.value = null
  exportDanmakus.value = undefined
  await nextTick()

  const editorSeconds = Math.max(0, Math.min(store.currentTime / 1000, Math.max(0, video.duration - 0.001)))
  if (Number.isFinite(editorSeconds) && Math.abs(video.currentTime - editorSeconds) > 0.001) {
    const seeked = waitForMediaEvent(video, 'seeked')
    video.currentTime = editorSeconds
    await seeked
  }

  if (store.playing) {
    await video.play().catch(() => undefined)
  } else {
    video.pause()
  }
}

async function waitUntilReady() {
  if (!store.mediaUrl) return
  const video = mediaRef.value as HTMLVideoElement | null
  if (!video) throw new Error('渲染窗口中的视频元素尚未创建')
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForMediaEvent(video, 'loadeddata')
  }
}

defineExpose({ renderAt, endRenderSession, waitUntilReady })

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
