<template>
  <main class="render-window-root">
    <Player
      v-if="renderReady"
      ref="playerRef"
      :export-layout="true"
      :resolve-media="false"
    />
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref } from 'vue'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import Player from './Player.vue'
import { useEditorStore } from '@/store/editor'
import {
  getVideoExportRenderJob,
  finishVideoExportRenderWindow,
  registerMediaPath
} from '@/utils/tauriBackend'
import {
  runVideoExport,
  VIDEO_EXPORT_RENDER_CANCEL_EVENT,
  VIDEO_EXPORT_RENDER_FINISHED_EVENT,
  VIDEO_EXPORT_RENDER_PROGRESS_EVENT,
  VIDEO_EXPORT_RENDER_READY_EVENT,
  type ExportJob,
  type ExportRenderStage
} from '@/core/videoExport/exportCoordinator'

type RenderPlayer = ExportRenderStage & { waitUntilReady: () => Promise<void> }

const store = useEditorStore()
const jobId = new URLSearchParams(window.location.search).get('videoExportRender')
const playerRef = ref<RenderPlayer | null>(null)
const renderReady = ref(false)
const abortController = new AbortController()
let unlistenCancel: UnlistenFn | null = null

onMounted(() => {
  void runRenderJob()
})

onUnmounted(() => {
  unlistenCancel?.()
  abortController.abort()
})

async function runRenderJob() {
  let keepOutput = false
  let outputJob: ExportJob | null = null

  try {
    if (!jobId) throw new Error('缺少独立渲染任务标识')

    unlistenCancel = await listen<{ jobId: string }>(VIDEO_EXPORT_RENDER_CANCEL_EVENT, ({ payload }) => {
      if (payload.jobId === jobId) abortController.abort()
    })

    outputJob = await getVideoExportRenderJob(jobId) as ExportJob
    if (outputJob.mediaUrl) {
      if (!outputJob.mediaFilePath) {
        throw new Error('独立渲染窗口需要本地媒体文件路径，请从本地文件重新导入视频后再导出。')
      }
      const registeredMedia = await registerMediaPath(outputJob.mediaFilePath)
      outputJob = {
        ...outputJob,
        mediaFilePath: registeredMedia.path,
        mediaUrl: registeredMedia.url
      }
    } else {
      outputJob = { ...outputJob, mediaFilePath: '' }
    }

    store.$patch({
      InitializationPhase: false,
      showProjectManager: false,
      mediaUrl: outputJob.mediaUrl,
      mediaDuration: outputJob.mediaDuration,
      mediaFilePath: outputJob.mediaFilePath,
      danmakus: outputJob.danmakus,
      screenWidth: outputJob.screenWidth,
      screenHeight: outputJob.screenHeight,
      screenScale: 0,
      currentTime: outputJob.startMs,
      playing: false,
      aggressiveOptimization: false,
      screenRecordingMode: true
    })

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const viewportWidth = window.innerWidth || outputJob.width
    const viewportHeight = window.innerHeight || outputJob.height
    const recordingScale = Math.min(
      Math.round(viewportHeight / store.screenHeight * 100),
      Math.round(viewportWidth / store.screenWidth * 100)
    )
    const exactFitScale = Math.min(
      viewportHeight / store.screenHeight * 100,
      viewportWidth / store.screenWidth * 100
    )
    store.screenScale = Math.min(recordingScale, exactFitScale)

    renderReady.value = true
    await nextTick()
    await playerRef.value?.waitUntilReady()
    await document.fonts?.ready
    if (!playerRef.value) throw new Error('独立渲染播放器未能启动')

    await emit(VIDEO_EXPORT_RENDER_READY_EVENT, { jobId })
    const result = await runVideoExport(
      outputJob,
      playerRef.value,
      abortController.signal,
      (progress) => {
        void emit(VIDEO_EXPORT_RENDER_PROGRESS_EVENT, { jobId, progress })
      }
    )
    keepOutput = !result.canceledByUser
    await emit(VIDEO_EXPORT_RENDER_FINISHED_EVENT, { jobId, result })
  } catch (error) {
    const canceledByUser = error instanceof DOMException && error.name === 'AbortError'
    const detail = canceledByUser
      ? { jobId, result: { canceledByUser: true } }
      : { jobId, error: error instanceof Error ? error.message : String(error) }
    await emit(VIDEO_EXPORT_RENDER_FINISHED_EVENT, detail).catch(() => undefined)
  } finally {
    unlistenCancel?.()
    if (jobId) {
      await finishVideoExportRenderWindow(jobId, keepOutput).catch(() => undefined)
    }
  }
}
</script>

<style scoped>
.render-window-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
}
</style>
