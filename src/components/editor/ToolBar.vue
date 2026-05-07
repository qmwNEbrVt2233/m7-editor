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

/**
 * 工具栏作用范围模式：
 * S - 仅作用于起始坐标
 * E - 仅作用于结束坐标
 * B - 同时作用于起始和结束坐标
 */
type ScopeMode = 'S' | 'E' | 'B'
type TransformTarget = 'start' | 'end'
type Axis = 'x' | 'y'
type ToolbarMeasureRequest = {
  requestId: string
  danmaku: DanmakuItem
}
type ToolbarMeasureResponse = Record<string, {
  width: number
  height: number
  rawWidth: number
  rawHeight: number
}>
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

/**
 * 根据当前 scopeMode 返回需要修改的坐标目标列表
 * 'S' -> ['start'], 'E' -> ['end'], 'B' -> ['start', 'end']
 */
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

// 将坐标值四舍五入并钳制到 0 以上，同时返回是否发生了钳制
function clampCoordinate(value: number) {
  const roundedValue = roundToInteger(value)
  return {
    value: Math.max(0, roundedValue),
    clamped: roundedValue < 0
  }
}

// 计算四个角旋转后的包围盒，用于居中计算时考虑旋转对宽高的影响
function getRotatedBoundingBox(rawWidth: number, rawHeight: number, zRotate: number) {
  const radian = zRotate * (Math.PI / 180)
  const corners = [
    { x: 0, y: 0 },
    { x: rawWidth * Math.cos(radian), y: rawWidth * Math.sin(radian) },
    { x: -rawHeight * Math.sin(radian), y: rawHeight * Math.cos(radian) },
    {
      x: rawWidth * Math.cos(radian) - rawHeight * Math.sin(radian),
      y: rawWidth * Math.sin(radian) + rawHeight * Math.cos(radian)
    }
  ]

  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

// 根据当前 S/E/B 模式，将指定的 x, y 写入弹幕的对应坐标（起始/结束/两者）
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

/**
 * 统一完成工具栏操作后的收尾工作：
 * 1. 如有必要，更新选中 ID 列表
 * 2. 记录历史快照
 * 3. 清理变更追踪状态
 */
function finishToolbarOperation(description: string, nextSelectedIds?: string[]) {
  if (nextSelectedIds) {
    store.selectedIds = Array.from(new Set(nextSelectedIds))
  }

  historyManager.recordSnapshot(store.danmakus, description)
  store._clearPendingChangeTracking()
}

// 取消拾取定位模式，移除事件监听器并重置状态
function cancelPickMode() {
  if (pickAbortController) {
    pickAbortController.abort()
    pickAbortController = null
  }

  isPicking.value = false
}

// 拾取定位工具
function handlePickTool() {
  if (!hasSelection.value) {
    return
  }

  // 如果已经在拾取状态，再次点击则取消拾取
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

        // 若点击位置不在 .screen 内，则视为放弃
        if (!screenElement || !target || !screenElement.contains(target)) {
          return
        }

        // 计算相对于 .screen 左上角的坐标
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

/**
 * 请求 DanmakuLayer 测量弹幕的实际渲染宽高。
 * 通过自定义事件 TOOLBAR_MEASURE_EVENT 发送请求，DanmakuLayer 负责创建幽灵元素并测量。
 */
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

// 水平/垂直居中通用实现
async function handleCenterByAxis(axis: Axis) {
  if (!hasSelection.value) {
    return
  }

  try {
    // 1. 请求测量弹幕实际宽高
    const measurements = await measureDanmakus(selectedDanmakus.value)
    // 2. 获取对应方向上的屏幕尺寸
    const screenSize = axis === 'x' ? store.screenWidth : store.screenHeight
    let hasClampWarning = false
    let hasChange = false

    // 3. 逐个计算居中偏移并应用
    selectedDanmakus.value.forEach((danmaku) => {
      const measurement = measurements[danmaku.id]
      if (!measurement) {
        return
      }

      // 写回的是左上角锚点坐标，所以需要先算出旋转后包围盒，再反推出锚点位置。
      const rotatedBox = getRotatedBoundingBox(
        measurement.rawWidth,
        measurement.rawHeight,
        danmaku.transform.zRotate
      )

      const centeredCoordinate = axis === 'x'
        ? ((screenSize - rotatedBox.width) / 2) - rotatedBox.minX
        : ((screenSize - rotatedBox.height) / 2) - rotatedBox.minY
      const { value, clamped } = clampCoordinate(centeredCoordinate)

      if (clamped) {
        hasClampWarning = true
      }

      // 根据 S/E/B 模式写入对应的坐标轴
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

// 水平居中工具
function handleHorizontalCenter() {
  void handleCenterByAxis('x')
}

// 垂直居中工具
function handleVerticalCenter() {
  void handleCenterByAxis('y')
}

// 将起始坐标复制到结束坐标
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

// 将结束坐标复制到起始坐标
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

/**
 * 行分隔工具
 * 对于每个含有换行符 \n 的选中弹幕，将其拆分为多个弹幕。
 * 考虑弹幕的 Z 轴旋转，新行沿旋转方向偏移 (size) 像素。
 */
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

    // 如果只有一行，无需拆分
    if (lines.length <= 1) {
      return
    }

    hasChange = true

    // 复制一份作为模板，后续行将基于此生成
    const sourceDanmaku = cloneDanmaku(danmaku)
    const radian = (sourceDanmaku.transform.zRotate * Math.PI) / 180
    const lineStep = sourceDanmaku.content.size

    danmaku.content.text = lines[0]

    // 从第二行开始创建新弹幕，并根据 Z 轴旋转计算偏移量
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

      // 分配新 ID，继承原 layer
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

/**
 * 判断弹幕是否应被当前播放头 (currentTime) 分割
 * 只有弹幕时间范围包含 currentTime 且两侧时长均 > 10ms 时才进行分割
 */
function shouldSplitByCurrentTime(danmaku: DanmakuItem, currentTime: number) {
  const endTime = danmaku.startTime + danmaku.animation.duration
  if (currentTime < danmaku.startTime || currentTime > endTime) {
    return false
  }

  const beforeDuration = currentTime - danmaku.startTime
  const afterDuration = endTime - currentTime

  return beforeDuration > 10 && afterDuration > 10
}

// 时间分割工具
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

// 组件卸载时，移除可能残留的拾取定位监听器
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
