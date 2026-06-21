<template>
  <div v-show="showAdvancedTools" class="advanced-tools">
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

      <div class="advanced-field checkbox">
        <label>
          <input
            v-model="lockAngleEnabled"
            type="checkbox"
          />开启锁定角度
        </label>
      </div>
      
      <button
        class="apply-btn"
        :disabled="!hasSelection"
        @click="handleApplyLength"
      >
        应用
      </button>
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
          :title="isPicking ? '点击播放器画面以拾取坐标，再次点击可取消' : '拾取定位'"
          @click="handlePickTool"
        >
          <img src="/src/icon/Pick_and_locate.svg" alt="拾取定位" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="垂直居中"
          @click="handleVerticalCenter"
        >
          <img src="/src/icon/horizontal_centering.svg" alt="水平居中" />
        </button>
        <button
          class="tool-btn"
          :disabled="!hasSelection"
          title="水平居中"
          @click="handleHorizontalCenter"
        >
          <img src="/src/icon/vertical_centering.svg" alt="垂直居中" />
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div class="group-tools2">
      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="水平镜像"
        @click="handleHorizontalMirror"
      >
        <img src="/src/icon/horizontal_mirror.svg" alt="水平镜像" />
      </button>

      <button
        class="tool-btn"
        :disabled="!hasSelection"
        title="垂直镜像"
        @click="handleVerticalMirror"
      >
        <img src="/src/icon/vertical_mirror.svg" alt="垂直镜像" />
      </button>
    </div>
    
    <div class="group-tools2">
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
    </div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="互换结束与起始坐标"
      @click="handleSwapStartAndEnd"
    >
      <img src="/src/icon/S_E_exchange.svg" alt="互换结束与起始坐标" />
    </button>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="根据坐标计算z轴旋转角度"
      @click="handleCalculateZRotation"
    >
      <img src="/src/icon/zRotate_calculate.svg" alt="计算Z轴旋转" />
    </button>

    <div class="divider"></div>

    <div class="group-tools2">
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
        title="字分隔"
        @click="handleLetterSplit"
      >
        <img src="/src/icon/Split_by_letter.svg" alt="字分隔" />
      </button>
    </div>

    <button
      class="tool-btn"
      :disabled="!hasSelection"
      title="时间分割"
      @click="handleTimeSplit"
    >
      <img src="/src/icon/cut.svg" alt="时间分割" />
    </button>

    <div class="divider"></div>

    <button
      class="advanced-tool-btn"
      :class="{ active: showAdvancedTools }"
      title="高级工具"
      @click="toggleAdvancedTools"
    >
      <img src="/src/icon/advanced_tools.svg" alt="高级工具" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, onMounted, onUnmounted, watch } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'
import { historyManager } from '@/core/history'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { roundToInteger, roundOpacityValue, normalizeAngle, normalizeColor } from '@/utils/validation'

/**
 * 工具栏作用范围模式：
 * S - 仅作用于起始坐标
 * E - 仅作用于结束坐标
 * B - 同时作用于起始和结束坐标
 */
type ScopeMode = 'S' | 'E' | 'B'
type TransformTarget = 'start' | 'end'
type Axis = 'x' | 'y'
type AdvancedPanel = 'stroke' | 'calculator' | 'command'
type NumericFieldKind = 'integer' | 'opacity'
type NumericFieldDefinition = {
  path: string
  kind: NumericFieldKind
}
type SelectionFieldKind = 'number' | 'string' | 'boolean'
type SelectionFieldDefinition = {
  path: string
  kind: SelectionFieldKind
}
type CommandRule = {
  target: string
  mode: 'expression' | 'upset'
  expression?: string
}
type SelectionExactCriterion = {
  type: 'exact'
  value: string
}
type SelectionRegexCriterion = {
  type: 'regex'
  value: string
  regex: RegExp
}
type SelectionRangeCriterion = {
  type: 'range'
  fromExpression: string
  toExpression: string
}
type SelectionCriterion = SelectionExactCriterion | SelectionRegexCriterion | SelectionRangeCriterion
type SelectionFilterRule =
  | { type: 'selecting' }
  | { type: 'field'; field: string; definition: SelectionFieldDefinition; criteria: SelectionCriterion[] }
type SelectionRuleGroup = SelectionFilterRule[]
type ExpressionToken =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' }
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
const STROKE_OFFSETS = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
]
const NUMERIC_FIELD_DEFINITIONS: Record<string, NumericFieldDefinition> = {
  layer: { path: 'layer', kind: 'integer' },
  startTime: { path: 'startTime', kind: 'integer' },
  size: { path: 'content.size', kind: 'integer' },
  startX: { path: 'transform.start.x', kind: 'integer' },
  startY: { path: 'transform.start.y', kind: 'integer' },
  endX: { path: 'transform.end.x', kind: 'integer' },
  endY: { path: 'transform.end.y', kind: 'integer' },
  zRotate: { path: 'transform.zRotate', kind: 'integer' },
  yRotate: { path: 'transform.yRotate', kind: 'integer' },
  opacityFrom: { path: 'opacity.from', kind: 'opacity' },
  opacityTo: { path: 'opacity.to', kind: 'opacity' },
  duration: { path: 'animation.duration', kind: 'integer' },
  moveDuration: { path: 'animation.moveDuration', kind: 'integer' },
  delay: { path: 'animation.delay', kind: 'integer' }
}
const SELECTION_FIELD_DEFINITIONS: Record<string, SelectionFieldDefinition> = {
  id: { path: 'id', kind: 'string' },
  layer: { path: 'layer', kind: 'number' },
  startTime: { path: 'startTime', kind: 'number' },
  text: { path: 'content.text', kind: 'string' },
  'content.text': { path: 'content.text', kind: 'string' },
  font: { path: 'content.font', kind: 'string' },
  'content.font': { path: 'content.font', kind: 'string' },
  size: { path: 'content.size', kind: 'number' },
  'content.size': { path: 'content.size', kind: 'number' },
  color: { path: 'content.color', kind: 'string' },
  'content.color': { path: 'content.color', kind: 'string' },
  stroke: { path: 'content.stroke', kind: 'boolean' },
  'content.stroke': { path: 'content.stroke', kind: 'boolean' },
  startX: { path: 'transform.start.x', kind: 'number' },
  'transform.start.x': { path: 'transform.start.x', kind: 'number' },
  startY: { path: 'transform.start.y', kind: 'number' },
  'transform.start.y': { path: 'transform.start.y', kind: 'number' },
  endX: { path: 'transform.end.x', kind: 'number' },
  'transform.end.x': { path: 'transform.end.x', kind: 'number' },
  endY: { path: 'transform.end.y', kind: 'number' },
  'transform.end.y': { path: 'transform.end.y', kind: 'number' },
  zRotate: { path: 'transform.zRotate', kind: 'number' },
  'transform.zRotate': { path: 'transform.zRotate', kind: 'number' },
  yRotate: { path: 'transform.yRotate', kind: 'number' },
  'transform.yRotate': { path: 'transform.yRotate', kind: 'number' },
  opacityFrom: { path: 'opacity.from', kind: 'number' },
  'opacity.from': { path: 'opacity.from', kind: 'number' },
  opacityTo: { path: 'opacity.to', kind: 'number' },
  'opacity.to': { path: 'opacity.to', kind: 'number' },
  duration: { path: 'animation.duration', kind: 'number' },
  'animation.duration': { path: 'animation.duration', kind: 'number' },
  moveDuration: { path: 'animation.moveDuration', kind: 'number' },
  'animation.moveDuration': { path: 'animation.moveDuration', kind: 'number' },
  delay: { path: 'animation.delay', kind: 'number' },
  'animation.delay': { path: 'animation.delay', kind: 'number' },
  easing: { path: 'animation.easing', kind: 'string' },
  'animation.easing': { path: 'animation.easing', kind: 'string' }
}

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
const commandLogs = ref<string[]>([
  '运算赋值命令与 /s 筛选命令已就绪。'
])

const selectedDanmakus = computed(() => store.getSelectedDanmakus)
const hasSelection = computed(() => selectedDanmakus.value.length > 0)
const selectedCoordinateSnapshot = computed(() => {
  return selectedDanmakus.value.map((danmaku) => ({
    id: danmaku.id,
    startX: danmaku.transform.start.x,
    startY: danmaku.transform.start.y,
    endX: danmaku.transform.end.x,
    endY: danmaku.transform.end.y,
    zRotate: danmaku.transform.zRotate
  }))
})

let pickAbortController: AbortController | null = null
let isApplyingLockAngle = false
let suppressLockAngleWatchCount = 0

/**
 * 根据当前 scopeMode 返回需要修改的坐标目标列表
 * 'S' -> ['start'], 'E' -> ['end'], 'B' -> ['start', 'end']
 */
function getScopeTargets(): TransformTarget[] {
  if (scopeMode.value === 'S') return ['start']
  if (scopeMode.value === 'E') return ['end']
  return ['start', 'end']
}

function cloneDanmaku(danmaku: DanmakuItem): DanmakuItem {
  return JSON.parse(JSON.stringify(danmaku)) as DanmakuItem
}

function getValueByPath(target: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], target)
}

function setValueByPath(target: Record<string, any>, path: string, value: number) {
  const keys = path.split('.')
  let current: Record<string, any> = target

  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index]
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }

  current[keys[keys.length - 1]] = value
}

function createIdAllocator() {
  const generatedId = Number(store.generateNewId())
  const maxExistingId = store.danmakus.reduce((max: number, danmaku: DanmakuItem) => {
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
  const rounded = Math.round(value)
  const roundedValue = store.allowNegativeValues ? rounded : Math.max(0, rounded)
  return {
    value: roundedValue,
    clamped: rounded < 0 && !store.allowNegativeValues
  }
}

function clampToCoordinateRange(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  if (!Number.isFinite(value)) {
    return value > 0 ? Math.max(10000, store.screenHeight, store.screenWidth) : 0
  }

  return Math.max(0, Math.min(10000, value))
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

// 解析用户输入的命令表达式
function tokenizeCommandExpression(expression: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index++
      continue
    }

    if (/[+\-*/]/.test(char)) {
      tokens.push({ type: 'operator', value: char as '+' | '-' | '*' | '/' })
      index++
      continue
    }

    if (/[()]/.test(char)) {
      tokens.push({ type: 'paren', value: char as '(' | ')' })
      index++
      continue
    }

    if (/\d|\./.test(char)) {
      let end = index + 1
      while (end < expression.length && /[\d.]/.test(expression[end])) {
        end++
      }

      const rawNumber = expression.slice(index, end)
      const parsedNumber = Number(rawNumber)
      if (!Number.isFinite(parsedNumber)) {
        throw new Error(`无效数字：${rawNumber}`)
      }

      tokens.push({ type: 'number', value: parsedNumber })
      index = end
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1
      while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end])) {
        end++
      }

      tokens.push({
        type: 'identifier',
        value: expression.slice(index, end)
      })
      index = end
      continue
    }

    throw new Error(`不支持的字符：${char}`)
  }

  return tokens
}

// 命令表达式求值函数，支持基本算术运算、括号和变量，使用递归下降解析方法实现
function evaluateCommandExpression(expression: string, variables: Record<string, number>): number {
  const tokens = tokenizeCommandExpression(expression)
  let index = 0

  function peekToken() {
    return tokens[index]
  }

  function consumeToken() {
    const token = tokens[index]
    index++
    return token
  }

  function parseExpression(): number {
    let value = parseTerm()

    while (true) {
      const token = peekToken()
      if (!token || token.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
        break
      }

      consumeToken()
      const right = parseTerm()
      value = token.value === '+' ? value + right : value - right
    }

    return value
  }

  function parseTerm(): number {
    let value = parseFactor()

    while (true) {
      const token = peekToken()
      if (!token || token.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
        break
      }

      consumeToken()
      const right = parseFactor()
      if (token.value === '/') {
        if (right === 0) {
          throw new Error('不允许除以 0')
        }
        value = value / right
      } else {
        value = value * right
      }
    }

    return value
  }

  function parseFactor(): number {
    const token = consumeToken()
    if (!token) {
      throw new Error('表达式不完整')
    }

    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      const value = parseFactor()
      return token.value === '+' ? value : -value
    }

    if (token.type === 'number') {
      return token.value
    }

    if (token.type === 'identifier') {
      if (!(token.value in variables)) {
        throw new Error(`变量 ${token.value} 不存在或不是数值字段`)
      }
      return variables[token.value]
    }

    if (token.type === 'paren' && token.value === '(') {
      const value = parseExpression()
      const closeToken = consumeToken()
      if (!closeToken || closeToken.type !== 'paren' || closeToken.value !== ')') {
        throw new Error('括号未闭合')
      }
      return value
    }

    throw new Error('表达式格式无效')
  }

  const result = parseExpression()
  if (index < tokens.length) {
    throw new Error('表达式中存在无法解析的多余内容')
  }

  if (!Number.isFinite(result)) {
    throw new Error('表达式结果不是有效数字')
  }

  return result
}

function parseCommandRules(commandText: string): CommandRule[] {
  const normalizedText = commandText.replace(/；/g, ';')
  const rules = normalizedText
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)

  if (rules.length === 0) {
    throw new Error('请输入至少一条赋值规则')
  }

  return rules.map((rule, index) => {
    const match = rule.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
    if (!match) {
      throw new Error(`第 ${index + 1} 条规则格式无效，应为 变量 = 表达式`)
    }

    const target = match[1]
    const expression = match[2].trim()
    if (!expression) {
      throw new Error(`第 ${index + 1} 条规则缺少右侧表达式`)
    }

    if (!NUMERIC_FIELD_DEFINITIONS[target]) {
      throw new Error(`第 ${index + 1} 条规则的目标字段 ${target} 不是可写入的数值字段`)
    }

    if (expression === 'upset') {
      return { target, mode: 'upset' }
    }

    return { target, mode: 'expression', expression }
  })
}

function splitOutsideQuotes(input: string, delimiter: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  const delimiters = delimiter === ';'
    ? new Set([';', '；'])
    : delimiter === ','
      ? new Set([',', '，'])
      : new Set([delimiter])

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\' && quote) {
      current += char
      escaping = true
      continue
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      current += char
      continue
    }

    if (delimiters.has(char) && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (quote) {
    throw new Error('筛选命令中存在未闭合的引号')
  }

  parts.push(current.trim())
  return parts.filter(Boolean)
}

function unescapeSelectionString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function parseSelectionCriteria(rawCriteria: string, field: string, definition: SelectionFieldDefinition): SelectionCriterion[] {
  const criteria = splitOutsideQuotes(rawCriteria, ',')
  if (criteria.length === 0) {
    throw new Error(`筛选字段 ${field} 缺少匹配条件`)
  }

  return criteria.map((criterion) => {
    const trimmedCriterion = criterion.trim()
    if (trimmedCriterion.startsWith("'") && trimmedCriterion.endsWith("'")) {
      return {
        type: 'exact',
        value: unescapeSelectionString(trimmedCriterion.slice(1, -1))
      }
    }

    if (trimmedCriterion.startsWith('<') && trimmedCriterion.endsWith('>')) {
      const pattern = trimmedCriterion.slice(1, -1)
      try {
        return {
          type: 'regex',
          value: pattern,
          regex: new RegExp(pattern)
        }
      } catch (error) {
        throw new Error(`筛选字段 ${field} 的正则表达式无效: ${error}`)
      }
    }

    if (definition.kind === 'number') {
      const rangeParts = splitOutsideQuotes(trimmedCriterion, '~')
      if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
        throw new Error(`筛选字段 ${field} 的条件格式无效，应为 '匹配值' 或 数值~数值`)
      }

      return {
        type: 'range',
        fromExpression: rangeParts[0],
        toExpression: rangeParts[1]
      }
    }

    if (definition.kind === 'string') {
      throw new Error(`筛选字段 ${field} 的条件格式无效，应为 '匹配值' 或 <正则表达式>`)
    }

    throw new Error(`筛选字段 ${field} 只能使用 '匹配值' 作为条件`)
  })
}

function parseSelectionFilterRule(rawRule: string, groupIndex: number, ruleIndex: number): SelectionFilterRule {
  const trimmedRule = rawRule.trim()
  if (trimmedRule === 'selecting') {
    return { type: 'selecting' }
  }

  const match = trimmedRule.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*"([\s\S]*)"$/)
  if (!match) {
    throw new Error(`第 ${groupIndex + 1} 组第 ${ruleIndex + 1} 条筛选规则格式无效`)
  }

  const field = match[1]
  const definition = SELECTION_FIELD_DEFINITIONS[field]
  if (!definition) {
    throw new Error(`筛选字段 ${field} 不存在`)
  }

  return {
    type: 'field',
    field,
    definition,
    criteria: parseSelectionCriteria(match[2], field, definition)
  }
}

function parseSelectionCommand(commandText: string): SelectionRuleGroup[] {
  const body = commandText.replace(/^\/s\b/, '').trim()
  if (!body) {
    throw new Error('请输入至少一组筛选规则')
  }

  const groups = splitOutsideQuotes(body, ';')
  if (groups.length === 0) {
    throw new Error('请输入至少一组筛选规则')
  }

  return groups.map((group, groupIndex) => {
    const rawRules = splitOutsideQuotes(group, ',')
    if (rawRules.length === 0) {
      throw new Error(`第 ${groupIndex + 1} 组筛选规则为空`)
    }

    return rawRules.map((rule, ruleIndex) => parseSelectionFilterRule(rule, groupIndex, ruleIndex))
  })
}

function createNumericVariableContext(danmaku: DanmakuItem): Record<string, number> {
  const variables: Record<string, number> = {}

  Object.entries(NUMERIC_FIELD_DEFINITIONS).forEach(([fieldName, definition]) => {
    const value = getValueByPath(danmaku as Record<string, any>, definition.path)
    if (typeof value === 'number' && Number.isFinite(value)) {
      variables[fieldName] = value
    }
  })

  return variables
}

function matchesExactSelectionCriterion(value: unknown, criterionValue: string): boolean {
  if (typeof value === 'boolean') {
    return String(value) === criterionValue
  }

  if (value === null || value === undefined) {
    return criterionValue === ''
  }

  return String(value) === criterionValue
}

function matchesSelectionFieldRule(danmaku: DanmakuItem, rule: Extract<SelectionFilterRule, { type: 'field' }>): boolean {
  const value = getValueByPath(danmaku as Record<string, any>, rule.definition.path)

  return rule.criteria.some((criterion) => {
    if (criterion.type === 'exact') {
      return matchesExactSelectionCriterion(value, criterion.value)
    }

    if (criterion.type === 'regex') {
      if (value === null || value === undefined) {
        return false
      }

      return criterion.regex.test(String(value))
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return false
    }

    const variables = createNumericVariableContext(danmaku)
    const fromValue = evaluateCommandExpression(criterion.fromExpression, variables)
    const toValue = evaluateCommandExpression(criterion.toExpression, variables)
    const minValue = Math.min(fromValue, toValue)
    const maxValue = Math.max(fromValue, toValue)
    return value >= minValue && value <= maxValue
  })
}

function matchesSelectionRuleGroup(danmaku: DanmakuItem, group: SelectionRuleGroup, selectingIds: Set<string>): boolean {
  return group.every((rule) => {
    if (rule.type === 'selecting') {
      return selectingIds.has(danmaku.id)
    }

    return matchesSelectionFieldRule(danmaku, rule)
  })
}

function handleSelectionCommand(command: string) {
  let groups: SelectionRuleGroup[]

  try {
    groups = parseSelectionCommand(command)
  } catch (error) {
    appendCommandLog(error instanceof Error ? error.message : '筛选命令解析失败')
    return
  }

  const selectingIds = new Set(store.selectedIds)
  let matchedDanmakus: DanmakuItem[]

  try {
    matchedDanmakus = store.danmakus.filter((danmaku: DanmakuItem) => {
      return groups.some((group) => matchesSelectionRuleGroup(danmaku, group, selectingIds))
    })
  } catch (error) {
    appendCommandLog(error instanceof Error ? error.message : '筛选命令执行失败')
    return
  }

  store.selectedIds = matchedDanmakus.map((danmaku: DanmakuItem) => danmaku.id)
  appendCommandLog(`筛选命令执行成功：${groups.length} 组规则，选中 ${store.selectedIds.length} 条弹幕。`)
  commandInput.value = ''
}

function parseAngleMode(input: string) {
  const trimmed = input.trim()

  if (!trimmed) {
    return { mode: 'self' as const }
  }

  if (/^[+-]\d+(\.\d+)?$/.test(trimmed)) {
    return {
      mode: 'relative' as const,
      value: Number(trimmed)
    }
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return {
      mode: 'absolute' as const,
      value: Number(trimmed)
    }
  }

  return {
    mode: 'invalid' as const,
    message: '角度输入格式无效，请留空，或输入数字，或输入 +数字 / -数字。'
  }
}

// 根据用户输入的角度模式解析出最终的角度值，支持留空使用自身角度、相对调整和绝对角度
function resolveAngleForDanmaku(danmaku: DanmakuItem): number | null {
  const parsed = parseAngleMode(calculatorAngleInput.value)

  if (parsed.mode === 'invalid') {
    notice.alert(parsed.message, 'warn')
    return null
  }

  if (parsed.mode === 'self') {
    return normalizeAngle(danmaku.transform.zRotate)
  }

  if (parsed.mode === 'relative') {
    return normalizeAngle(danmaku.transform.zRotate + parsed.value)
  }

  return normalizeAngle(parsed.value)
}

// 解析长度输入
function parseLengthInput(): number | null {
  const rawValue = String(calculatorLengthInput.value ?? '').trim()
  if (!rawValue) {
    notice.alert('请输入长度')
    return null
  }

  const parsedLength = Number(rawValue)

  calculatorLengthInput.value = rawValue
  return parsedLength
}

// 在锁定角度模式下，根据已知的起始坐标、已知轴上的坐标值和角度，计算出另一个轴上的坐标值，并钳制在合法范围内
function projectEndPointWithLockedAngle(
  startX: number,
  startY: number,
  knownAxis: Axis,
  knownValue: number,
  angle: number
) {
  const radian = angle * Math.PI / 180
  const dx = Math.cos(radian)
  const dy = Math.sin(radian)
  const epsilon = 1e-6

  let nextX = knownAxis === 'x' ? knownValue : startX
  let nextY = knownAxis === 'y' ? knownValue : startY

  if (knownAxis === 'x') {
    if (Math.abs(dx) > epsilon) {
      const t = (nextX - startX) / dx
      nextY = startY + t * dy
    } else {
      nextY = dy >= 0 ? Infinity : -Infinity
    }
  } else {
    if (Math.abs(dy) > epsilon) {
      const t = (nextY - startY) / dy
      nextX = startX + t * dx
    } else {
      nextX = dx >= 0 ? Infinity : -Infinity
    }
  }

  let clampedX = clampToCoordinateRange(nextX)
  let clampedY = clampToCoordinateRange(nextY)

  if (clampedX !== nextX && Math.abs(dx) > epsilon) {
    const t = (clampedX - startX) / dx
    clampedY = clampToCoordinateRange(startY + t * dy)
  }

  if (clampedY !== nextY && Math.abs(dy) > epsilon) {
    const t = (clampedY - startY) / dy
    clampedX = clampToCoordinateRange(startX + t * dx)
  }

  return {
    x: roundToInteger(clampedX, store.allowNegativeValues),
    y: roundToInteger(clampedY, store.allowNegativeValues),
    clamped:
      clampedX !== nextX ||
      clampedY !== nextY ||
      !Number.isFinite(nextX) ||
      !Number.isFinite(nextY)
  }
}

// 根据当前 S/E/B 模式，将指定的 x, y 写入弹幕的对应坐标（起始/结束/两者）
function applyScopedPosition(danmaku: DanmakuItem, x: number, y: number) {
  const roundedX = roundToInteger(x, store.allowNegativeValues)
  const roundedY = roundToInteger(y, store.allowNegativeValues)

  getScopeTargets().forEach((target) => {
    danmaku.transform[target].x = roundedX
    danmaku.transform[target].y = roundedY
  })
}

function applyScopedAxis(danmaku: DanmakuItem, axis: Axis, value: number) {
  const roundedValue = roundToInteger(value, store.allowNegativeValues)

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
}

// 取消拾取定位模式，移除事件监听器并重置状态
function cancelPickMode() {
  if (pickAbortController) {
    pickAbortController.abort()
    pickAbortController = null
  }

  isPicking.value = false
}

// 切换高级工具面板显示状态
function toggleAdvancedTools() {
  showAdvancedTools.value = !showAdvancedTools.value
}

// 在命令日志顶部添加一条新日志，并限制日志总数不超过 30 条
function appendCommandLog(message: string) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  commandLogs.value.unshift(`[${timestamp}] ${message}`)
  commandLogs.value = commandLogs.value.slice(0, 30)
}

function shuffleArray<T>(values: T[]): T[] {
  const shuffled = [...values]

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const temp = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = temp
  }

  return shuffled
}

function readNumericFieldValue(danmaku: DanmakuItem, path: string, label: string): number {
  const value = getValueByPath(danmaku as Record<string, any>, path)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 不是有效数值，无法执行 upset`)
  }

  return value
}

// 处理描边颜色选择器输入事件，将颜色值同步到文本输入框
function handleStrokeColorPickerInput() {
  strokeColorText.value = strokeColorPicker.value.toUpperCase()
}

// 处理描边颜色文本输入框的 change 事件，验证并规范化颜色值后同步到颜色选择器
function handleStrokeColorTextChange() {
  const normalizedColor = normalizeColor(strokeColorText.value)
  if (!normalizedColor) {
    notice.alert('描边颜色格式无效，请输入 #RRGGBB 或 rgb(...)。', 'warn')
    strokeColorText.value = strokeColorPicker.value
    return
  }

  strokeColorText.value = normalizedColor
  strokeColorPicker.value = normalizedColor
}

// 验证并规范化描边宽度输入，确保其为大于 0 的整数
function normalizeStrokeWidth(): number | null {
  const parsedWidth = Number(strokeWidthInput.value)
  if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
    notice.alert('描边宽度必须是大于 0 的数字。', 'warn')
    return null
  }

  const width = Math.max(1, roundToInteger(parsedWidth, store.allowNegativeValues))
  strokeWidthInput.value = String(width)
  return width
}

// 检查候选弹幕在指定层级与已占用层级的弹幕是否存在时间重叠冲突
function hasLayerConflict(candidate: DanmakuItem, layer: number, occupiedDanmakus: DanmakuItem[]) {
  return occupiedDanmakus.some((existingDanmaku) => {
    if (existingDanmaku.layer !== layer) {
      return false
    }

    return (
      candidate.startTime < existingDanmaku.startTime + existingDanmaku.animation.duration &&
      existingDanmaku.startTime < candidate.startTime + candidate.animation.duration
    )
  })
}

// 为一组弹幕分配连续的层级，确保它们在时间上不与已占用层级的弹幕冲突
function assignSequentialLayersForGroup(group: DanmakuItem[], occupiedDanmakus: DanmakuItem[]) {
  const maxLayer = Math.max(0, store.maxLayers - 1)

  group.forEach((candidate) => {
    let layer = Math.max(0, roundToInteger(candidate.layer, store.allowNegativeValues))

    while (layer < store.maxLayers && hasLayerConflict(candidate, layer, occupiedDanmakus)) {
      layer++
    }

    candidate.layer = Math.min(layer, maxLayer)
    occupiedDanmakus.push(cloneDanmaku(candidate))
  })
}

// 为选中弹幕添加描边，为每条选中弹幕生成 8 条偏移的描边副本，将原弹幕放在最上层，最后统一分配层级以避免冲突
function handleApplyStroke() {
  if (!hasSelection.value) {
    return
  }

  const strokeWidth = normalizeStrokeWidth()
  if (strokeWidth === null) {
    return
  }

  const normalizedColor = normalizeColor(strokeColorText.value)
  if (!normalizedColor) {
    notice.alert('描边颜色格式无效，请输入 #RRGGBB 或 rgb(...)。', 'warn')
    return
  }

  strokeColorText.value = normalizedColor
  strokeColorPicker.value = normalizedColor

  const allocateId = createIdAllocator()
  const occupiedDanmakus = store.danmakus
    .filter((danmaku: any) => !store.selectedIds.includes(danmaku.id))
    .map((danmaku: any) => cloneDanmaku(danmaku))

  const newDanmakus: DanmakuItem[] = []
  const nextSelectedIds = [...store.selectedIds]
  let hasClampWarning = false
  let hasChange = false

  selectedDanmakus.value.forEach((originalDanmaku) => {
    const sourceDanmaku = cloneDanmaku(originalDanmaku)
    const outlineDanmakus = STROKE_OFFSETS.map((offset, index) => {
      const outlineDanmaku = cloneDanmaku(sourceDanmaku)
      const startX = clampCoordinate(sourceDanmaku.transform.start.x + (offset.x * strokeWidth))
      const startY = clampCoordinate(sourceDanmaku.transform.start.y + (offset.y * strokeWidth))
      const endX = clampCoordinate(sourceDanmaku.transform.end.x + (offset.x * strokeWidth))
      const endY = clampCoordinate(sourceDanmaku.transform.end.y + (offset.y * strokeWidth))

      if (startX.clamped || startY.clamped || endX.clamped || endY.clamped) {
        hasClampWarning = true
      }

      outlineDanmaku.id = allocateId()
      outlineDanmaku.layer = sourceDanmaku.layer + index
      outlineDanmaku.content.color = normalizedColor
      outlineDanmaku.transform.start.x = startX.value
      outlineDanmaku.transform.start.y = startY.value
      outlineDanmaku.transform.end.x = endX.value
      outlineDanmaku.transform.end.y = endY.value

      return outlineDanmaku
    })

    const originalShadow = cloneDanmaku(sourceDanmaku)
    originalShadow.layer = sourceDanmaku.layer + STROKE_OFFSETS.length

    const orderedGroup = [...outlineDanmakus, originalShadow]
    assignSequentialLayersForGroup(orderedGroup, occupiedDanmakus)

    outlineDanmakus.forEach((outlineDanmaku) => {
      newDanmakus.push(outlineDanmaku)
      nextSelectedIds.push(outlineDanmaku.id)
    })

    originalDanmaku.layer = originalShadow.layer
    hasChange = true
  })

  if (!hasChange) {
    return
  }

  store.danmakus.push(...newDanmakus)
  finishToolbarOperation('工具栏：高级工具描边', nextSelectedIds)

  if (hasClampWarning) {
    notice.alert('部分描边弹幕坐标小于 0，已自动修正为 0。')
  }
}

// 命令输入框提交事件处理函数，解析用户输入的命令规则并应用到选中弹幕上，支持复杂表达式和多个规则
function handleCommandSubmit() {
  const command = commandInput.value.trim()
  if (!command) {
    appendCommandLog('命令为空，未执行。')
    return
  }

  if (/^\/s\b/.test(command)) {
    handleSelectionCommand(command)
    return
  }

  if (!hasSelection.value) {
    appendCommandLog('没有选中弹幕，命令未执行。')
    return
  }

  let rules: CommandRule[]

  try {
    rules = parseCommandRules(command)
  } catch (error) {
    appendCommandLog(error instanceof Error ? error.message : '命令解析失败')
    return
  }

  const baseDanmakus = selectedDanmakus.value.map((danmaku) => cloneDanmaku(danmaku))
  const workingDanmakus = baseDanmakus.map((danmaku) => cloneDanmaku(danmaku))
  const baseVariableContexts = baseDanmakus.map((danmaku) => createNumericVariableContext(danmaku))
  let hasChange = false

  try {
    rules.forEach((rule) => {
      const definition = NUMERIC_FIELD_DEFINITIONS[rule.target]

      if (rule.mode === 'upset') {
        const shuffledValues = shuffleArray(
          workingDanmakus.map((danmaku) => readNumericFieldValue(danmaku, definition.path, rule.target))
        )

        workingDanmakus.forEach((danmaku, index) => {
          setValueByPath(danmaku as Record<string, any>, definition.path, shuffledValues[index])
        })
        return
      }

      workingDanmakus.forEach((danmaku, index) => {
        const result = evaluateCommandExpression(rule.expression || '', baseVariableContexts[index])
        const normalizedValue = definition.kind === 'opacity'
          ? roundOpacityValue(result)
          : roundToInteger(result, store.allowNegativeValues)

        setValueByPath(danmaku as Record<string, any>, definition.path, normalizedValue)
      })
    })
  } catch (error) {
    appendCommandLog(error instanceof Error ? error.message : '命令执行失败')
    return
  }

  workingDanmakus.forEach((updatedDanmaku, index) => {
    const targetDanmaku = selectedDanmakus.value[index]
    if (!targetDanmaku) {
      return
    }

    const nextValue = JSON.stringify(updatedDanmaku)
    const currentValue = JSON.stringify(targetDanmaku)
    if (nextValue === currentValue) {
      return
    }

    Object.assign(targetDanmaku, updatedDanmaku)
    hasChange = true
  })

  if (!hasChange) {
    appendCommandLog('命令执行完成，但没有产生实际变更。')
    commandInput.value = ''
    return
  }

  finishToolbarOperation(`命令执行：${rules.length} 条规则`)
  appendCommandLog(`命令执行成功：${rules.length} 条规则，${selectedDanmakus.value.length} 条弹幕。`)
  commandInput.value = ''
}

// 根据坐标计算 Z 轴旋转角度，使用 atan2(dy, dx) 计算角度并转换为度数，最后规范化为 0-360 范围内的整数
function handleCalculateZRotation() {
  if (!hasSelection.value) {
    return
  }

  let hasChange = false

  selectedDanmakus.value.forEach((danmaku) => {
    const dx = danmaku.transform.end.x - danmaku.transform.start.x
    const dy = danmaku.transform.end.y - danmaku.transform.start.y
    const angle = normalizeAngle(Math.atan2(dy, dx) * (180 / Math.PI))
    const roundedAngle = roundToInteger(angle, store.allowNegativeValues)

    if (danmaku.transform.zRotate !== roundedAngle) {
      danmaku.transform.zRotate = roundedAngle
      hasChange = true
    }
  })

  if (!hasChange) {
    return
  }

  finishToolbarOperation('工具栏：根据坐标计算Z轴旋转')
}

function handleApplyLength() {
  if (!hasSelection.value) {
    return
  }

  const length = parseLengthInput()
  if (length === null) {
    return
  }

  let hasClampWarning = false
  let hasChange = false

  for (const danmaku of selectedDanmakus.value) {
    const angle = resolveAngleForDanmaku(danmaku)
    if (angle === null) {
      return
    }

    const radian = angle * Math.PI / 180
    const nextEndX = danmaku.transform.start.x + length * Math.cos(radian)
    const nextEndY = danmaku.transform.start.y + length * Math.sin(radian)
    const clampedEndX = clampToCoordinateRange(nextEndX)
    const clampedEndY = clampToCoordinateRange(nextEndY)
    const roundedEndX = roundToInteger(clampedEndX, store.allowNegativeValues)
    const roundedEndY = roundToInteger(clampedEndY, store.allowNegativeValues)

    if (clampedEndX !== nextEndX || clampedEndY !== nextEndY) {
      hasClampWarning = true
    }

    if (
      danmaku.transform.end.x !== roundedEndX ||
      danmaku.transform.end.y !== roundedEndY
    ) {
      danmaku.transform.end.x = roundedEndX
      danmaku.transform.end.y = roundedEndY
      hasChange = true
    }
  }

  if (!hasChange) {
    return
  }

  finishToolbarOperation('工具栏：长度输入')

  if (hasClampWarning) {
    notice.alert('部分长度计算结果超出坐标范围，已自动限制在 0 到 10000 之间。')
  }
}

// 在锁定角度模式下，当用户修改了某个坐标轴的值时，自动计算另一个坐标轴的值以保持原有角度不变，并钳制在合法范围内
function handleLockedAngleUpdate(changedAxis: Axis) {
  if (!lockAngleEnabled.value || !hasSelection.value || isApplyingLockAngle) {
    return
  }

  isApplyingLockAngle = true

  let hasChange = false
  let hasClampWarning = false

  try {
    for (const danmaku of selectedDanmakus.value) {
      const angle = resolveAngleForDanmaku(danmaku)
      if (angle === null) {
        return
      }

      const projected = projectEndPointWithLockedAngle(
        danmaku.transform.start.x,
        danmaku.transform.start.y,
        changedAxis,
        changedAxis === 'x' ? danmaku.transform.end.x : danmaku.transform.end.y,
        angle
      )

      if (
        danmaku.transform.end.x !== projected.x ||
        danmaku.transform.end.y !== projected.y
      ) {
        danmaku.transform.end.x = projected.x
        danmaku.transform.end.y = projected.y
        hasChange = true
      }

      if (projected.clamped) {
        hasClampWarning = true
      }
    }
  } finally {
    isApplyingLockAngle = false
  }

  if (!hasChange) {
    return
  }

  suppressLockAngleWatchCount = 1
  finishToolbarOperation('工具栏：锁定角度')

  if (hasClampWarning) {
    notice.alert('部分锁定角度结果超出坐标范围，已自动限制在 0 到 10000 之间。')
  }
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
        // 考虑 screenScale 缩放：屏幕被 transform: scale 缩放，需要除以缩放比例得到实际画布坐标
        const scaleRatio = store.screenScale / 100
        const x = roundToInteger((event.clientX - rect.left) / scaleRatio, store.allowNegativeValues)
        const y = roundToInteger((event.clientY - rect.top) / scaleRatio, store.allowNegativeValues)

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
      notice.alert('部分弹幕居中后坐标小于 0，已自动修正为 0。', 'warn')
    }
  } catch (error) {
    notice.alert('居中计算失败:', 'error', '工具栏错误', error)
  }
}

// 水平居中工具
function handleHorizontalCenter() {
  void handleCenterByAxis('y')
}

// 垂直居中工具
function handleVerticalCenter() {
  void handleCenterByAxis('x')
}

// 将起始坐标复制到结束坐标
function handleCopyStartToEnd() {
  if (!hasSelection.value) {
    return
  }

  selectedDanmakus.value.forEach((danmaku) => {
    danmaku.transform.end.x = roundToInteger(danmaku.transform.start.x, store.allowNegativeValues)
    danmaku.transform.end.y = roundToInteger(danmaku.transform.start.y, store.allowNegativeValues)
  })

  finishToolbarOperation('工具栏：起始坐标应用至结束坐标')
}

// 将结束坐标复制到起始坐标
function handleCopyEndToStart() {
  if (!hasSelection.value) {
    return
  }

  selectedDanmakus.value.forEach((danmaku) => {
    danmaku.transform.start.x = roundToInteger(danmaku.transform.end.x, store.allowNegativeValues)
    danmaku.transform.start.y = roundToInteger(danmaku.transform.end.y, store.allowNegativeValues)
  })

  finishToolbarOperation('工具栏：结束坐标应用至起始坐标')
}

// 互换起始坐标与结束坐标
function handleSwapStartAndEnd() {
  if (!hasSelection.value) {
    return
  }

  selectedDanmakus.value.forEach((danmaku) => {
    const startX = roundToInteger(danmaku.transform.start.x, store.allowNegativeValues)
    const startY = roundToInteger(danmaku.transform.start.y, store.allowNegativeValues)
    const endX = roundToInteger(danmaku.transform.end.x, store.allowNegativeValues)
    const endY = roundToInteger(danmaku.transform.end.y, store.allowNegativeValues)

    danmaku.transform.start.x = endX
    danmaku.transform.start.y = endY
    danmaku.transform.end.x = startX
    danmaku.transform.end.y = startY
  })

  finishToolbarOperation('工具栏：互换结束与起始坐标')
}

function mirrorCoordinate(value: number, axisSize: number): number {
  return roundToInteger(axisSize - value, store.allowNegativeValues)
}

function createMeasureDanmaku(danmaku: DanmakuItem, id: string, text: string): DanmakuItem {
  const measureDanmaku = cloneDanmaku(danmaku)
  measureDanmaku.id = id
  measureDanmaku.content.text = text
  return measureDanmaku
}

// 通用行分隔实现
function splitDanmakusByLine(danmakus: DanmakuItem[], allocateId: () => string) {
  const newDanmakus: DanmakuItem[] = []
  const nextSelectedIds = [...store.selectedIds]
  const singleLineDanmakus: DanmakuItem[] = []
  let hasClampWarning = false
  let hasChange = false

  danmakus.forEach((danmaku) => {
    const lines = danmaku.content.text.split('\n')

    if (lines.length <= 1) {
      singleLineDanmakus.push(danmaku)
      return
    }

    hasChange = true

    const sourceDanmaku = cloneDanmaku(danmaku)
    const radian = (sourceDanmaku.transform.zRotate * Math.PI) / 180
    const lineStep = sourceDanmaku.content.size

    danmaku.content.text = lines[0]
    singleLineDanmakus.push(danmaku)

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
      singleLineDanmakus.push(splitDanmaku)
    })
  })

  return {
    hasChange,
    hasClampWarning,
    newDanmakus,
    nextSelectedIds,
    singleLineDanmakus
  }
}

// 水平镜像功能
function handleHorizontalMirror() {
  if (!hasSelection.value) {
    return
  }

  let hasChange = false
  let hasClampWarning = false

  selectedDanmakus.value.forEach((danmaku) => {
    const mirroredStartX = clampCoordinate(mirrorCoordinate(danmaku.transform.start.x, store.screenWidth))
    const mirroredEndX = clampCoordinate(mirrorCoordinate(danmaku.transform.end.x, store.screenWidth))

    if (mirroredStartX.clamped || mirroredEndX.clamped) {
      hasClampWarning = true
    }

    danmaku.transform.start.x = mirroredStartX.value
    danmaku.transform.end.x = mirroredEndX.value
    danmaku.transform.zRotate = normalizeAngle(360 - danmaku.transform.zRotate)
    danmaku.transform.yRotate = normalizeAngle(180 - danmaku.transform.yRotate)
    hasChange = true
  })

  if (!hasChange) {
    return
  }

  finishToolbarOperation('工具栏：水平镜像')

  if (hasClampWarning) {
    notice.alert('部分水平镜像后的坐标小于 0，已自动修正为 0。')
  }
}

// 垂直镜像功能
function handleVerticalMirror() {
  if (!hasSelection.value) {
    return
  }

  let hasChange = false
  let hasClampWarning = false

  selectedDanmakus.value.forEach((danmaku) => {
    const mirroredStartY = clampCoordinate(mirrorCoordinate(danmaku.transform.start.y, store.screenHeight))
    const mirroredEndY = clampCoordinate(mirrorCoordinate(danmaku.transform.end.y, store.screenHeight))

    if (mirroredStartY.clamped || mirroredEndY.clamped) {
      hasClampWarning = true
    }

    danmaku.transform.start.y = mirroredStartY.value
    danmaku.transform.end.y = mirroredEndY.value
    danmaku.transform.zRotate = normalizeAngle(180 - danmaku.transform.zRotate)
    danmaku.transform.yRotate = normalizeAngle(180 - danmaku.transform.yRotate)
    hasChange = true
  })

  if (!hasChange) {
    return
  }

  finishToolbarOperation('工具栏：垂直镜像')

  if (hasClampWarning) {
    notice.alert('部分垂直镜像后的坐标小于 0，已自动修正为 0。')
  }
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
  const {
    hasChange,
    hasClampWarning,
    newDanmakus,
    nextSelectedIds
  } = splitDanmakusByLine(selectedDanmakus.value, allocateId)

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
    notice.alert('部分行分隔后的坐标小于 0，已自动修正为 0。')
  }
}

// 字分隔工具
async function handleLetterSplit() {
  if (!hasSelection.value) {
    return
  }

  const allocateId = createIdAllocator()
  const lineSplitResult = splitDanmakusByLine(selectedDanmakus.value, allocateId)
  const letterDanmakus: DanmakuItem[] = []
  const nextSelectedIds = [...lineSplitResult.nextSelectedIds]
  let hasChange = lineSplitResult.hasChange
  let hasClampWarning = lineSplitResult.hasClampWarning

  const measurableDanmakus = lineSplitResult.singleLineDanmakus.filter((danmaku) => {
    return danmaku.content.text.length > 1
  })

  if (measurableDanmakus.length === 0 && !lineSplitResult.hasChange) {
    return
  }

  const measureRequests: DanmakuItem[] = []
  const prefixWidthMap = new Map<string, number>()

  measurableDanmakus.forEach((danmaku) => {
    for (let index = 1; index < danmaku.content.text.length; index++) {
      measureRequests.push(
        createMeasureDanmaku(
          danmaku,
          `measure-${danmaku.id}-${index}`,
          danmaku.content.text.slice(0, index)
        )
      )
    }
  })

  if (measureRequests.length > 0) {
    try {
      const measurements = await measureDanmakus(measureRequests)

      measurableDanmakus.forEach((danmaku) => {
        for (let index = 1; index < danmaku.content.text.length; index++) {
          const measurementId = `measure-${danmaku.id}-${index}`
          prefixWidthMap.set(measurementId, measurements[measurementId]?.rawWidth ?? 0)
        }
      })
    } catch (error) {
      notice.alert('字分隔测量失败:', 'error', '工具栏错误', error)
      return
    }
  }

  measurableDanmakus.forEach((danmaku) => {
    const sourceDanmaku = cloneDanmaku(danmaku)
    const text = sourceDanmaku.content.text
    const radian = (sourceDanmaku.transform.zRotate * Math.PI) / 180

    danmaku.content.text = text[0]
    hasChange = true

    for (let index = 1; index < text.length; index++) {
      const prefixWidth = prefixWidthMap.get(`measure-${danmaku.id}-${index}`) ?? 0
      const offsetX = Math.cos(radian) * prefixWidth
      const offsetY = Math.sin(radian) * prefixWidth
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
      splitDanmaku.content.text = text[index]
      splitDanmaku.transform.start.x = startX.value
      splitDanmaku.transform.start.y = startY.value
      splitDanmaku.transform.end.x = endX.value
      splitDanmaku.transform.end.y = endY.value

      letterDanmakus.push(splitDanmaku)
      nextSelectedIds.push(splitDanmaku.id)
    }
  })

  const newDanmakus = [...lineSplitResult.newDanmakus, ...letterDanmakus]

  if (!hasChange) {
    return
  }

  if (newDanmakus.length > 0) {
    store.assignLayersForDanmakusSequentially(newDanmakus)
    store.danmakus.push(...newDanmakus)
  }

  finishToolbarOperation('工具栏：字分隔', nextSelectedIds)

  if (hasClampWarning) {
    notice.alert('部分字分隔后的坐标小于 0，已自动修正为 0。')
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

// 锁定角度工具
watch(selectedCoordinateSnapshot, (nextSnapshot, previousSnapshot) => {
  if (!lockAngleEnabled.value || isApplyingLockAngle) {
    return
  }

  if (suppressLockAngleWatchCount > 0) {
    suppressLockAngleWatchCount--
    return
  }

  if (!previousSnapshot || nextSnapshot.length !== previousSnapshot.length) {
    return
  }

  const sameSelection = nextSnapshot.every((item, index) => {
    return item.id === previousSnapshot[index]?.id
  })

  if (!sameSelection) {
    return
  }

  let xChanged = false
  let yChanged = false

  nextSnapshot.forEach((item, index) => {
    const previousItem = previousSnapshot[index]
    if (!previousItem) {
      return
    }

    if (item.endX !== previousItem.endX) {
      xChanged = true
    }

    if (item.endY !== previousItem.endY) {
      yChanged = true
    }
  })

  if (xChanged === yChanged) {
    return
  }

  handleLockedAngleUpdate(xChanged ? 'x' : 'y')
}, { deep: true })

function handleshortcuts(e: KeyboardEvent) {
  
  const isCtrl = e.ctrlKey || e.metaKey
  
  if (store.showCreationTools || store.screenRecordingMode || notice.isVisible) {
    return
  }

  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }

  if (e.key === '0' ) {
    if (scopeMode.value === 'S') {
      scopeMode.value = 'E'
    } else if (scopeMode.value === 'E') {
      scopeMode.value = 'B'
    } else {
      scopeMode.value = 'S'
    }
    console.log('[工具栏] 快捷键：切换应用范围')
  }

  if (e.key === '1' ) {
    handlePickTool()
  }

  if (e.key === '2' ) {
    handleVerticalCenter()
  }

  if (e.key === '3' ) {
    handleHorizontalCenter()
  }

  if (e.key === '4' ) {
    handleHorizontalMirror()
  }

  if (e.key === '5' ) {
    handleVerticalMirror()
  }

  if (e.key === '6' ) {
    handleSwapStartAndEnd()
  }

  if (e.key === '7' ) {
    handleCalculateZRotation()
  }

  if (e.key === '8' ) {
    handleLineSplit()
  }

  if (e.key === '9' ) {
    handleLetterSplit()
  }

  if (e.key === '\\') {
    handleTimeSplit()
  }

  if (e.key === 'ArrowDown' && isCtrl ) {
    handleCopyStartToEnd()
  }

  if (e.key === 'ArrowUp' && isCtrl ) {
    handleCopyEndToStart()
  }

  if (e.key === '/' ) {
    toggleAdvancedTools()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleshortcuts)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleshortcuts)
})

// 组件卸载时，移除可能残留的拾取定位监听器
onBeforeUnmount(() => {
  cancelPickMode()
})
</script>

<style scoped>
.advanced-tools {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: #1b1b1b;
  border: 1px solid #333;
  border-radius: 10px;
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
  resize: vertical;
  height: 100px;
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
  gap: 10px;
}

.command-log {
  height: 250px;
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
