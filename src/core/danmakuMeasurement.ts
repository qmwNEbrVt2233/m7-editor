import type { DanmakuItem } from './danmaku'

export const TOOLBAR_MEASURE_EVENT = 'toolbar-measure-danmakus'

export type ToolbarMeasure = Record<string, {
  width: number
  height: number
  rawWidth: number
  rawHeight: number
}>

export type ToolbarMeasureRequest = {
  requestId: string
  danmaku: DanmakuItem
}

export type ToolbarMeasureEventDetail = {
  requests: ToolbarMeasureRequest[]
  resolve: (result: ToolbarMeasure) => void
  reject: (reason?: unknown) => void
}

let nextRequestId = 0
let measureQueue: Promise<void> = Promise.resolve()

function cloneDanmakuForMeasure(danmaku: DanmakuItem): DanmakuItem {
  return {
    id: String(danmaku.id ?? ''),
    layer: Number.isFinite(danmaku.layer) ? danmaku.layer : 0,
    startTime: Number.isFinite(danmaku.startTime) ? danmaku.startTime : 0,
    content: {
      text: String(danmaku.content?.text ?? ''),
      font: String(danmaku.content?.font ?? 'Microsoft YaHei'),
      size: Number.isFinite(danmaku.content?.size) ? danmaku.content.size : 60,
      color: String(danmaku.content?.color ?? '#FFFFFF'),
      stroke: Boolean(danmaku.content?.stroke)
    },
    transform: {
      start: {
        x: Number.isFinite(danmaku.transform?.start?.x) ? danmaku.transform.start.x : 0,
        y: Number.isFinite(danmaku.transform?.start?.y) ? danmaku.transform.start.y : 0
      },
      end: {
        x: Number.isFinite(danmaku.transform?.end?.x) ? danmaku.transform.end.x : 0,
        y: Number.isFinite(danmaku.transform?.end?.y) ? danmaku.transform.end.y : 0
      },
      zRotate: Number.isFinite(danmaku.transform?.zRotate) ? danmaku.transform.zRotate : 0,
      yRotate: Number.isFinite(danmaku.transform?.yRotate) ? danmaku.transform.yRotate : 0
    },
    opacity: {
      from: Number.isFinite(danmaku.opacity?.from) ? danmaku.opacity.from : 1,
      to: Number.isFinite(danmaku.opacity?.to) ? danmaku.opacity.to : 1
    },
    animation: {
      duration: Number.isFinite(danmaku.animation?.duration) ? danmaku.animation.duration : 1000,
      moveDuration: Number.isFinite(danmaku.animation?.moveDuration) ? danmaku.animation.moveDuration : 500,
      delay: Number.isFinite(danmaku.animation?.delay) ? danmaku.animation.delay : 0,
      easing: danmaku.animation?.easing === 'speeddown' ? 'speeddown' : 'speedup'
    }
  }
}

function dispatchMeasurementBatch(danmakus: DanmakuItem[]): Promise<ToolbarMeasure> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutMs = Math.max(2000, Math.min(10000, 2000 + danmakus.length * 10))
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('测量幽灵弹幕超时'))
    }, timeoutMs)

    const requests = danmakus.map((danmaku) => ({
      requestId: `m7-measure-${Date.now()}-${nextRequestId++}`,
      danmaku: cloneDanmakuForMeasure(danmaku)
    }))

    const finishResolve = (result: ToolbarMeasure) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      const normalized: ToolbarMeasure = {}
      if (result && typeof result === 'object') {
        requests.forEach((request) => {
          const measurement = result[request.requestId]
          if (!measurement) return
          normalized[request.requestId] = measurement
          normalized[request.danmaku.id] = measurement
        })
      }
      resolve(normalized)
    }

    const finishReject = (reason?: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      reject(reason)
    }

    const detail: ToolbarMeasureEventDetail = {
      requests,
      resolve: finishResolve,
      reject: finishReject
    }

    try {
      window.dispatchEvent(new CustomEvent<ToolbarMeasureEventDetail>(TOOLBAR_MEASURE_EVENT, { detail }))
    } catch (error) {
      finishReject(error)
    }
  })
}

export function measureDanmakus(danmakus: DanmakuItem[]): Promise<ToolbarMeasure> {
  if (!Array.isArray(danmakus) || !danmakus.length) return Promise.resolve({})
  if (typeof window === 'undefined') return Promise.reject(new Error('弹幕测量需要打开编辑器渲染窗口'))

  const run = measureQueue.then(() => dispatchMeasurementBatch(danmakus))
  measureQueue = run.then(() => undefined, () => undefined)
  return run
}
