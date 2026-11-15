import { ALL_FORMATS, Input, UrlSource, VideoSample, VideoSampleSink } from 'mediabunny'
import type { DanmakuItem } from '../danmaku'
import {
  DanmakuTimelineIndex,
  WebGL2DanmakuCompositor,
  type ActiveDanmakuDrawState,
  type DanmakuSpriteFormat,
  type DanmakuSpriteSpec,
} from './danmakuRenderer'

export type DirectExportSpritePayload = {
  key: string
  format: DanmakuSpriteFormat
  pixelWidth: number
  pixelHeight: number
  offsetX: number
  offsetY: number
  logicalWidth: number
  logicalHeight: number
  dataBuffer: ArrayBuffer
}

export type DirectExportStartPayload = {
  width: number
  height: number
  screenWidth: number
  screenHeight: number
  fps: number
  startMs: number
  endMs: number
  mediaDuration: number
  mediaUrl: string
  danmakus: DanmakuItem[]
}

export type DirectEncoderSink = {
  /** Probe before creating output file to ensure encoder supports direct canvas/VideoFrame capture */
  probeCanvas: (canvas: OffscreenCanvas) => Promise<void>
  /** Called only once all media/canvas probes pass so caller can open output file & start muxing */
  startMuxer: (canvas: OffscreenCanvas) => Promise<void>
  /** Encodes the current contents of `canvas` for the given timeline offset & duration */
  encodeCanvasFrame: (
    canvas: OffscreenCanvas,
    frameIndex: number,
    timestampMs: number,
    durationMs: number
  ) => Promise<void>
  /** Finalizes video + audio muxing and flushes output chunks */
  finish: () => Promise<void>
}

export type DirectExportHooks = {
  encoderSink: DirectEncoderSink
  requestSprites: (
    maxTextureSize: number,
    items: Array<{ key: string; spec: DanmakuSpriteSpec }>
  ) => Promise<DirectExportSpritePayload[]>
  onFallback: (reason: string) => void
  onProgress: (phase: 'rendering' | 'finalizing', completedFrames: number, totalFrames: number) => void
  isAborted: () => boolean
}

function uploadSpritePayloads(
  compositor: WebGL2DanmakuCompositor,
  sprites: DirectExportSpritePayload[],
  protectedKeys?: ReadonlySet<string>
): void {
  for (let i = 0; i < sprites.length; i += 1) {
    const item = sprites[i]
    compositor.uploadSprite(
      {
        key: item.key,
        format: item.format,
        pixelWidth: item.pixelWidth,
        pixelHeight: item.pixelHeight,
        offsetX: item.offsetX,
        offsetY: item.offsetY,
        logicalWidth: item.logicalWidth,
        logicalHeight: item.logicalHeight,
        data: new Uint8Array(item.dataBuffer),
      },
      protectedKeys
    )
  }
}

/**
 * Runs the zero-DOM direct GPU/WebCodecs export pipeline inside the video export worker.
 * Returns `'completed'` when exported cleanly, `'aborted'` if cancelled, or `'fallback'`
 * before opening any output file if direct decoding/rendering is unsupported for this job.
 */
export async function runDirectVideoExportSession(
  payload: DirectExportStartPayload,
  hooks: DirectExportHooks
): Promise<'completed' | 'aborted' | 'fallback'> {
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined') {
    hooks.onFallback('offscreen-canvas-or-videoframe-unavailable')
    return 'fallback'
  }

  const canvas = new OffscreenCanvas(payload.width, payload.height)
  let compositor: WebGL2DanmakuCompositor
  try {
    compositor = new WebGL2DanmakuCompositor(
      canvas,
      payload.width,
      payload.height,
      payload.screenWidth,
      payload.screenHeight
    )
  } catch (error) {
    hooks.onFallback(error instanceof Error ? error.message : 'worker-webgl2-unavailable')
    return 'fallback'
  }

  let mediaInput: Input | null = null
  let sampleIterator: AsyncIterator<VideoSample, void, unknown> | null = null
  let currentSample: VideoSample | null = null
  let nextSample: VideoSample | null = null
  let videoDurationSec = Math.max(0, payload.mediaDuration)

  try {
    compositor.renderFrame(null, [])
    try {
      await hooks.encoderSink.probeCanvas(canvas)
    } catch (error) {
      hooks.onFallback(error instanceof Error ? error.message : 'direct-encoder-probe-failed')
      return 'fallback'
    }

    if (hooks.isAborted()) {
      return 'aborted'
    }

    if (payload.mediaUrl) {
      try {
        mediaInput = new Input({
          source: new UrlSource(payload.mediaUrl),
          formats: ALL_FORMATS,
        })
        const videoTrack = await mediaInput.getPrimaryVideoTrack()
        if (videoTrack) {
          if (!(await videoTrack.canDecode())) {
            hooks.onFallback('video-track-undecodable')
            return 'fallback'
          }
          const trackDuration =
            (await videoTrack.computeDuration()) || (await videoTrack.getDurationFromMetadata())
          if (Number.isFinite(trackDuration) && trackDuration > 0) {
            videoDurationSec = trackDuration
          }

          const sink = new VideoSampleSink(videoTrack)
          const startSec = Math.max(0, payload.startMs / 1000)
          const queryStartSec =
            videoDurationSec > 0
              ? Math.max(0, Math.min(startSec, Math.max(0, videoDurationSec - 0.1)))
              : startSec
          sampleIterator = sink.samples(queryStartSec, Infinity)[Symbol.asyncIterator]()
          const firstResult = await sampleIterator.next()
          if (firstResult.done && videoDurationSec > 0) {
            const firstEncodedPacket = await videoTrack.getFirstPacket({ metadataOnly: true })
            if (firstEncodedPacket !== null) {
              hooks.onFallback('video-sample-stream-empty')
              return 'fallback'
            }
          }
          nextSample = firstResult.done ? null : firstResult.value
        }
      } catch (error) {
        hooks.onFallback(error instanceof Error ? error.message : 'direct-media-probe-failed')
        return 'fallback'
      }
    }

    if (hooks.isAborted()) {
      return 'aborted'
    }

    // All probes passed cleanly — open output file & start muxer now
    await hooks.encoderSink.startMuxer(canvas)

    const timeline = new DanmakuTimelineIndex(payload.danmakus)
    const durationMs = Math.max(1, payload.endMs - payload.startMs)
    const frameDurationMs = 1000 / payload.fps
    const totalFrames = Math.max(1, Math.ceil((durationMs * payload.fps) / 1000))
    const lookaheadFrames = Math.max(24, Math.min(90, Math.round(payload.fps * 1.5)))
    const progressStep = Math.max(1, Math.round(payload.fps / 20))

    const requestedInWindow = new Set<string>()
    const activeDrawBuffer: ActiveDanmakuDrawState[] = []
    const activeFrameKeys = new Set<string>()
    let uploadedThroughFrame = 0
    let pendingSpriteBatch: {
      endFrame: number
      promise: Promise<DirectExportSpritePayload[]>
    } | null = null

    const evaluateActiveAt = (timeMs: number) => {
      timeline.evaluateAt(timeMs, activeDrawBuffer)
      activeFrameKeys.clear()
      for (let i = 0; i < activeDrawBuffer.length; i += 1) {
        activeFrameKeys.add(activeDrawBuffer[i].entry.spriteKey)
      }
    }

    const launchSpriteBatch = (
      fromFrame: number,
      toFrameExclusive: number
    ): { endFrame: number; promise: Promise<DirectExportSpritePayload[]> } | null => {
      if (fromFrame >= totalFrames) {
        return null
      }
      const clampedEndFrame = Math.min(totalFrames, toFrameExclusive)
      const rangeStartMs = payload.startMs + fromFrame * frameDurationMs
      const rangeEndMs = Math.min(
        payload.endMs,
        payload.startMs + Math.max(fromFrame, clampedEndFrame - 1) * frameDurationMs
      )

      const candidates = timeline.collectUniqueSpritesInRange(
        rangeStartMs,
        rangeEndMs,
        requestedInWindow
      )
      const needed = candidates.filter((item) => !compositor.hasSprite(item.key))
      if (needed.length === 0) {
        return { endFrame: clampedEndFrame, promise: Promise.resolve([]) }
      }
      const promise = hooks.requestSprites(compositor.maxTextureSize, needed)
      return { endFrame: clampedEndFrame, promise }
    }

    // Preload initial sprite window while pinning frame-0 active keys
    const initialBatch = launchSpriteBatch(0, lookaheadFrames)
    if (initialBatch) {
      const initialSprites = await initialBatch.promise
      if (!hooks.isAborted()) {
        evaluateActiveAt(Math.max(payload.startMs, Math.min(payload.endMs - 0.001, payload.startMs)))
        uploadSpritePayloads(compositor, initialSprites, activeFrameKeys)
      }
      uploadedThroughFrame = initialBatch.endFrame
    }
    if (uploadedThroughFrame < totalFrames) {
      pendingSpriteBatch = launchSpriteBatch(
        uploadedThroughFrame,
        uploadedThroughFrame + lookaheadFrames
      )
    }

    for (let index = 0; index < totalFrames; index += 1) {
      if (hooks.isAborted()) {
        return 'aborted'
      }

      const frameOffsetMs = index * frameDurationMs
      const frameDuration = Math.min(frameDurationMs, Math.max(0, payload.endMs - payload.startMs - frameOffsetMs))
      const projectTimeMs = Math.max(
        payload.startMs,
        Math.min(payload.endMs - 0.001, payload.startMs + frameOffsetMs)
      )

      evaluateActiveAt(projectTimeMs)

      if (index >= uploadedThroughFrame) {
        if (pendingSpriteBatch) {
          const batchSprites = await pendingSpriteBatch.promise
          if (hooks.isAborted()) {
            return 'aborted'
          }
          uploadSpritePayloads(compositor, batchSprites, activeFrameKeys)
          uploadedThroughFrame = pendingSpriteBatch.endFrame
          pendingSpriteBatch = null
        }
        if (uploadedThroughFrame < totalFrames) {
          pendingSpriteBatch = launchSpriteBatch(
            uploadedThroughFrame,
            uploadedThroughFrame + lookaheadFrames
          )
        }
      }

      if (sampleIterator) {
        const targetVideoSec =
          videoDurationSec > 0
            ? Math.max(0, Math.min(projectTimeMs / 1000, videoDurationSec))
            : Math.max(0, projectTimeMs / 1000)

        while (nextSample !== null && nextSample.timestamp <= targetVideoSec + 1e-4) {
          currentSample?.close()
          currentSample = nextSample
          const iter = await sampleIterator.next()
          nextSample = iter.done ? null : iter.value
        }
      }

      // Guard against LRU eviction in very large multi-hundred-megabyte sprite projects
      if (activeDrawBuffer.length > 0) {
        let missing: Array<{ key: string; spec: DanmakuSpriteSpec }> | null = null
        let missingSeen: Set<string> | null = null
        for (let i = 0; i < activeDrawBuffer.length; i += 1) {
          const entry = activeDrawBuffer[i].entry
          if (!compositor.hasSprite(entry.spriteKey)) {
            if (!missing) {
              missing = []
              missingSeen = new Set()
            }
            if (!missingSeen!.has(entry.spriteKey)) {
              missingSeen!.add(entry.spriteKey)
              missing.push({ key: entry.spriteKey, spec: entry.spriteSpec })
            }
          }
        }
        if (missing) {
          if (pendingSpriteBatch) {
            const batchSprites = await pendingSpriteBatch.promise
            if (hooks.isAborted()) {
              return 'aborted'
            }
            uploadSpritePayloads(compositor, batchSprites, activeFrameKeys)
            uploadedThroughFrame = pendingSpriteBatch.endFrame
            pendingSpriteBatch = null
            // Re-check after pending batch uploads
            missing = missing.filter((item) => !compositor.hasSprite(item.key))
          }
          if (missing.length > 0) {
            const loaded = await hooks.requestSprites(compositor.maxTextureSize, missing)
            if (hooks.isAborted()) {
              return 'aborted'
            }
            uploadSpritePayloads(compositor, loaded, activeFrameKeys)
          }
        }
      }

      if (hooks.isAborted()) {
        return 'aborted'
      }

      const activeVideoSample = currentSample ?? nextSample
      compositor.renderFrame(activeVideoSample, activeDrawBuffer)

      await hooks.encoderSink.encodeCanvasFrame(canvas, index, frameOffsetMs, frameDuration)

      if (index === 0 || (index + 1) % progressStep === 0 || index === totalFrames - 1) {
        hooks.onProgress('rendering', index + 1, totalFrames)
      }
    }

    if (hooks.isAborted()) {
      return 'aborted'
    }

    hooks.onProgress('finalizing', totalFrames, totalFrames)
    await hooks.encoderSink.finish()
    return 'completed'
  } finally {
    currentSample?.close()
    nextSample?.close()
    try {
      await sampleIterator?.return?.()
    } catch {
      // ignore iterator close error
    }
    try {
      mediaInput?.dispose()
    } catch {
      // ignore input dispose error
    }
    compositor.dispose()
  }
}
