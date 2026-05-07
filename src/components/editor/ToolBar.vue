<template>
  <div class="toolbar">
    <div class="tool-group framed-group">
      <div class="mode-selector">
        <button
          class="mode-btn"
          :class="{ active: scopeMode === 'S' }"
          @click="scopeMode = 'S'"
          title="Start: 作用于起始坐标"
        >S</button>
        <button
          class="mode-btn"
          :class="{ active: scopeMode === 'E' }"
          @click="scopeMode = 'E'"
          title="End: 作用于结束坐标"
        >E</button>
        <button
          class="mode-btn"
          :class="{ active: scopeMode === 'B' }"
          @click="scopeMode = 'B'"
          title="Both: 作用于起始与结束坐标"
        >B</button>
      </div>

      <div class="group-tools">
        <button
          class="tool-btn"
          :class="{ active: isPicking }"
          :disabled="!hasSelection"
          :title="isPicking ? '点击播放器画面以拾取坐标，再次点击可取消' : '拾取定位'"
          @click="handlePickTool"
        >
          <img src="/src/icon/Pick_and_locate.svg" alt="拾取定位" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="水平居中"
          @click="handleHorizontalCenter"
        >
          <img src="/src/icon/vertical_centering.svg" alt="水平居中" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="垂直居中"
          @click="handleVerticalCenter"
        >
          <img src="/src/icon/horizontal_centering.svg" alt="垂直居中" />
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="将起始坐标应用至结束坐标"
      @click="handleCopyStartToEnd"
    >
      <img src="/src/icon/S_to_E.svg" alt="起始坐标应用至结束坐标" />
    </button>
    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="将结束坐标应用至起始坐标"
      @click="handleCopyEndToStart"
    >
      <img src="/src/icon/E_to_S.svg" alt="结束坐标应用至起始坐标" />
    </button>

    <div class="divider"></div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="行分隔"
      @click="handleLineSplit"
    >
      <img src="/src/icon/Split_by_line.svg" alt="行分隔" />
    </button>
    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="时间分割"
      @click="handleTimeSplit"
    >
      <img src="/src/icon/cut.svg" alt="时间分割" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'
import { historyManager } from '@/core/history'
import { useEditorStore } from '@/store/editor'

type ScopeMode = 'S' | 'E' | 'B'
type TransformTarget = 'start' | 'end'
type Axis = 'x' | 'y'
type ToolbarMeasureRequest = {
  requestId: string
  danmaku: DanmakuItem
}
type ToolbarMeasureResponse = Record<string, { width: number; height: number }>
type ToolbarMeasureEventDetail = {
  requests: ToolbarMeasureRequest[]
  resolve: (result: ToolbarMeasureResponse) => void
  reject: (reason?: unknown) => void
}

const TOOLBAR_MEASURE_EVENT = 'toolbar-measure-danmakus'

const store = useEditorStore()

// 记录组合工具的作用范围，默认为 B。
const scopeMode = ref<ScopeMode>('B')
const isPicking = ref(false)
const selectedDanmakus = computed(() => store.getSelectedDanmakus)
const hasSelection = computed(() => selectedDanmakus.value.length > 0)

let pickAbortController: AbortController | null = null

function getScopeTargets(): TransformTarget[] {
  if (scopeMode.value === 'S') return ['start']
  if (scopeMode.value === 'E') return ['end']
  return ['start', 'end']
}

function roundToInteger(value: number): number {
  return Math.round(value)
}

function cloneDanmaku(danmaku: DanmakuItem): DanmakuItem {
  return JSON.parse(JSON.stringify(danmaku)) as DanmakuItem
}

function createIdAllocator() {
  const generatedId = Number(store.generateNewId())
  const maxExistingId = store.danmakus.reduce((max: any, danmaku: any) => {
    const numericId = Number(danmaku.id)
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max
  }, 0)

  let nextId = Number.isFinite(generatedId)
    ? Math.max(generatedId, maxExistingId + 1)
    : maxExistingId + 1

  return () => String(nextId++)
}

function clampCoordinate(value: number) {
  const roundedValue = roundToInteger(value)
  return {
    value: Math.max(0, roundedValue),
    clamped: roundedValue < 0
  }
}

function applyScopedPosition(danmaku: DanmakuItem, x: number, y: number) {
  const roundedX = roundToInteger(x)
  const roundedY = roundToInteger(y)

  getScopeTargets().forEach((target) => {
    danmaku.transform[target].x = roundedX
    danmaku.transform[target].y = roundedY
  })
}

function applyScopedAxis(danmaku: DanmakuItem, axis: Axis, value: number) {
  const roundedValue = roundToInteger(value)

  getScopeTargets().forEach((target) => {
    danmaku.transform[target][axis] = roundedValue
  })
}

function finishToolbarOperation(description: string, nextSelectedIds?: string[]) {
  if (nextSelectedIds) {
    store.selectedIds = Array.from(new Set(nextSelectedIds))
  }

  historyManager.recordSnapshot(store.danmakus, description)
  store._clearPendingChangeTracking()
}

function cancelPickMode() {
  if (pickAbortController) {
    pickAbortController.abort()
    pickAbortController = null
  }

  isPicking.value = false
}

function handlePickTool() {
  if (!hasSelection.value) {
    return
  }

  if (isPicking.value) {
    cancelPickMode()
    return
  }

  const controller = new AbortController()
  pickAbortController = controller
  isPicking.value = true

  window.setTimeout(() => {
    document.addEventListener(
      'click',
      (event) => {
        const screenElement = document.querySelector('.screen') as HTMLElement | null
        const target = event.target as Node | null

        cancelPickMode()

        if (!screenElement || !target || !screenElement.contains(target)) {
          return
        }

        const rect = screenElement.getBoundingClientRect()
        const x = roundToInteger(event.clientX - rect.left)
        const y = roundToInteger(event.clientY - rect.top)

        selectedDanmakus.value.forEach((danmaku) => {
          applyScopedPosition(danmaku, x, y)
        })

        finishToolbarOperation('工具栏：拾取定位')
      },
      {
        once: true,
        capture: true,
        signal: controller.signal
      }
    )
  }, 0)
}

function measureDanmakus(danmakus: DanmakuItem[]): Promise<ToolbarMeasureResponse> {
  if (danmakus.length === 0) {
    return Promise.resolve({})
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('测量幽灵弹幕超时'))
    }, 1000)

    const requests = danmakus.map((danmaku, index) => ({
      requestId: `${danmaku.id}-${index}-${Date.now()}`,
      danmaku: cloneDanmaku(danmaku)
    }))

    const detail: ToolbarMeasureEventDetail = {
      requests,
      resolve: (result) => {
        clearTimeout(timeoutId)
        resolve(result)
      },
      reject: (reason) => {
        clearTimeout(timeoutId)
        reject(reason)
      }
    }

    window.dispatchEvent(new CustomEvent<ToolbarMeasureEventDetail>(TOOLBAR_MEASURE_EVENT, { detail }))
  })
}

async function handleCenterByAxis(axis: Axis) {
  if (!hasSelection.value) {
    return
  }

  try {
    const measurements = await measureDanmakus(selectedDanmakus.value)
    const screenSize = axis === 'x' ? store.screenWidth : store.screenHeight
    let hasClampWarning = false
    let hasChange = false

    selectedDanmakus.value.forEach((danmaku) => {
      const measurement = measurements[danmaku.id]
      if (!measurement) {
        return
      }

      const danmakuSize = axis === 'x' ? measurement.width : measurement.height
      const centeredCoordinate = (screenSize - danmakuSize) / 2
      const { value, clamped } = clampCoordinate(centeredCoordinate)

      if (clamped) {
        hasClampWarning = true
      }

      applyScopedAxis(danmaku, axis, value)
      hasChange = true
    })

    if (!hasChange) {
      return
    }

    finishToolbarOperation(axis === 'x' ? '工具栏：水平居中' : '工具栏：垂直居中')

    if (hasClampWarning) {
      window.alert('部分弹幕居中后坐标小于 0，已自动修正为 0。')
    }
  } catch (error) {
    console.warn('[ToolBar] 居中计算失败:', error)
  }
}

function handleHorizontalCenter() {
  void handleCenterByAxis('x')
}

function handleVerticalCenter() {
  void handleCenterByAxis('y')
}

function handleCopyStartToEnd() {
  if (!hasSelection.value) {
    return
  }

  selectedDanmakus.value.forEach((danmaku) => {
    danmaku.transform.end.x = roundToInteger(danmaku.transform.start.x)
    danmaku.transform.end.y = roundToInteger(danmaku.transform.start.y)
  })

  finishToolbarOperation('工具栏：起始坐标应用至结束坐标')
}

function handleCopyEndToStart() {
  if (!hasSelection.value) {
    return
  }

  selectedDanmakus.value.forEach((danmaku) => {
    danmaku.transform.start.x = roundToInteger(danmaku.transform.end.x)
    danmaku.transform.start.y = roundToInteger(danmaku.transform.end.y)
  })

  finishToolbarOperation('工具栏：结束坐标应用至起始坐标')
}

function handleLineSplit() {
  if (!hasSelection.value) {
    return
  }

  const allocateId = createIdAllocator()
  const newDanmakus: DanmakuItem[] = []
  const nextSelectedIds = [...store.selectedIds]
  let hasClampWarning = false
  let hasChange = false

  selectedDanmakus.value.forEach((danmaku) => {
    const lines = danmaku.content.text.split('\n')
    if (lines.length <= 1) {
      return
    }

    hasChange = true

    const sourceDanmaku = cloneDanmaku(danmaku)
    const radian = (sourceDanmaku.transform.zRotate * Math.PI) / 180
    const lineStep = sourceDanmaku.content.size

    danmaku.content.text = lines[0]

    lines.slice(1).forEach((line, index) => {
      const offsetIndex = index + 1
      const offsetX = -Math.sin(radian) * lineStep * offsetIndex
      const offsetY = Math.cos(radian) * lineStep * offsetIndex
      const splitDanmaku = cloneDanmaku(sourceDanmaku)
      const startX = clampCoordinate(sourceDanmaku.transform.start.x + offsetX)
      const startY = clampCoordinate(sourceDanmaku.transform.start.y + offsetY)
      const endX = clampCoordinate(sourceDanmaku.transform.end.x + offsetX)
      const endY = clampCoordinate(sourceDanmaku.transform.end.y + offsetY)

      if (startX.clamped || startY.clamped || endX.clamped || endY.clamped) {
        hasClampWarning = true
      }

      splitDanmaku.id = allocateId()
      splitDanmaku.layer = sourceDanmaku.layer
      splitDanmaku.content.text = line
      splitDanmaku.transform.start.x = startX.value
      splitDanmaku.transform.start.y = startY.value
      splitDanmaku.transform.end.x = endX.value
      splitDanmaku.transform.end.y = endY.value

      newDanmakus.push(splitDanmaku)
      nextSelectedIds.push(splitDanmaku.id)
    })
  })

  if (!hasChange) {
    return
  }

  if (newDanmakus.length > 0) {
    // 新生成的弹幕统一走 store 的 layer 分配逻辑，避免时间轴冲突。
    store.assignLayersForDanmakusSequentially(newDanmakus)
    store.danmakus.push(...newDanmakus)
  }

  finishToolbarOperation('工具栏：行分隔', nextSelectedIds)

  if (hasClampWarning) {
    window.alert('部分行分隔后的坐标小于 0，已自动修正为 0。')
  }
}

function shouldSplitByCurrentTime(danmaku: DanmakuItem, currentTime: number) {
  const endTime = danmaku.startTime + danmaku.animation.duration
  if (currentTime < danmaku.startTime || currentTime > endTime) {
    return false
  }

  const beforeDuration = currentTime - danmaku.startTime
  const afterDuration = endTime - currentTime

  return beforeDuration > 10 && afterDuration > 10
}

function handleTimeSplit() {
  if (!hasSelection.value) {
    return
  }

  const allocateId = createIdAllocator()
  const currentTime = roundToInteger(store.currentTime)
  const newDanmakus: DanmakuItem[] = []
  const nextSelectedIds = [...store.selectedIds]
  let hasChange = false

  selectedDanmakus.value.forEach((danmaku) => {
    if (!shouldSplitByCurrentTime(danmaku, currentTime)) {
      return
    }

    hasChange = true

    const sourceDanmaku = cloneDanmaku(danmaku)
    const endTime = sourceDanmaku.startTime + sourceDanmaku.animation.duration
    const beforeDuration = currentTime - sourceDanmaku.startTime
    const afterDuration = endTime - currentTime
    const splitDanmaku = cloneDanmaku(sourceDanmaku)

    danmaku.animation.duration = roundToInteger(beforeDuration)

    splitDanmaku.id = allocateId()
    splitDanmaku.layer = sourceDanmaku.layer
    splitDanmaku.startTime = currentTime
    splitDanmaku.animation.duration = roundToInteger(afterDuration)

    newDanmakus.push(splitDanmaku)
    nextSelectedIds.push(splitDanmaku.id)
  })

  if (!hasChange) {
    return
  }

  if (newDanmakus.length > 0) {
    store.assignLayersForDanmakusSequentially(newDanmakus)
    store.danmakus.push(...newDanmakus)
  }

  finishToolbarOperation('工具栏：时间分割', nextSelectedIds)
}

onBeforeUnmount(() => {
  cancelPickMode()
})
</script>

<style scoped>
.toolbar {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background-color: #1e1e1e;
  width: max-content;
  box-sizing: border-box;
}

.tool-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover:not(:disabled) {
  background-color: #333;
  border-color: #444;
}

.tool-btn.active {
  background-color: #2f4f63;
  border-color: #4d88ad;
}

.tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tool-btn img {
  width: 30px;
  height: 30px;
}

.framed-group {
  display: flex;
  flex-direction: row;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 4px;
  background-color: #252525;
  gap: 4px;
  margin-top: 10px;
}

.mode-selector {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid #333;
  padding-right: 4px;
}

.mode-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #888;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.mode-btn:hover {
  color: #ddd;
}

.mode-btn.active {
  background-color: #4caf50;
  color: #fff;
  border-color: #4caf50;
}

.group-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.divider {
  width: 80%;
  height: 1px;
  background-color: #333;
  margin: 4px 0;
}
</style>
