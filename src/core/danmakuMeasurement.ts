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

export function measureDanmakus(danmakus: DanmakuItem[]): Promise<ToolbarMeasure> {
  if (!danmakus.length) return Promise.resolve({})
  if (typeof window === 'undefined') return Promise.reject(new Error('弹幕测量需要打开编辑器渲染窗口'))

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('测量幽灵弹幕超时')), 2000)
    const requests = danmakus.map((danmaku) => ({
      requestId: `m7-measure-${Date.now()}-${nextRequestId++}`,
      danmaku: JSON.parse(JSON.stringify(danmaku)) as DanmakuItem
    }))
    const detail: ToolbarMeasureEventDetail = {
      requests,
      resolve: (result) => {
        window.clearTimeout(timeoutId)
        const normalized: ToolbarMeasure = {}
        requests.forEach((request) => {
          const measurement = result[request.requestId]
          if (!measurement) return
          normalized[request.requestId] = measurement
          normalized[request.danmaku.id] = measurement
        })
        resolve(normalized)
      },
      reject: (reason) => { window.clearTimeout(timeoutId); reject(reason) }
    }
    window.dispatchEvent(new CustomEvent<ToolbarMeasureEventDetail>(TOOLBAR_MEASURE_EVENT, { detail }))
  })
}
