<template>
  <div class="player no-select">
    <div ref="screenRef" class="screen" :style="screenStyle">
      <video
        v-if="store.mediaUrl"
        ref="mediaRef"
        class="media-element"
        :src="store.mediaUrl"
        @loadedmetadata="onMediaLoaded"
        @error="onMediaError"
        @volumechange="onMediaVolumeChange"
        @ratechange="onMediaRateChange"
      />
      <DanmakuLayer :render-time-ms="exportTimeMs" :render-danmakus="exportDanmakus" />
    </div>

    <div v-if="!store.screenRecordingMode && !exportLayout" class="media-info" :style="mediaInfoStyle">
      <span v-if="store.mediaUrl && store.playing">
        媒体时长: {{ formatTime(store.mediaDuration) }}
      </span>
      <span v-else>
        当前时间: {{ Math.round(Number.isFinite(store.currentTime) ? store.currentTime : 0) }}
      </span>
      <div v-if="store.mediaUrl" class="media-audio-controls">
        <button
          type="button"
          class="media-audio-btn"
          :title="mediaMuted ? '取消静音' : '静音'"
          @click="toggleMute($event)"
        >
          {{ mediaMuted ? '静音' : '音量' }}
        </button>
        <input
          type="range"
          class="media-volume-slider"
          min="0"
          max="1"
          step="0.05"
          :value="mediaMuted ? 0 : mediaVolume"
          aria-label="音量"
          @input="onVolumeSliderInput"
          @change="onVolumeSliderCommit"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import DanmakuLayer from './DanmakuLayer.vue'
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'

const MEDIA_PREFS_STORAGE_KEY = 'm7-editor-media-prefs'

type MediaPrefs = {
  muted: boolean
  volume: number
  playbackRate: number
}

function loadMediaPrefs(): MediaPrefs {
  try {
    const raw = localStorage.getItem(MEDIA_PREFS_STORAGE_KEY)
    if (!raw) return { muted: false, volume: 1, playbackRate: 1 }
    const parsed = JSON.parse(raw) as Partial<MediaPrefs>
    const volume = typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
      ? Math.max(0, Math.min(1, parsed.volume))
      : 1
    const playbackRate = typeof parsed.playbackRate === 'number' && Number.isFinite(parsed.playbackRate)
      ? Math.max(0.25, Math.min(4, parsed.playbackRate))
      : 1
    return {
      muted: Boolean(parsed.muted),
      volume,
      playbackRate
    }
  } catch {
    return { muted: false, volume: 1, playbackRate: 1 }
  }
}

function saveMediaPrefs(prefs: MediaPrefs) {
  try {
    localStorage.setItem(MEDIA_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // 忽略存储配额错误
  }
}

const store = useEditorStore()
const notice = useNoticeStore()
const props = withDefaults(defineProps<{ exportLayout?: boolean; resolveMedia?: boolean }>(), {
  exportLayout: false,
  resolveMedia: true
})
const mediaRef = ref<HTMLMediaElement | null>(null)
const screenRef = ref<HTMLDivElement | null>(null)
const previousCurrentTime = ref(store.currentTime)
const exportTimeMs = ref<number | null>(null)
const exportDanmakus = ref<DanmakuItem[] | undefined>(undefined)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const initialPrefs = props.exportLayout ? { muted: false, volume: 1, playbackRate: 1 } : loadMediaPrefs()
const mediaMuted = ref(initialPrefs.muted)
const mediaVolume = ref(initialPrefs.volume)
const mediaPlaybackRate = ref(initialPrefs.playbackRate)
let applyingMediaPrefs = false

const screenScale = computed(() => {
  const raw = Number.isFinite(store.screenScale) ? store.screenScale : 100
  return Math.max(0.01, raw / 100)
})

const screenStyle = computed(() => ({
  width: `${store.screenWidth}px`,
  height: `${store.screenHeight}px`,
  transformOrigin: `top left`,
  transform: `scale(${screenScale.value})`,
  left: props.exportLayout
    ? `${Math.max(0, (viewportWidth.value - store.screenWidth * screenScale.value) / 2)}px`
    : store.screenRecordingMode || exportTimeMs.value !== null ? '0' : undefined,
  top: props.exportLayout
    ? `${Math.max(0, (viewportHeight.value - store.screenHeight * screenScale.value) / 2)}px`
    : store.screenRecordingMode || exportTimeMs.value !== null ? '0' : '60px'
}))

const mediaInfoStyle = computed(() => ({
  top: `${store.screenHeight * screenScale.value + 60}px`
}))

function handleViewportResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

function applyPrefsToMediaElement(element: HTMLMediaElement | null) {
  if (!element || props.exportLayout || exportTimeMs.value !== null) return
  applyingMediaPrefs = true
  try {
    element.muted = mediaMuted.value
    element.volume = mediaVolume.value
    element.playbackRate = mediaPlaybackRate.value
  } finally {
    applyingMediaPrefs = false
  }
}

function persistCurrentMediaPrefs() {
  if (props.exportLayout) return
  saveMediaPrefs({
    muted: mediaMuted.value,
    volume: mediaVolume.value,
    playbackRate: mediaPlaybackRate.value
  })
}

function onMediaVolumeChange() {
  const video = mediaRef.value
  if (!video || applyingMediaPrefs || props.exportLayout || exportTimeMs.value !== null) return
  mediaMuted.value = video.muted
  mediaVolume.value = Math.max(0, Math.min(1, video.volume))
  persistCurrentMediaPrefs()
}

function onMediaRateChange() {
  const video = mediaRef.value
  if (!video || applyingMediaPrefs || props.exportLayout || exportTimeMs.value !== null) return
  if (Number.isFinite(video.playbackRate) && video.playbackRate > 0) {
    mediaPlaybackRate.value = Math.max(0.25, Math.min(4, video.playbackRate))
    persistCurrentMediaPrefs()
  }
}

function toggleMute(e: MouseEvent) {
  mediaMuted.value = !mediaMuted.value
  if (!mediaMuted.value && mediaVolume.value === 0) {
    mediaVolume.value = 0.5
  }
  applyPrefsToMediaElement(mediaRef.value)
  persistCurrentMediaPrefs()
  ;(e.currentTarget as HTMLElement | null)?.blur()
}

function onVolumeSliderInput(e: Event) {
  const nextVolume = Number.parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isFinite(nextVolume)) return
  mediaVolume.value = Math.max(0, Math.min(1, nextVolume))
  mediaMuted.value = mediaVolume.value === 0
  applyPrefsToMediaElement(mediaRef.value)
  persistCurrentMediaPrefs()
}

function onVolumeSliderCommit(e: Event) {
  ;(e.target as HTMLElement | null)?.blur()
}

function getValidDurationSeconds(video: HTMLMediaElement): number {
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
}

function getClampedMediaSeconds(video: HTMLMediaElement, timeMs: number): number {
  const rawSeconds = Number.isFinite(timeMs) ? Math.max(0, timeMs / 1000) : 0
  const duration = getValidDurationSeconds(video)
  return duration > 0 ? Math.min(rawSeconds, duration) : rawSeconds
}

function isAtOrPastMediaEnd(video: HTMLMediaElement, timeMs: number): boolean {
  const duration = getValidDurationSeconds(video)
  return duration > 0 && Number.isFinite(timeMs) && timeMs / 1000 >= duration
}

function safePlayMedia(video: HTMLMediaElement) {
  video.play().catch((err) => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }
    if (store.playing && mediaRef.value === video && exportTimeMs.value === null) {
      notice.alert('播放失败', 'error', '错误', err)
    }
  })
}

// 初始化视频元素引用，并在 Tauri 中恢复工程内记录的真实媒体路径
onMounted(async () => {
  window.addEventListener('resize', handleViewportResize)
  if (props.resolveMedia) {
    await store.resolveMediaPath()
  }
  await nextTick()
  applyPrefsToMediaElement(mediaRef.value)
  store.setMediaElement(mediaRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
  const currentMedia = mediaRef.value
  if (currentMedia) {
    currentMedia.pause()
    if (store.mediaElement === currentMedia) {
      store.setMediaElement(null)
    }
  }
})

watch(mediaRef, (element) => {
  applyPrefsToMediaElement(element)
  store.setMediaElement(element)
})

// 监听currentTime变化，同步视频
watch(
  () => store.currentTime,
  (currentTime) => {
    const video = mediaRef.value
    if (!video || !store.mediaUrl || exportTimeMs.value !== null) {
      previousCurrentTime.value = currentTime
      return
    }

    const timeDelta = currentTime - previousCurrentTime.value
    previousCurrentTime.value = currentTime

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      return
    }

    const targetSeconds = getClampedMediaSeconds(video, currentTime)
    const mediaDelta = Math.abs(video.currentTime - targetSeconds)
    const isSeek = !store.playing || timeDelta < 0 || Math.abs(timeDelta) > 100

    if (!store.playing) {
      if (mediaDelta > 0.05) {
        video.currentTime = targetSeconds
      }
      return
    }

    if (isAtOrPastMediaEnd(video, currentTime)) {
      if (!video.paused) {
        video.pause()
      }
      return
    }

    if (video.paused && !video.seeking) {
      if (mediaDelta > 0.05) {
        video.currentTime = targetSeconds
      }
      safePlayMedia(video)
      return
    }

    if (isSeek && mediaDelta > 0.05) {
      video.currentTime = targetSeconds
    } else if (!video.seeking && mediaDelta > 0.25) {
      video.currentTime = targetSeconds
    }
  }
)

// 监听播放状态变化
watch(
  () => store.playing,
  (isPlaying) => {
    const video = mediaRef.value
    if (!video || !store.mediaUrl || exportTimeMs.value !== null) return

    if (isPlaying) {
      if (isAtOrPastMediaEnd(video, store.currentTime)) {
        const duration = getValidDurationSeconds(video)
        if (duration > 0 && Math.abs(video.currentTime - duration) > 0.05) {
          video.currentTime = duration
        }
        video.pause()
        return
      }

      const mediaTime = getClampedMediaSeconds(video, store.currentTime)
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(video.currentTime - mediaTime) > 0.05) {
        video.currentTime = mediaTime
      }

      nextTick(() => {
        if (!store.playing || mediaRef.value !== video || exportTimeMs.value !== null) return
        if (isAtOrPastMediaEnd(video, store.currentTime)) return
        safePlayMedia(video)
      })
    } else {
      video.pause()
    }
  }
)

function onMediaLoaded() {
  const video = mediaRef.value
  if (!video) return
  const duration = getValidDurationSeconds(video)
  store.setMediaDuration(duration * 1000) // 秒转ms
  applyPrefsToMediaElement(video)

  if (exportTimeMs.value !== null) return

  const targetSeconds = getClampedMediaSeconds(video, store.currentTime)
  if (Math.abs(video.currentTime - targetSeconds) > 0.05) {
    video.currentTime = targetSeconds
  }
  if (store.playing && !isAtOrPastMediaEnd(video, store.currentTime)) {
    safePlayMedia(video)
  }
}

function onMediaError() {
  store.setMediaDuration(0)
  if (!props.exportLayout && store.mediaUrl) {
    notice.log('[媒体] 媒体加载或解码失败，请检查文件格式或路径', 'error')
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

let fontsReadyPromise: Promise<unknown> | null = null

function waitForFontsOnce() {
  if (!fontsReadyPromise) {
    fontsReadyPromise = document.fonts?.ready ?? Promise.resolve()
  }
  return fontsReadyPromise
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

      // Some WebViews don't issue rVFC for a paused seek (or when seeking within the
      // same decoded source frame). The seeked event already guarantees decoded data,
      // so fall back after a single frame interval (~20 ms) instead of 100 ms.
      fallbackTimeout = window.setTimeout(
        () => requestAnimationFrame(() => requestAnimationFrame(finish)),
        20
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

  let seekedVideo = false
  if (video) {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      const loaded = waitForMediaEvent(video, 'loadeddata')
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) await loaded
    }

    const maxSeconds = Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 0.001)
      : 0
    const targetSeconds = Math.max(0, Math.min(timeMs / 1000, maxSeconds))
    const needsSeek = Math.abs(video.currentTime - targetSeconds) > 0.0005
    if (needsSeek) {
      seekedVideo = true
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

  await waitForFontsOnce()
  if (!seekedVideo) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  } else {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

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

  const maxSeconds = Number.isFinite(video.duration) && video.duration > 0
    ? Math.max(0, video.duration - 0.001)
    : 0
  const editorSeconds = Math.max(0, Math.min(store.currentTime / 1000, maxSeconds))
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
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
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
  overflow: hidden;
  position: fixed;
  z-index: 0;
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
  display: flex;
  align-items: center;
  gap: 12px;
  height: 20px;
  line-height: 20px;
}

.media-audio-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.media-audio-btn {
  background: #2b2b2b;
  color: #ccc;
  border: 1px solid #444;
  border-radius: 3px;
  padding: 0 6px;
  height: 18px;
  line-height: 16px;
  font-size: 11px;
  cursor: pointer;
}

.media-audio-btn:hover {
  border-color: #666;
  color: #fff;
}

.media-volume-slider {
  width: 68px;
  height: 4px;
  accent-color: #4caf50;
  cursor: pointer;
}
</style>
