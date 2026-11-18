<template>
  <div class="editor-panel no-select">
    <!-- 无选中状态 -->
    <div v-show="hasSelection === false" class="empty-state">
      <p>未选择弹幕</p>
      <p class="hint">请在时间轴中选择一个或多个弹幕进行编辑</p>
    </div>

    <!-- 有选中状态 -->
    <div v-show="hasSelection" class="panel-selected">
      <div class="panel-header">
        <h2>已选择：{{ store.selectedCount }} 条弹幕</h2>
      </div>

      <div class="panel-content have-scrollbar">
        <!-- 基础信息 -->
        <section class="editor-section">
          <h3>基础信息</h3>
          <div class="form-group">
            <label>所属层 (Layer)</label>
            <input
              type="text"
              v-model="layer"
              @focus="onFieldFocus"
              @change="commitField('layer', layer)"
              placeholder="提示: +1 或 -1"
            />
          </div>

          <div class="form-group">
            <label>开始时间 (ms)</label>
            <div class="time-input">
              <input
                v-model="startTime"
                @focus="onFieldFocus"
                @change="commitField('startTime', startTime)"
                placeholder="支持 ±*/ 操作"
              />
              <span class="time-display">{{ startTimePreview }}</span>
            </div>
          </div>
        </section>

        <!-- 内容编辑 -->
        <section class="editor-section">
          <h3>内容</h3>

          <div class="form-group">
            <label>文本内容 (0-255个字符，换行占2个)</label>
            <textarea
              v-model="text"
              @focus="onFieldFocus"
              @change="onTextChange"
              @keydown="onTextInputKeydown"
              :placeholder="isTextMixed ? '内容不一致' : '输入弹幕文本内容'"
              class="text-input  have-scrollbar"
            ></textarea>
            <div
              class="char-counter"
              :class="{ 'char-counter-exceeded': !isTextMixed && !isTextLengthValid(text) }"
            >
              已占用: {{ isTextMixed ? '--' : calculateTextLength(text) }}/255
            </div>
          </div>

          <div class="form-group">
            <label>字体 (Font)</label>
            <div ref="fontPickerRef" class="font-picker">
              <button
                type="button"
                class="font-trigger"
                :class="{ 'font-trigger-open': isFontDropdownOpen }"
                :aria-expanded="isFontDropdownOpen"
                @click="toggleFontDropdown"
              >
                <span class="font-trigger-label">{{ isFontMixed ? '字体不一致' : selectedFontLabel }}</span>
                <span class="font-trigger-arrow">
                  <svg v-if="!isFontDropdownOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 272.59 177.2"style="width: 10px; height: 10px;">
                    <path
                    style="fill: #fff; stroke: #D4D4D4; stroke-miterlimit: 10; stroke-width: 31px;"
                    d="M134.46,133.04L31.8,17.79s-9.12-2.85-13.67,1.44c-4.55,4.29-1.81,14.49-1.81,14.49l104.44,119.59s8.6,8.39,13.13,8.39c4.53,0,12.14-9.14,12.14-9.14l110.56-122.42s2.31-9.77-3.09-13.5c-4.85-3.34-13.88,1.7-13.88,1.7l-105.17,114.7Z"/>
                  </svg>
                  <svg v-if="isFontDropdownOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 272.59 177.2"style="width: 10px; height: 10px;">
                    <path
                    style="fill: #fff; stroke: #D4D4D4; stroke-miterlimit: 10; stroke-width: 31px;"
                    d="M134.46,44.15L31.8,159.41s-9.12,2.85-13.67-1.44c-4.55-4.29-1.81-14.49-1.81-14.49L120.76,23.89s8.6-8.39,13.13-8.39c4.53,0,12.14,9.14,12.14,9.14l110.56,122.42s2.31,9.77-3.09,13.5c-4.85,3.34-13.88-1.7-13.88-1.7l-105.17-114.7Z"/>
                  </svg>
                </span>
              </button>

              <div v-show="isFontDropdownOpen" class="font-dropdown">
                <input
                  v-model="fontSearchQuery"
                  type="text"
                  class="font-search-input"
                  placeholder="搜索字体..."
                  aria-label="搜索字体"
                  @click.stop
                />

                <div v-if="filteredBuiltInFontOptions.length > 0" class="font-section">
                  <div class="font-section-title">常用字体</div>
                  <button
                    v-for="option in filteredBuiltInFontOptions"
                    :key="option.value"
                    type="button"
                    class="font-option"
                    :class="{ 'font-option-selected': isSelectedFont(option.value) }"
                    @click="selectFontOption(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>

                <div class="font-section">
                  <div class="font-section-title">本地字体</div>
                  <div v-if="isLoadingLocalFonts" class="font-status">正在读取本地字体...</div>
                  <div v-else-if="!localFontsSupported" class="font-status">当前环境不支持本地字体访问</div>
                  <div v-else-if="localFontsPermissionDenied" class="font-status">未授予本地字体访问权限</div>
                  <div v-else-if="filteredLocalFontOptions.length === 0" class="font-status">
                    {{ fontSearchQuery.trim() ? '未找到匹配的本地字体' : '未发现可用的本地字体' }}
                  </div>
                  <div
                    v-else
                    ref="localFontListRef"
                    class="font-virtual-list have-scrollbar"
                    @scroll="onLocalFontListScroll"
                  >
                    <div
                      class="font-virtual-spacer"
                      :style="{ height: `${localFontListTotalHeight}px` }"
                    >
                      <div
                        class="font-virtual-content"
                        :style="{ transform: `translateY(${localFontListOffset}px)` }"
                      >
                        <button
                          v-for="option in visibleLocalFontOptions"
                          :key="option.value"
                          type="button"
                          class="font-option"
                          :class="{ 'font-option-selected': isSelectedFont(option.value) }"
                          @click="selectFontOption(option.value)"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>字体大小 (10-127)</label>
            <input
              type="text"
              v-model="size"
              @focus="onFieldFocus"
              @change="commitField('content.size', size)"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>颜色 (Color)</label>
            <div class="color-input-group">
              <input
                type="color"
                v-model.lazy="colorPicker"
                @focus="onFieldFocus"
                @change="commitField('content.color', colorPicker)"
                class="color-picker"
              />
              <input
                type="text"
                v-model="color"
                @focus="onFieldFocus"
                @change="onColorTextChange"
                placeholder="#FFFFFF"
                class="color-text"
              />
            </div>
          </div>

          <div class="form-group checkbox">
            <label>
              <input
                type="checkbox"
                :checked="stroke === true"
                :indeterminate="stroke === null"
                @change="onStrokeChange"
              />
              描边 (Stroke)
            </label>
          </div>
        </section>

        <!-- 位置与变换 -->
        <section class="editor-section">
          <h3>位置与变换</h3>

          <div class="subsection">
            <h4>起点 (Start)</h4>
            <div class="form-row">
              <div class="form-group" style="width: 145px;">
                <label>X</label>
                <input
                  type="text"
                  v-model="startX"
                  @focus="onFieldFocus"
                  @change="commitField('transform.start.x', startX)"
                  placeholder="±*/ 支持"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y</label>
                <input
                  type="text"
                  v-model="startY"
                  @focus="onFieldFocus"
                  @change="commitField('transform.start.y', startY)"
                  placeholder="±*/ 支持"
                />
              </div>
            </div>
          </div>

          <div class="subsection">
            <h4>终点 (End)</h4>
            <div class="form-row">
              <div class="form-group" style="width: 145px;">
                <label>X</label>
                <input
                  type="text"
                  v-model="endX"
                  @focus="onFieldFocus"
                  @change="commitField('transform.end.x', endX)"
                  placeholder="±*/ 支持"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y</label>
                <input
                  type="text"
                  v-model="endY"
                  @focus="onFieldFocus"
                  @change="commitField('transform.end.y', endY)"
                  placeholder="±*/ 支持"
                />
              </div>
            </div>
          </div>

          <div class="subsection">
            <h4>旋转</h4>
            <div class="form-row">
              <div class="form-group" style="width: 145px;">
                <label>Z轴旋转 (0-360°)</label>
                <input
                  type="text"
                  v-model="zRotate"
                  @focus="onFieldFocus"
                  @change="commitField('transform.zRotate', zRotate)"
                  placeholder="±*/ 支持"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y轴旋转 (0-360°)</label>
                <input
                  type="text"
                  v-model="yRotate"
                  @focus="onFieldFocus"
                  @change="commitField('transform.yRotate', yRotate)"
                  placeholder="±*/ 支持"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 透明度 -->
        <section class="editor-section">
          <h3>🌫 透明度 (0-1)</h3>
          <div class="form-row">
            <div class="form-group" style="width: 145px;">
              <label>初始 (From)</label>
              <input
                type="text"
                v-model="opacityFrom"
                @focus="onFieldFocus"
                @change="onOpacityFieldChange('opacity.from', opacityFrom)"
                placeholder="支持 ±*/ 操作"
              />
              <input
                type="range"
                :value="opacityFromSlider"
                @focus="onFieldFocus"
                @input="onOpacitySliderInput('opacity.from', $event)"
                @change="onOpacitySliderChange('opacity.from', $event)"
                min="0"
                max="1"
                step="0.01"
                class="slider"
              />
            </div>
            <div class="form-group" style="width: 145px;">
              <label>结束 (To)</label>
              <input
                type="text"
                v-model="opacityTo"
                @focus="onFieldFocus"
                @change="onOpacityFieldChange('opacity.to', opacityTo)"
                placeholder="支持 ±*/ 操作"
              />
              <input
                type="range"
                :value="opacityToSlider"
                @focus="onFieldFocus"
                @input="onOpacitySliderInput('opacity.to', $event)"
                @change="onOpacitySliderChange('opacity.to', $event)"
                min="0"
                max="1"
                step="0.01"
                class="slider"
              />
            </div>
          </div>
        </section>

        <!-- 动画 -->
        <section class="editor-section">
          <h3>动画</h3>

          <div class="form-group">
            <label>生存时间 (Duration, ms)</label>
            <input
              type="text"
              v-model="duration"
              @focus="onFieldFocus"
              @change="commitField('animation.duration', duration)"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>运动时间 (Move Duration, ms)</label>
            <input
              type="text"
              v-model="moveDuration"
              @focus="onFieldFocus"
              @change="commitField('animation.moveDuration', moveDuration)"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>延迟 (Delay, ms)</label>
            <input
              type="text"
              v-model="delay"
              @focus="onFieldFocus"
              @change="commitField('animation.delay', delay)"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>运动方式 (Easing)</label>
            <select v-model="easing" @focus="onFieldFocus" @change="onEasingChange">
              <option value="" disabled>{{ isEasingMixed ? '不一致' : '请选择运动方式' }}</option>
              <option value="speedup">加速 (Speedup)</option>
              <option value="speeddown">减速 (Speeddown)</option>
            </select>
          </div>
        </section>

        <div class="panel-actions">
          <button type="button" @click="handleClearSelection" class="btn-secondary">取消选择</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import {
  parseInput,
  applyOperation
} from '@/utils/parser'
import { formatTime } from '@/utils/time'

type FontOption = {
  value: string
  label: string
}

type LocalFontData = {
  family: string
}

type QueryLocalFontsFn = () => Promise<LocalFontData[]>

const LOCAL_FONT_ITEM_HEIGHT = 32
const LOCAL_FONT_LIST_HEIGHT = 224
const LOCAL_FONT_OVERSCAN = 6

const store = useEditorStore()
const notice = useNoticeStore()

const builtInFontOptions: FontOption[] = [
  { value: 'SimHei', label: '黑体' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'SimSun', label: '宋体' },
  { value: 'NSimSun', label: '新宋体' },
  { value: 'FangSong', label: '仿宋' }
]

// 本地编辑缓存，避免频繁触发响应式更新
const editCache = ref<Record<string, any>>({})
const fontPickerRef = ref<HTMLElement | null>(null)
const localFontListRef = ref<HTMLElement | null>(null)
const localFontOptions = ref<FontOption[]>([])
const localFontKeySet = ref<Set<string>>(new Set())
const localFontsLoaded = ref(false)
const localFontsSupported = ref(true)
const localFontsPermissionDenied = ref(false)
const isLoadingLocalFonts = ref(false)
const isFontDropdownOpen = ref(false)
const localFontListScrollTop = ref(0)
const fontSearchQuery = ref('')

// 计算属性：是否有选中的弹幕
const hasSelection = computed(() => store.selectedIds.length > 0)
const selectionKey = computed(() => store.selectedIds.join('\0'))
const activeEditSelectionKey = ref<string | null>(null)

// 计算属性：获取选中的弹幕
const selectedDanmakus = computed(() => store.getSelectedDanmakus)

function toFullHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  const shortMatch = trimmed.match(/^#([0-9a-fA-F]{3})$/)
  if (shortMatch) {
    const [r, g, b] = shortMatch[1]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

type NumericAgg = {
  hasValue: boolean
  first: number | null
  mixed: boolean
}

function createNumericAgg(): NumericAgg {
  return { hasValue: false, first: null, mixed: false }
}

function pushNumericAgg(agg: NumericAgg, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return
  }
  if (!agg.hasValue) {
    agg.hasValue = true
    agg.first = value
  } else if (!agg.mixed && value !== agg.first) {
    agg.mixed = true
  }
}

function formatAggDisplay(agg: NumericAgg): string {
  if (!agg.hasValue || agg.first === null) return ''
  return agg.mixed ? '--' : String(agg.first)
}

// 单次扫描选中弹幕，避免在多选场景下重复遍历与数组分配
const fieldSummary = computed(() => {
  const list = selectedDanmakus.value
  const layerAgg = createNumericAgg()
  const startTimeAgg = createNumericAgg()
  const sizeAgg = createNumericAgg()
  const startXAgg = createNumericAgg()
  const startYAgg = createNumericAgg()
  const endXAgg = createNumericAgg()
  const endYAgg = createNumericAgg()
  const zRotateAgg = createNumericAgg()
  const yRotateAgg = createNumericAgg()
  const opacityFromAgg = createNumericAgg()
  const opacityToAgg = createNumericAgg()
  const durationAgg = createNumericAgg()
  const moveDurationAgg = createNumericAgg()
  const delayAgg = createNumericAgg()

  let hasItems = false
  let firstText = ''
  let textMixed = false
  let firstFont = ''
  let fontMixed = false
  let firstColor = ''
  let colorMixed = false
  let firstStroke = false
  let strokeMixed = false
  let firstEasing = ''
  let easingMixed = false

  for (let i = 0; i < list.length; i++) {
    const d = list[i]
    pushNumericAgg(layerAgg, d.layer)
    pushNumericAgg(startTimeAgg, d.startTime)
    pushNumericAgg(sizeAgg, d.content?.size)
    pushNumericAgg(startXAgg, d.transform?.start?.x)
    pushNumericAgg(startYAgg, d.transform?.start?.y)
    pushNumericAgg(endXAgg, d.transform?.end?.x)
    pushNumericAgg(endYAgg, d.transform?.end?.y)
    pushNumericAgg(zRotateAgg, d.transform?.zRotate)
    pushNumericAgg(yRotateAgg, d.transform?.yRotate)
    pushNumericAgg(opacityFromAgg, d.opacity?.from)
    pushNumericAgg(opacityToAgg, d.opacity?.to)
    pushNumericAgg(durationAgg, d.animation?.duration)
    pushNumericAgg(moveDurationAgg, d.animation?.moveDuration)
    pushNumericAgg(delayAgg, d.animation?.delay)

    const t = d.content?.text ?? ''
    const f = d.content?.font ?? ''
    const c = d.content?.color ?? ''
    const s = d.content?.stroke === true
    const e = d.animation?.easing ?? ''

    if (!hasItems) {
      hasItems = true
      firstText = t
      firstFont = f
      firstColor = c
      firstStroke = s
      firstEasing = e
    } else {
      if (!textMixed && t !== firstText) textMixed = true
      if (!fontMixed && f !== firstFont) fontMixed = true
      if (!colorMixed && c !== firstColor) colorMixed = true
      if (!strokeMixed && s !== firstStroke) strokeMixed = true
      if (!easingMixed && e !== firstEasing) easingMixed = true
    }
  }

  return {
    hasItems,
    layer: formatAggDisplay(layerAgg),
    startTime: formatAggDisplay(startTimeAgg),
    startTimeFirst: startTimeAgg.first,
    size: formatAggDisplay(sizeAgg),
    startX: formatAggDisplay(startXAgg),
    startY: formatAggDisplay(startYAgg),
    endX: formatAggDisplay(endXAgg),
    endY: formatAggDisplay(endYAgg),
    zRotate: formatAggDisplay(zRotateAgg),
    yRotate: formatAggDisplay(yRotateAgg),
    opacityFrom: formatAggDisplay(opacityFromAgg),
    opacityFromFirst: opacityFromAgg.first,
    opacityTo: formatAggDisplay(opacityToAgg),
    opacityToFirst: opacityToAgg.first,
    duration: formatAggDisplay(durationAgg),
    moveDuration: formatAggDisplay(moveDurationAgg),
    delay: formatAggDisplay(delayAgg),
    text: hasItems ? (textMixed ? '' : firstText) : '',
    textMixed,
    font: hasItems ? (fontMixed ? '' : (firstFont || 'Microsoft YaHei')) : 'Microsoft YaHei',
    fontMixed,
    color: hasItems ? (colorMixed ? '--' : firstColor) : '',
    colorFirst: firstColor,
    colorMixed,
    stroke: hasItems ? (strokeMixed ? null : firstStroke) : false,
    easing: hasItems ? (easingMixed ? '' : (firstEasing || 'speedup')) : 'speedup',
    easingMixed
  }
})

// 基础信息
const layer = computed<string>({
  get: () => editCache.value['layer'] !== undefined ? String(editCache.value['layer']) : fieldSummary.value.layer,
  set: (v) => {
    editCache.value['layer'] = v
  }
})

const startTime = computed<string>({
  get: () => editCache.value['startTime'] !== undefined ? String(editCache.value['startTime']) : fieldSummary.value.startTime,
  set: (v) => {
    editCache.value['startTime'] = v
  }
})

// 内容编辑
const text = computed<string>({
  get: () => editCache.value['content.text'] !== undefined ? String(editCache.value['content.text']) : fieldSummary.value.text,
  set: (v) => {
    editCache.value['content.text'] = v
  }
})

const isTextMixed = computed(() => editCache.value['content.text'] === undefined && fieldSummary.value.textMixed)

const font = computed<string>({
  get: () => editCache.value['content.font'] !== undefined ? String(editCache.value['content.font']) : fieldSummary.value.font,
  set: (v) => {
    editCache.value['content.font'] = v
  }
})

const isFontMixed = computed(() => editCache.value['content.font'] === undefined && fieldSummary.value.fontMixed)

const size = computed<string>({
  get: () => editCache.value['content.size'] !== undefined ? String(editCache.value['content.size']) : fieldSummary.value.size,
  set: (v) => {
    editCache.value['content.size'] = v
  }
})

const color = computed<string>({
  get: () => editCache.value['content.color'] !== undefined ? String(editCache.value['content.color']) : fieldSummary.value.color,
  set: (v) => {
    editCache.value['content.color'] = v
  }
})

const colorPicker = computed<string>({
  get: () => {
    const cacheValue = editCache.value['content.color']
    if (typeof cacheValue === 'string') {
      const hex = toFullHexColor(cacheValue)
      if (hex) return hex
    }

    if (!fieldSummary.value.hasItems) return '#ffffff'
    const firstHex = toFullHexColor(fieldSummary.value.colorFirst)
    return firstHex ?? '#ffffff'
  },
  set: (v) => {
    editCache.value['content.color'] = v
  }
})

const stroke = computed<boolean | null>({
  get: () => {
    if (editCache.value['content.stroke'] !== undefined) {
      return editCache.value['content.stroke']
    }
    return fieldSummary.value.stroke
  },
  set: (v) => {
    editCache.value['content.stroke'] = v
  }
})

// 位置与变换
const startX = computed<string>({
  get: () => editCache.value['transform.start.x'] !== undefined ? String(editCache.value['transform.start.x']) : fieldSummary.value.startX,
  set: (v) => {
    editCache.value['transform.start.x'] = v
  }
})

const startY = computed<string>({
  get: () => editCache.value['transform.start.y'] !== undefined ? String(editCache.value['transform.start.y']) : fieldSummary.value.startY,
  set: (v) => {
    editCache.value['transform.start.y'] = v
  }
})

const endX = computed<string>({
  get: () => editCache.value['transform.end.x'] !== undefined ? String(editCache.value['transform.end.x']) : fieldSummary.value.endX,
  set: (v) => {
    editCache.value['transform.end.x'] = v
  }
})

const endY = computed<string>({
  get: () => editCache.value['transform.end.y'] !== undefined ? String(editCache.value['transform.end.y']) : fieldSummary.value.endY,
  set: (v) => {
    editCache.value['transform.end.y'] = v
  }
})

const zRotate = computed<string>({
  get: () => editCache.value['transform.zRotate'] !== undefined ? String(editCache.value['transform.zRotate']) : fieldSummary.value.zRotate,
  set: (v) => {
    editCache.value['transform.zRotate'] = v
  }
})

const yRotate = computed<string>({
  get: () => editCache.value['transform.yRotate'] !== undefined ? String(editCache.value['transform.yRotate']) : fieldSummary.value.yRotate,
  set: (v) => {
    editCache.value['transform.yRotate'] = v
  }
})

// 透明度
const opacityFrom = computed<string>({
  get: () => editCache.value['opacity.from'] !== undefined ? String(editCache.value['opacity.from']) : fieldSummary.value.opacityFrom,
  set: (v) => {
    editCache.value['opacity.from'] = v
  }
})

const opacityTo = computed<string>({
  get: () => editCache.value['opacity.to'] !== undefined ? String(editCache.value['opacity.to']) : fieldSummary.value.opacityTo,
  set: (v) => {
    editCache.value['opacity.to'] = v
  }
})

function resolveSliderValue(textVal: string, fallback: number | null): number {
  const trimmed = textVal.trim()
  if (!trimmed || trimmed === '--') {
    return fallback !== null ? Math.max(0, Math.min(1, fallback)) : 1
  }
  const num = Number(trimmed)
  if (Number.isFinite(num)) {
    return Math.max(0, Math.min(1, num))
  }
  return fallback !== null ? Math.max(0, Math.min(1, fallback)) : 1
}

const opacityFromSlider = computed<number>(() =>
  resolveSliderValue(opacityFrom.value, fieldSummary.value.opacityFromFirst)
)

const opacityToSlider = computed<number>(() =>
  resolveSliderValue(opacityTo.value, fieldSummary.value.opacityToFirst)
)

// 动画
const duration = computed<string>({
  get: () => editCache.value['animation.duration'] !== undefined ? String(editCache.value['animation.duration']) : fieldSummary.value.duration,
  set: (v) => {
    editCache.value['animation.duration'] = v
  }
})

const moveDuration = computed<string>({
  get: () => editCache.value['animation.moveDuration'] !== undefined ? String(editCache.value['animation.moveDuration']) : fieldSummary.value.moveDuration,
  set: (v) => {
    editCache.value['animation.moveDuration'] = v
  }
})

const delay = computed<string>({
  get: () => editCache.value['animation.delay'] !== undefined ? String(editCache.value['animation.delay']) : fieldSummary.value.delay,
  set: (v) => {
    editCache.value['animation.delay'] = v
  }
})

const easing = computed<string>({
  get: () => editCache.value['animation.easing'] !== undefined ? String(editCache.value['animation.easing']) : fieldSummary.value.easing,
  set: (v) => {
    editCache.value['animation.easing'] = v
  }
})

const isEasingMixed = computed(() => editCache.value['animation.easing'] === undefined && fieldSummary.value.easingMixed)

const builtInFontKeys = new Set(builtInFontOptions.map(option => normalizeFontKey(option.value)))

const normalizedFontSearch = computed(() => normalizeFontKey(fontSearchQuery.value))

const filteredBuiltInFontOptions = computed(() => {
  const query = normalizedFontSearch.value
  if (!query) return builtInFontOptions
  return builtInFontOptions.filter(
    option => normalizeFontKey(option.label).includes(query) || normalizeFontKey(option.value).includes(query)
  )
})

const filteredLocalFontOptions = computed(() => {
  const query = normalizedFontSearch.value
  if (!query) return localFontOptions.value
  return localFontOptions.value.filter(option => normalizeFontKey(option.label).includes(query))
})

const currentFontOption = computed<FontOption | null>(() => {
  const currentFontValue = font.value.trim()
  if (!currentFontValue) {
    return null
  }

  const currentFontKey = normalizeFontKey(currentFontValue)
  if (builtInFontKeys.has(currentFontKey) || localFontKeySet.value.has(currentFontKey)) {
    return null
  }

  return {
    value: currentFontValue,
    label: `${currentFontValue} (当前)`
  }
})

const selectedFontLabel = computed(() => {
  const currentFontValue = font.value.trim()
  if (!currentFontValue) {
    return '请选择字体'
  }

  const builtInMatch = builtInFontOptions.find(option => option.value === currentFontValue)
  if (builtInMatch) {
    return builtInMatch.label
  }

  return currentFontOption.value?.label || currentFontValue
})

const localFontListStartIndex = computed(() => {
  const startIndex = Math.floor(localFontListScrollTop.value / LOCAL_FONT_ITEM_HEIGHT) - LOCAL_FONT_OVERSCAN
  return Math.max(0, startIndex)
})

const localFontListEndIndex = computed(() => {
  const visibleCount = Math.ceil(LOCAL_FONT_LIST_HEIGHT / LOCAL_FONT_ITEM_HEIGHT) + LOCAL_FONT_OVERSCAN * 2
  return Math.min(filteredLocalFontOptions.value.length, localFontListStartIndex.value + visibleCount)
})

const localFontListOffset = computed(() => localFontListStartIndex.value * LOCAL_FONT_ITEM_HEIGHT)
const localFontListTotalHeight = computed(() => filteredLocalFontOptions.value.length * LOCAL_FONT_ITEM_HEIGHT)

const visibleLocalFontOptions = computed(() => {
  return filteredLocalFontOptions.value.slice(localFontListStartIndex.value, localFontListEndIndex.value)
})

let skipNextTextChange = false

function normalizeFontKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function isSelectedFont(value: string): boolean {
  return normalizeFontKey(font.value) === normalizeFontKey(value)
}

function buildLocalFontOptions(fonts: LocalFontData[]): { options: FontOption[]; keys: Set<string> } {
  const uniqueFamilies = new Map<string, string>()

  for (const fontData of fonts) {
    const family = fontData.family?.trim()
    if (!family) {
      continue
    }

    const familyKey = normalizeFontKey(family)
    if (builtInFontKeys.has(familyKey) || uniqueFamilies.has(familyKey)) {
      continue
    }

    uniqueFamilies.set(familyKey, family)
  }

  const sortedFamilies = Array.from(uniqueFamilies.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  return {
    options: sortedFamilies.map(family => ({
      value: family,
      label: family
    })),
    keys: new Set(uniqueFamilies.keys())
  }
}

function getQueryLocalFonts(): QueryLocalFontsFn | null {
  const globalScope = globalThis as typeof globalThis & { queryLocalFonts?: QueryLocalFontsFn }
  return typeof globalScope.queryLocalFonts === 'function'
    ? globalScope.queryLocalFonts.bind(globalScope)
    : null
}

async function loadLocalFonts() {
  if (
    localFontsLoaded.value ||
    !localFontsSupported.value ||
    localFontsPermissionDenied.value ||
    isLoadingLocalFonts.value
  ) {
    return
  }

  const queryLocalFonts = getQueryLocalFonts()

  if (!queryLocalFonts) {
    localFontsSupported.value = false
    return
  }

  isLoadingLocalFonts.value = true

  try {
    const fonts = await queryLocalFonts()
    const { options, keys } = buildLocalFontOptions(fonts)
    localFontOptions.value = options
    localFontKeySet.value = keys
    localFontsLoaded.value = true
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        localFontsPermissionDenied.value = true
        return
      }

      if (error.name === 'SecurityError') {
        localFontsSupported.value = false
        return
      }
    }

    notice.alert('读取本地字体失败:', 'error', '功能不可用', error)
  } finally {
    isLoadingLocalFonts.value = false
  }
}

// 字体选择逻辑
async function openFontDropdown() {
  if (isFontDropdownOpen.value) {
    return
  }

  isFontDropdownOpen.value = true
  localFontListScrollTop.value = 0

  await loadLocalFonts()
  await nextTick()
  scrollSelectedFontIntoView()
}

function closeFontDropdown() {
  isFontDropdownOpen.value = false
  fontSearchQuery.value = ''
}

function toggleFontDropdown() {
  if (isFontDropdownOpen.value) {
    closeFontDropdown()
    return
  }

  void openFontDropdown()
}

function selectFontOption(value: string) {
  onFieldFocus()
  font.value = value
  void commitField('content.font', value)
  closeFontDropdown()
}

function onLocalFontListScroll(event: Event) {
  localFontListScrollTop.value = (event.target as HTMLElement).scrollTop
}

// 将选中字体滚动到可视区域
function scrollSelectedFontIntoView() {
  const currentFontKey = normalizeFontKey(font.value)
  const targetIndex = filteredLocalFontOptions.value.findIndex(option => normalizeFontKey(option.value) === currentFontKey)
  const listElement = localFontListRef.value

  if (targetIndex < 0 || !listElement) {
    return
  }

  const targetTop = targetIndex * LOCAL_FONT_ITEM_HEIGHT
  const targetBottom = targetTop + LOCAL_FONT_ITEM_HEIGHT
  const viewportTop = listElement.scrollTop
  const viewportBottom = viewportTop + LOCAL_FONT_LIST_HEIGHT

  if (targetTop < viewportTop) {
    listElement.scrollTop = targetTop
  } else if (targetBottom > viewportBottom) {
    listElement.scrollTop = targetBottom - LOCAL_FONT_LIST_HEIGHT
  }

  localFontListScrollTop.value = listElement.scrollTop
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!isFontDropdownOpen.value) {
    return
  }

  const targetNode = event.target as Node | null
  if (targetNode && fontPickerRef.value?.contains(targetNode)) {
    return
  }

  closeFontDropdown()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFontDropdownOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    closeFontDropdown()
  }
}

function onFieldFocus() {
  activeEditSelectionKey.value = selectionKey.value
}

async function applyFieldUpdate(path: string, inputValue: string | number | boolean) {
  if (!hasSelection.value) {
    delete editCache.value[path]
    return
  }

  const result = await store.applyFieldUpdate(path, inputValue)
  if (!result.ok) {
    notice.alert(result.message, 'warn')
    return
  }

  result.warnings.forEach((warning) => notice.alert(warning, 'warn'))
  delete editCache.value[path]
}

async function commitField(path: string, inputValue: string | number | boolean) {
  const expectedKey = activeEditSelectionKey.value
  if (!hasSelection.value || (expectedKey !== null && expectedKey !== selectionKey.value)) {
    delete editCache.value[path]
    return
  }
  await applyFieldUpdate(path, inputValue)
}

function onColorTextChange() {
  const trimmed = color.value.trim()
  if (!trimmed || trimmed === '--' || trimmed === '—') {
    delete editCache.value['content.color']
    return
  }
  void commitField('content.color', trimmed)
}

function onEasingChange() {
  if (!easing.value) {
    delete editCache.value['animation.easing']
    return
  }
  void commitField('animation.easing', easing.value)
}

function onTextChange() {
  if (skipNextTextChange) {
    skipNextTextChange = false
    return
  }

  void commitField('content.text', text.value)
}

function onTextInputKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) {
    return
  }
  if (e.key !== 'Enter' || e.shiftKey) {
    return
  }

  e.preventDefault()
  const textarea = e.target as HTMLTextAreaElement
  if (editCache.value['content.text'] === undefined && isTextMixed.value) {
    textarea.blur()
    return
  }

  skipNextTextChange = true
  void commitField('content.text', text.value)
  textarea.blur()
  skipNextTextChange = false
}

function onOpacityFieldChange(path: 'opacity.from' | 'opacity.to', value: string | number) {
  const textValue = String(value).trim()
  if (!textValue || textValue === '--' || textValue === '—') {
    delete editCache.value[path]
    return
  }

  void commitField(path, textValue)
}

function onOpacitySliderInput(path: 'opacity.from' | 'opacity.to', event: Event) {
  onFieldFocus()
  editCache.value[path] = (event.target as HTMLInputElement).value
}

function onOpacitySliderChange(path: 'opacity.from' | 'opacity.to', event: Event) {
  const value = (event.target as HTMLInputElement).value
  editCache.value[path] = value
  void commitField(path, value)
}

function onStrokeChange(event: Event) {
  onFieldFocus()
  const checked = (event.target as HTMLInputElement).checked
  editCache.value['content.stroke'] = checked
  void commitField('content.stroke', checked)
}

function formatSafeTime(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--.---'
  const rounded = Math.round(ms)
  return rounded < 0 ? `-${formatTime(Math.abs(rounded))}` : formatTime(rounded)
}

const startTimePreview = computed<string>(() => {
  const base = fieldSummary.value.startTimeFirst ?? 0
  const raw = startTime.value.trim()
  if (!raw || raw === '--' || raw === '—') {
    return formatSafeTime(base)
  }
  if (raw.startsWith('$')) {
    return '表达式'
  }
  const parseResult = parseInput(raw, false)
  if (parseResult.error) {
    return formatSafeTime(base)
  }
  if (parseResult.mode === 'random') {
    return '随机范围'
  }
  return formatSafeTime(applyOperation(base, parseResult))
})

/**
 * 计算文本占用的字符数（换行符占用2个字符）
 */
function calculateTextLength(str: string): number {
  let length = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') {
      length += 2
    } else {
      length += 1
    }
  }
  return length
}

/**
 * 检查文本长度是否有效（0-255）
 */
function isTextLengthValid(str: string): boolean {
  return calculateTextLength(str) <= 255
}

// 清除选择
function handleClearSelection() {
  editCache.value = {}
  activeEditSelectionKey.value = null
  closeFontDropdown()
  store.clearSelection()
}

// 监听选择变化，清除编辑缓存
watch(selectionKey, () => {
  editCache.value = {}
  activeEditSelectionKey.value = null
  closeFontDropdown()
})

watch(fontSearchQuery, () => {
  localFontListScrollTop.value = 0
  if (localFontListRef.value) {
    localFontListRef.value.scrollTop = 0
  }
})

watch(() => [isFontDropdownOpen.value, filteredLocalFontOptions.value.length, font.value], async ([isOpen]) => {
  if (!isOpen) {
    return
  }

  await nextTick()
  if (isFontDropdownOpen.value) {
    scrollSelectedFontIntoView()
  }
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown, { capture: true })
})

// 组件卸载时清理
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown, { capture: true })
})
</script>

<style scoped lang="css">
.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #1e1e1e;
  color: #e0e0e0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
}

.empty-state p {
  margin: 10px 0;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
  color: #666;
}

.panel-selected {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid #333;
  background-color: #252526;
  position: sticky;
  top: 0;
  z-index: 10;
}

.panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.editor-section {
  margin-bottom: 14px;
  padding-bottom: 7px;
  border-bottom: 1px solid #333;
}

.editor-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #4ec9b0;
}

.subsection {
  margin-bottom: 12px;
}

.subsection h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
}

.form-group {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
}

.form-group.checkbox {
  flex-direction: row;
  align-items: center;
}

.form-group.checkbox input[type='checkbox'] {
  margin-right: 8px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.form-group label {
  font-size: 13px;
  margin-bottom: 6px;
  font-weight: 500;
  color: #d4d4d4;
}

.form-group input,
.form-group select {
  padding: 8px 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background-color: #3c3c3c;
  color: #e0e0e0;
  font-size: 13px;
  transition: border-color 0.2s;
}

.form-group textarea {
  padding: 8px 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background-color: #3c3c3c;
  color: #e0e0e0;
  font-size: 13px;
  transition: border-color 0.2s;
  resize: vertical;
  min-height: 80px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #4ec9b0;
  background-color: #444;
}

.font-picker {
  position: relative;
}

.font-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background-color: #3c3c3c;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.font-trigger:hover,
.font-trigger-open {
  border-color: #4ec9b0;
  background-color: #444;
}

.font-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.font-trigger-arrow {
  flex-shrink: 0;
  font-size: 12px;
}

.font-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  padding: 8px;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  background-color: #252526;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.font-search-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 6px 8px;
}

.font-section + .font-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #333;
}

.font-section-title {
  margin-bottom: 6px;
  font-size: 12px;
  color: #888;
}

.font-option {
  height: 32px;
  width: 100%;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #e0e0e0;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.font-option:hover {
  background-color: #2d2d30;
}

.font-option-selected {
  background-color: rgba(78, 201, 176, 0.18);
  color: #7de6d2;
}

.font-status {
  padding: 10px;
  color: #888;
  font-size: 12px;
}

.font-virtual-list {
  max-height: 224px;
  overflow-y: auto;
}

.font-virtual-spacer {
  position: relative;
}

.font-virtual-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.form-group input[type='number'],
.form-group input[type='text'] {
  font-family: 'Consolas', 'Courier New', monospace;
}

.time-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.time-input input {
  flex: 1;
}

.time-display {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  min-width: 60px;
  text-align: right;
}

.char-counter {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
  text-align: right;
}

.char-counter-exceeded {
  color: #ff6b6b;
  font-weight: 600;
}

.color-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  width: 50px;
  height: 36px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  cursor: pointer;
}

.color-text {
  flex: 1;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.slider {
  height: 6px;
  margin: 4px 0 0;
  border-radius: 3px;
  background: #3e3e42;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4ec9b0;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(78, 201, 176, 0.5);
}

.slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4ec9b0;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 4px rgba(78, 201, 176, 0.5);
}

.panel-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid #3e3e42;
  background-color: #3c3c3c;
  color: #e0e0e0;
  border-radius: 3px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-secondary:hover {
  background-color: #454545;
}

.btn-secondary:active {
  background-color: #2d2d30;
}
</style>
