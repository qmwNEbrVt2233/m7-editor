<template>
  <div v-show="showAdvancedTools" class="advanced-tools no-select">
    <div class="advanced-header">高级工具</div>

    <div class="advanced-tabs">
      <button
        class="advanced-tab"
        :class="{ active: activeAdvancedPanel === 'stroke' }"
        @click="activeAdvancedPanel = 'stroke'"
      >
        描边
      </button>
      <button
        class="advanced-tab"
        :class="{ active: activeAdvancedPanel === `calculator` }"
        @click="activeAdvancedPanel = `calculator`"
      >
        计算
      </button>
      <button
        class="advanced-tab"
        :class="{ active: activeAdvancedPanel === 'command' }"
        @click="activeAdvancedPanel = 'command'"
      >
        命令
      </button>
    </div>

    <div v-if="activeAdvancedPanel === 'stroke'" class="advanced-panel">
      <div class="advanced-field">
        <label>描边宽度</label>
        <input
          v-model="strokeWidthInput"
          type="number"
          min="1"
          step="1"
          class="advanced-input"
        />
      </div>

      <div class="advanced-field">
        <label>描边颜色</label>
        <div class="color-row">
          <input
            v-model="strokeColorPicker"
            type="color"
            class="color-picker"
            @input="handleStrokeColorPickerInput"
          />
          <input
            v-model="strokeColorText"
            type="text"
            class="advanced-input color-text"
            placeholder="#000001"
            @change="handleStrokeColorTextChange"
          />
        </div>
      </div>

      <button
        class="apply-btn"
        :disabled="!hasSelection"
        @click="handleApplyStroke"
      >
        应用
      </button>
    </div>

    <div v-if="activeAdvancedPanel === `calculator`" class="advanced-panel">
      <div class="advanced-field">
        <label>角度</label>
        <input
          v-model="calculatorAngleInput"
          type="text"
          class="advanced-input"
          placeholder="留空使用自身角度，支持+/-相对调整"
        />
      </div>

      <div class="advanced-field">
        <label>长度</label>
        <input
          v-model="calculatorLengthInput"
          type="number"
          class="advanced-input"
          step="1"
          placeholder="输入长度"
        />
      </div>
      
      <button
        class="apply-btn"
        :disabled="!hasSelection"
        @click="handleApplyLength"
      >
        应用
      </button>

      <div class="advanced-field checkbox">
        <label>
          <input
            v-model="lockAngleEnabled"
            type="checkbox"
          />开启锁定角度
        </label>
      </div>
    </div>
    <div v-if="activeAdvancedPanel === `command`" class="advanced-panel command-panel">
      <div class="command-log have-scrollbar">
        <div
          v-for="(log, index) in commandLogs"
          :key="`${index}-${log}`"
          class="command-log-item"
        >
          {{ log }}
        </div>
      </div>

      <textarea
        v-model="commandInput"
        type="text"
        class="advanced-text-input have-scrollbar"
        placeholder="输入命令后按 Enter"
        @keydown.enter.prevent="handleCommandSubmit"
      />
    </div>
  </div>

  <div class="toolbar no-select">
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
          :title="isPicking ? '点击播放器画面以拾取坐标，再次点击可取消' : '拾取定位 (1)'"
          @click="handlePickTool"
        >
          <img src="/src/icon/Pick_and_locate.svg" alt="拾取定位" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="垂直居中 (2)"
          @click="handleVerticalCenter"
        >
          <img src="/src/icon/horizontal_centering.svg" alt="垂直居中" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="水平居中 (3)"
          @click="handleHorizontalCenter"
        >
          <img src="/src/icon/vertical_centering.svg" alt="水平居中" />
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div class="group-tools2">
      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="水平镜像 (4)"
        @click="handleHorizontalMirror"
      >
        <img src="/src/icon/horizontal_mirror.svg" alt="水平镜像" />
      </button>

      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="垂直镜像 (5)"
        @click="handleVerticalMirror"
      >
        <img src="/src/icon/vertical_mirror.svg" alt="垂直镜像" />
      </button>
    </div>
    
    <div class="group-tools2">
      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="将起始坐标应用至结束坐标 (Ctrl + ArrowDown)"
        @click="handleCopyStartToEnd"
      >
        <img src="/src/icon/S_to_E.svg" alt="起始坐标应用至结束坐标" />
      </button>
      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="将结束坐标应用至起始坐标 (Ctrl + ArrowUp)"
        @click="handleCopyEndToStart"
      >
        <img src="/src/icon/E_to_S.svg" alt="结束坐标应用至起始坐标" />
      </button>
    </div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="互换结束与起始坐标 (6)"
      @click="handleSwapStartAndEnd"
    >
      <img src="/src/icon/S_E_exchange.svg" alt="互换结束与起始坐标" />
    </button>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="根据坐标计算z轴旋转角度 (7)"
      @click="handleCalculateZRotation"
    >
      <img src="/src/icon/zRotate_calculate.svg" alt="计算Z轴旋转" />
    </button>

    <div class="divider"></div>

    <div class="group-tools2">
      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="行分隔 (8)"
        @click="handleLineSplit"
      >
        <img src="/src/icon/Split_by_line.svg" alt="行分隔" />
      </button>

      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="字分隔 (9)"
        @click="handleLetterSplit"
      >
        <img src="/src/icon/Split_by_letter.svg" alt="字分隔" />
      </button>
    </div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="时间分割 (\)"
      @click="handleTimeSplit"
    >
      <img src="/src/icon/cut.svg" alt="时间分割" />
    </button>

    <div class="divider"></div>

    <button
      class="advanced-tool-btn"
      :class="{ active: showAdvancedTools }"
      title="高级工具 (/)"
      @click="toggleAdvancedTools"
    >
      <img src="/src/icon/advanced_tools.svg" alt="高级工具" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { useHelpStore } from '@/store/help'
import { normalizeColor, roundToInteger } from '@/utils/validation'

 type ScopeMode = 'S' | 'E' | 'B'
 type Axis = 'x' | 'y'
 type AdvancedPanel = 'stroke' | 'calculator' | 'command'

const store = useEditorStore()
const notice = useNoticeStore()
const scopeMode = ref<ScopeMode>('B')
const isPicking = ref(false)
const showAdvancedTools = ref(false)
const activeAdvancedPanel = ref<AdvancedPanel>('stroke')
const strokeWidthInput = ref('2')
const strokeColorText = ref('#000001')
const strokeColorPicker = ref('#000001')
const calculatorAngleInput = ref('')
const calculatorLengthInput = ref('200')
const lockAngleEnabled = ref(false)
const commandInput = ref('')
const commandLogs = ref<string[]>(['运算赋值命令与 /s 筛选命令已就绪'])
const selectedDanmakus = computed(() => store.getSelectedDanmakus)
const hasSelection = computed(() => selectedDanmakus.value.length > 0)
const selectedCoordinateSnapshot = computed(() => selectedDanmakus.value.map((danmaku) => ({
  id: danmaku.id,
  endX: danmaku.transform.end.x,
  endY: danmaku.transform.end.y
})))
let pickAbortController: AbortController | null = null
let applyingLockedAngle = false
let suppressLockedAngleWatch = false

function appendCommandLog(message: string) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  commandLogs.value = [`[${timestamp}] ${message}`, ...commandLogs.value].slice(0, 30)
}

async function applyApi(field: string, method: string | number | boolean | Record<string, unknown>) {
  const result = await store.applyFieldUpdate(field, method)
  if (!result.ok) {
    notice.alert(result.message, 'warn')
    return result
  }
  result.warnings.forEach((warning) => notice.alert(warning, 'warn'))
  return result
}

function cancelPickMode() {
  pickAbortController?.abort()
  pickAbortController = null
  isPicking.value = false
}

function toggleAdvancedTools() {
  showAdvancedTools.value = !showAdvancedTools.value
}

function handleStrokeColorPickerInput() {
  strokeColorText.value = strokeColorPicker.value.toUpperCase()
}

function handleStrokeColorTextChange() {
  const normalized = normalizeColor(strokeColorText.value)
  if (!normalized) {
    notice.alert('描边颜色格式无效，请输入 #RRGGBB 或 rgb(...)', 'warn')
    strokeColorText.value = strokeColorPicker.value
    return
  }
  strokeColorText.value = normalized
  strokeColorPicker.value = normalized
}

async function handleApplyStroke() {
  const result = await applyApi('@toolbar.stroke', {
    width: strokeWidthInput.value,
    color: strokeColorText.value
  })
  if (result.ok) appendCommandLog(`描边完成：新增 ${result.createdIds.length} 条弹幕`)
}

async function handleCommandSubmit() {
  const command = commandInput.value.trim()
  if (!command) {
    appendCommandLog('命令为空，未执行')
    return
  }
  const field = /^\/s\b/.test(command) ? '@selection.filter' : '@toolbar.command'
  const result = await applyApi(field, { command })
  if (result.ok) {
    appendCommandLog(field === '@selection.filter'
      ? `筛选命令执行成功：选中 ${result.selectedIds.length} 条弹幕`
      : `命令执行成功：修改 ${result.changedIds.length} 条弹幕`)
    commandInput.value = ''
  } else {
    appendCommandLog(result.message)
  }
}

async function handleCalculateZRotation() {
  await applyApi('@toolbar.calculateRotation', {})
}

async function handleApplyLength() {
  await applyApi('@toolbar.length', {
    angle: calculatorAngleInput.value,
    length: calculatorLengthInput.value
  })
}

async function handleLockedAngleUpdate(changedAxis: Axis) {
  applyingLockedAngle = true
  suppressLockedAngleWatch = true
  try {
    const result = await applyApi('@toolbar.lockAngle', { changedAxis, angle: calculatorAngleInput.value })
    if (!result.ok || result.changedIds.length === 0) suppressLockedAngleWatch = false
  } finally {
    applyingLockedAngle = false
  }
}

function handlePickTool() {
  if (!hasSelection.value) return
  if (isPicking.value) {
    cancelPickMode()
    return
  }

  const controller = new AbortController()
  pickAbortController = controller
  isPicking.value = true
  window.setTimeout(() => {
    document.addEventListener('click', (event) => {
      const screen = document.querySelector('.screen') as HTMLElement | null
      const target = event.target as Node | null
      cancelPickMode()
      if (!screen || !target || !screen.contains(target)) return
      const rect = screen.getBoundingClientRect()
      const scale = store.screenScale / 100
      const x = roundToInteger((event.clientX - rect.left) / scale, store.allowNegativeValues)
      const y = roundToInteger((event.clientY - rect.top) / scale, store.allowNegativeValues)
      void applyApi('@toolbar.pickAt', { x, y, scope: scopeMode.value })
    }, { once: true, capture: true, signal: controller.signal })
  }, 0)
}

async function handleCenterByAxis(axis: Axis) {
  if (!hasSelection.value) return
  await applyApi('@toolbar.center', { axis, scope: scopeMode.value })
}

function handleHorizontalCenter() { void handleCenterByAxis('y') }
function handleVerticalCenter() { void handleCenterByAxis('x') }
async function handleCopyStartToEnd() { await applyApi('@toolbar.copy', { direction: 'startToEnd' }) }
async function handleCopyEndToStart() { await applyApi('@toolbar.copy', { direction: 'endToStart' }) }
async function handleSwapStartAndEnd() { await applyApi('@toolbar.swap', {}) }
async function handleHorizontalMirror() { await applyApi('@toolbar.mirror', { axis: 'horizontal' }) }
async function handleVerticalMirror() { await applyApi('@toolbar.mirror', { axis: 'vertical' }) }
async function handleLineSplit() { await applyApi('@toolbar.split', { mode: 'line' }) }
async function handleLetterSplit() { await applyApi('@toolbar.split', { mode: 'letter' }) }
async function handleTimeSplit() { await applyApi('@toolbar.split', { mode: 'time' }) }

watch(selectedCoordinateSnapshot, (next, previous) => {
  if (suppressLockedAngleWatch) {
    suppressLockedAngleWatch = false
    return
  }
  if (!lockAngleEnabled.value || applyingLockedAngle || !previous || next.length !== previous.length) return
  if (!next.every((item, index) => item.id === previous[index]?.id)) return
  const xChanged = next.some((item, index) => item.endX !== previous[index]?.endX)
  const yChanged = next.some((item, index) => item.endY !== previous[index]?.endY)
  if (xChanged !== yChanged) void handleLockedAngleUpdate(xChanged ? 'x' : 'y')
}, { deep: true })

function handleShortcuts(event: KeyboardEvent) {
  const isCtrl = event.ctrlKey || event.metaKey
  const isAlt = event.altKey
  const isShift = event.shiftKey
  if (store.showCreationTools || store.showTemplateManager || store.showProjectManager || store.screenRecordingMode || notice.isVisible || useHelpStore().isVisible) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

  if (!isCtrl && !isAlt && !isShift) {
    switch (event.key) {
      case '0': scopeMode.value = scopeMode.value === 'S' ? 'E' : scopeMode.value === 'E' ? 'B' : 'S'; break
      case '1': handlePickTool(); break
      case '2': handleVerticalCenter(); break
      case '3': handleHorizontalCenter(); break
      case '4': handleHorizontalMirror(); break
      case '5': handleVerticalMirror(); break
      case '6': handleSwapStartAndEnd(); break
      case '7': handleCalculateZRotation(); break
      case '8': handleLineSplit(); break
      case '9': handleLetterSplit(); break
      case '\\': handleTimeSplit(); break
      case '/': toggleAdvancedTools(); break
    }
    return
  }
  if (event.key === 'ArrowDown' && isCtrl && !isAlt && !isShift) handleCopyStartToEnd()
  if (event.key === 'ArrowUp' && isCtrl && !isAlt && !isShift) handleCopyEndToStart()
}

onMounted(() => window.addEventListener('keydown', handleShortcuts))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcuts)
  cancelPickMode()
})
</script>

<style scoped>
.advanced-tools {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  border-right: 1px solid #333;
  box-sizing: border-box;
  margin-right: 7px;
}

.advanced-header {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}

.advanced-tabs {
  display: grid;
  grid-auto-flow: column;
  gap: 8px;
}

.advanced-tab {
  height: 32px;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  background: #252525;
  color: #bfbfbf;
  cursor: pointer;
  transition: all 0.2s ease;
}

.advanced-tab:hover {
  border-color: #555;
  color: #fff;
}

.advanced-tab.active {
  background: #27683b;
  border-color: #4caf50;
  color: #fff;
}

.advanced-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.advanced-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.advanced-field.checkbox input[type='checkbox'] {
  margin-right: 8px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.advanced-field label {
  font-size: 12px;
  color: #c9c9c9;
}

.advanced-input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background-color: #3c3c3c;
  color: #e0e0e0;
  box-sizing: border-box;
}

.advanced-input:focus {
  outline: none;
  border-color: #4caf50;
}

.advanced-text-input {
  padding: 8px 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background-color: #3c3c3c;
  color: #e0e0e0;
  font-size: 13px;
  transition: border-color 0.2s;
  height: calc(100% - 300px);
  min-height: 70px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  resize: none;
}

.advanced-text-input:focus {
  outline: none;
  border-color: #4caf50;
  background-color: #444;
}

.advanced-tool-btn img {
  width: 30px;
  height: 30px;
  transition: transform 0.1s ease;
}

.advanced-tool-btn.active img {
  transform: rotate(90deg);
}

.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  background-color: #3c3c3c;
  padding: 8px 10px;
  width: 50px;
  height: 34px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  cursor: pointer;
}

.color-text {
  width: 130px;
  flex: 1;
}

.apply-btn {
  height: 36px;
  border: 1px solid #4caf50;
  border-radius: 3px;
  background: #27683b;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-btn:hover:not(:disabled) {
  background: #2d9647;
}

.apply-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.command-panel {
  height: calc(100% - 70px);
  gap: 10px;
}

.command-log {
  height: 330px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #333;
  border-radius: 3px;
  background: #131313;
  font-size: 12px;
  color: #9ad29f;
}

.command-log-item + .command-log-item {
  margin-top: 6px;
}

.toolbar {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2%;
  background-color: #1e1e1e;
  width: max-content;
  box-sizing: border-box;
}

.advanced-tool-btn,
.tool-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
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

.group-tools2 {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
}

.divider {
  width: 80%;
  height: 1px;
  background-color: #333;
  margin: 4px 0;
}
</style>
