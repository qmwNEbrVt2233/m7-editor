<template>
  <div class="editor-panel no-select">
    <!-- 无选中状态 -->
    <div v-show="hasSelection === false" class="empty-state">
      <p>未选择弹幕</p>
      <p class="hint">请在时间轴中选择一个或多个弹幕进行编辑</p>
    </div>

    <!-- 有选中状态 -->
    <template v-show="hasSelection === true" style="display: contents;">
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
              @change="updateField('layer', layer)"
              placeholder="提示: +1 或 -1"
            />
          </div>

          <div class="form-group">
            <label>开始时间 (ms)</label>
            <div class="time-input">
              <input
                v-model="startTime"
                @change="updateField('startTime', startTime)"
                placeholder="支持 ±*/ 操作"
              />
              <span class="time-display">{{ formatTime(parseTimeValue(startTime)) }}</span>
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
              @change="onTextChange"
              @keydown="onTextInputKeydown"
              placeholder="输入弹幕文本内容"
              class="text-input  have-scrollbar"
            ></textarea>
            <div 
              class="char-counter"
              :class="{ 'char-counter-exceeded': !isTextLengthValid(text) }"
            >
              已占用: {{ calculateTextLength(text) }}/255
            </div>
          </div>

          <div class="form-group">
            <label>字体 (Font)</label>
            <div ref="fontPickerRef" class="font-picker">
              <button
                type="button"
                class="font-trigger"
                :class="{ 'font-trigger-open': isFontDropdownOpen }"
                @click="toggleFontDropdown"
              >
                <span class="font-trigger-label">{{ selectedFontLabel }}</span>
                <span class="font-trigger-arrow">{{ isFontDropdownOpen ? '∧' : '∨' }}</span>
              </button>

              <div v-show="isFontDropdownOpen" class="font-dropdown">
                <div class="font-section">
                  <div class="font-section-title">常用字体</div>
                  <button
                    v-for="option in builtInFontOptions"
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
                  <div v-else-if="localFontOptions.length === 0" class="font-status">未发现可用的本地字体</div>
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
              @change="updateField('content.size', size)"
              min="10"
              max="127"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>颜色 (Color)</label>
            <div class="color-input-group">
              <input
                type="color"
                v-model.lazy="colorPicker"
                @change="updateField('content.color', colorPicker)"
                class="color-picker"
              />
              <input
                type="text"
                v-model="color"
                @change="updateField('content.color', color)"
                placeholder="#FFFFFF"
                class="color-text"
              />
            </div>
          </div>

          <div class="form-group checkbox">
            <label>
              <input type="checkbox" v-model="stroke" @change="updateField('content.stroke', stroke)" />
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
                  @change="updateField('transform.start.x', startX)"
                  placeholder="±*/ 支持"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y</label>
                <input
                  type="text"
                  v-model="startY"
                  @change="updateField('transform.start.y', startY)"
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
                  @change="updateField('transform.end.x', endX)"
                  placeholder="±*/ 支持"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y</label>
                <input
                  type="text"
                  v-model="endY"
                  @change="updateField('transform.end.y', endY)"
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
                  @change="updateField('transform.zRotate', zRotate)"
                  min="0"
                  max="360"
                />
              </div>
              <div class="form-group" style="width: 145px;">
                <label>Y轴旋转 (0-360°)</label>
                <input
                  type="text"
                  v-model="yRotate"
                  @change="updateField('transform.yRotate', yRotate)"
                  min="0"
                  max="360"
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
                @change="onOpacityFieldChange('opacity.from', opacityFrom)"
                placeholder="支持 ±*/ 操作"
              />
              <input
                type="range"
                v-model="opacityFrom"
                @input="onOpacityFieldChange('opacity.from', opacityFrom)"
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
                @change="onOpacityFieldChange('opacity.to', opacityTo)"
                placeholder="支持 ±*/ 操作"
              />
              <input
                type="range"
                v-model="opacityTo"
                @input="onOpacityFieldChange('opacity.to', opacityTo)"
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
              @change="updateField('animation.duration', duration)"
              min="0"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>运动时间 (Move Duration, ms)</label>
            <input
              type="text"
              v-model="moveDuration"
              @change="updateField('animation.moveDuration', moveDuration)"
              min="0"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>延迟 (Delay, ms)</label>
            <input
              type="text"
              v-model="delay"
              @change="updateField('animation.delay', delay)"
              min="0"
              placeholder="±*/ 支持"
            />
          </div>

          <div class="form-group">
            <label>运动方式 (Easing)</label>
            <select v-model="easing" @change="updateField('animation.easing', easing)">
              <option value="speedup">加速 (Speedup)</option>
              <option value="speeddown">减速 (Speeddown)</option>
            </select>
          </div>
        </section>

        <div class="panel-actions">
          <button @click="handleClearSelection" class="btn-secondary">取消选择</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { parseInput, applyOperation, formatInputDisplay, parseColorWithAlpha, blendColor } from '@/utils/parser'
import type { ParseResult } from '@/utils/parser'
import { validateField, roundToInteger, roundOpacityValue, normalizeAngle, normalizeColor, validateRange, M7_RULES } from '@/utils/validation'
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
const updateDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
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

// 计算属性：是否有选中的弹幕
const hasSelection = computed(() => store.selectedIds.length > 0)

// 计算属性：获取选中的弹幕
const selectedDanmakus = computed(() => store.getSelectedDanmakus)

// 辅助函数：获取多个选中弹幕的某字段值
function getFieldValues(path: string): any[] {
  return selectedDanmakus.value.map(d => {
    const keys = path.split('.')
    let value: any = d
    for (const key of keys) {
      value = value?.[key]
    }
    return value
  })
}

// 辅助函数：获取多个选中弹幕的某字段数值
function getNumericFieldValues(path: string): number[] {
  return getFieldValues(path)
    .filter(v => typeof v === 'number' && !isNaN(v))
}

// 基础信息
const layer = computed<string>({
  get: () => editCache.value['layer'] !== undefined ? String(editCache.value['layer']) : formatInputDisplay(getNumericFieldValues('layer')),
  set: (v) => {
    editCache.value['layer'] = v
  }
})

const startTime = computed<string>({
  get: () => editCache.value['startTime'] !== undefined ? editCache.value['startTime'] : formatInputDisplay(getNumericFieldValues('startTime')),
  set: (v) => {
    editCache.value['startTime'] = v
  }
})

// 内容编辑
const text = computed<string>({
  get: () => {
    if (editCache.value['content.text'] !== undefined) return editCache.value['content.text']
    const values = getFieldValues('content.text')
    if (values.length === 0) return ''
    const allSame = values.every((v, i) => i === 0 || v === values[0])
    return allSame ? values[0] : ''
  },
  set: (v) => {
    editCache.value['content.text'] = v
  }
})

const font = computed<string>({
  get: () => editCache.value['content.font'] !== undefined ? editCache.value['content.font'] : (selectedDanmakus.value[0]?.content.font || 'Microsoft YaHei'),
  set: (v) => {
    editCache.value['content.font'] = v
  }
})

const size = computed<string>({
  get: () => editCache.value['content.size'] !== undefined ? String(editCache.value['content.size']) : formatInputDisplay(getNumericFieldValues('content.size')),
  set: (v) => {
    editCache.value['content.size'] = v
  }
})

const color = computed<string>({
  get: () => {
    if (editCache.value['content.color'] !== undefined) return editCache.value['content.color']
    const values = getFieldValues('content.color')
    if (values.length === 0) return ''
    const allSame = values.every((v, i) => i === 0 || v === values[0])
    return allSame ? values[0] : '--'
  },
  set: (v) => {
    editCache.value['content.color'] = v
  }
})

const colorPicker = computed<string>({
  get: () => {
    const cacheValue = editCache.value['content.color']
    
    // 使用正则校验，确保只给拾色器传递合法的 #RRGGBB 格式
    const hexRegex = /^#[0-9a-fA-F]{6}$/
    if (cacheValue !== undefined && hexRegex.test(cacheValue)) {
      return cacheValue
    }

    const values = getFieldValues('content.color')
    if (values.length === 0) return '#ffffff'
    
    const first = selectedDanmakus.value[0]?.content.color
    return (first && hexRegex.test(first)) ? first : '#ffffff'
  },
  set: (v) => {
    editCache.value['content.color'] = v
  }
})

const stroke = computed<boolean>({
  get: () => {
    //优先从缓存中获取当前正在编辑的值
    if (editCache.value['content.stroke'] !== undefined) {
      return editCache.value['content.stroke']
    }

    // 如果缓存没值，再走原本的 Store 读取逻辑
    if (selectedDanmakus.value.length === 1) {
      return selectedDanmakus.value[0]?.content.stroke || false
    }
    
    const values = getFieldValues('content.stroke').filter(v => v !== null)
    return values.length > 0 && values.every(v => v === true)
  },
  set: (v) => {
    editCache.value['content.stroke'] = v
  }
})

// 位置与变换
const startX = computed<string>({
  get: () => editCache.value['transform.start.x'] !== undefined ? String(editCache.value['transform.start.x']) : formatInputDisplay(getNumericFieldValues('transform.start.x')),
  set: (v) => {
    editCache.value['transform.start.x'] = v
  }
})

const startY = computed<string>({
  get: () => editCache.value['transform.start.y'] !== undefined ? String(editCache.value['transform.start.y']) : formatInputDisplay(getNumericFieldValues('transform.start.y')),
  set: (v) => {
    editCache.value['transform.start.y'] = v
  }
})

const endX = computed<string>({
  get: () => editCache.value['transform.end.x'] !== undefined ? String(editCache.value['transform.end.x']) : formatInputDisplay(getNumericFieldValues('transform.end.x')),
  set: (v) => {
    editCache.value['transform.end.x'] = v
  }
})

const endY = computed<string>({
  get: () => editCache.value['transform.end.y'] !== undefined ? String(editCache.value['transform.end.y']) : formatInputDisplay(getNumericFieldValues('transform.end.y')),
  set: (v) => {
    editCache.value['transform.end.y'] = v
  }
})

const zRotate = computed<string>({
  get: () => editCache.value['transform.zRotate'] !== undefined ? String(editCache.value['transform.zRotate']) : formatInputDisplay(getNumericFieldValues('transform.zRotate')),
  set: (v) => {
    editCache.value['transform.zRotate'] = v
  }
})

const yRotate = computed<string>({
  get: () => editCache.value['transform.yRotate'] !== undefined ? String(editCache.value['transform.yRotate']) : formatInputDisplay(getNumericFieldValues('transform.yRotate')),
  set: (v) => {
    editCache.value['transform.yRotate'] = v
  }
})

// 透明度
const opacityFrom = computed<string>({
  get: () => editCache.value['opacity.from'] !== undefined ? String(editCache.value['opacity.from']) : formatInputDisplay(getNumericFieldValues('opacity.from')),
  set: (v) => {
    editCache.value['opacity.from'] = v
  }
})

const opacityTo = computed<string>({
  get: () => editCache.value['opacity.to'] !== undefined ? String(editCache.value['opacity.to']) : formatInputDisplay(getNumericFieldValues('opacity.to')),
  set: (v) => {
    editCache.value['opacity.to'] = v
  }
})

// 动画
const duration = computed<string>({
  get: () => editCache.value['animation.duration'] !== undefined ? String(editCache.value['animation.duration']) : formatInputDisplay(getNumericFieldValues('animation.duration')),
  set: (v) => {
    editCache.value['animation.duration'] = v
  }
})

const moveDuration = computed<string>({
  get: () => editCache.value['animation.moveDuration'] !== undefined ? String(editCache.value['animation.moveDuration']) : formatInputDisplay(getNumericFieldValues('animation.moveDuration')),
  set: (v) => {
    editCache.value['animation.moveDuration'] = v
  }
})

const delay = computed<string>({
  get: () => editCache.value['animation.delay'] !== undefined ? String(editCache.value['animation.delay']) : formatInputDisplay(getNumericFieldValues('animation.delay')),
  set: (v) => {
    editCache.value['animation.delay'] = v
  }
})

const easing = computed<string>({
  get: () => editCache.value['animation.easing'] !== undefined ? editCache.value['animation.easing'] : (selectedDanmakus.value[0]?.animation.easing || 'speedup'),
  set: (v) => {
    editCache.value['animation.easing'] = v
  }
})

const builtInFontKeys = new Set(builtInFontOptions.map(option => normalizeFontKey(option.value)))

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
  return Math.min(localFontOptions.value.length, localFontListStartIndex.value + visibleCount)
})

const localFontListOffset = computed(() => localFontListStartIndex.value * LOCAL_FONT_ITEM_HEIGHT)
const localFontListTotalHeight = computed(() => localFontOptions.value.length * LOCAL_FONT_ITEM_HEIGHT)

const visibleLocalFontOptions = computed(() => {
  return localFontOptions.value.slice(localFontListStartIndex.value, localFontListEndIndex.value)
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
}

function toggleFontDropdown() {
  if (isFontDropdownOpen.value) {
    closeFontDropdown()
    return
  }

  void openFontDropdown()
}

function selectFontOption(value: string) {
  font.value = value
  updateField('content.font', value)
  closeFontDropdown()
}

function onLocalFontListScroll(event: Event) {
  localFontListScrollTop.value = (event.target as HTMLElement).scrollTop
}

// 将选中字体滚动到可视区域
function scrollSelectedFontIntoView() {
  const currentFontKey = normalizeFontKey(font.value)
  const targetIndex = localFontOptions.value.findIndex(option => normalizeFontKey(option.value) === currentFontKey)
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
    closeFontDropdown()
  }
}

function isOpacityPath(path: string): boolean {
  return path === 'opacity.from' || path === 'opacity.to'
}

function isRotatePath(path: string): boolean {
  return path === 'transform.zRotate' || path === 'transform.yRotate'
}

function getValidationFieldName(path: string): string {
  if (isOpacityPath(path)) {
    return 'opacity'
  }

  return path.split('.').pop() || ''
}

function parseOpacityInput(input: string): ParseResult | { error: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { error: '输入不能为空' }
  }

  const parsed = parseInput(trimmed, false)
  if (parsed.mode === 'multiple') {
    return { error: '输入不能为空' }
  }

  if (parsed.error === '无效的数值') {
    return { error: '无效的透明度数值' }
  }

  return parsed
}

function applyFieldUpdate(path: string, inputValue: string | number | boolean) {
  // 优先处理颜色字段（拦截常规输入和 Alpha 混合）
  if (path === 'content.color') {
    const inputStr = String(inputValue)
    
    // 检查是否是 Alpha 混合格式 (e.g., "FFFFFF@0.5")
    const alphaResult = parseColorWithAlpha(inputStr)
    
    if (alphaResult) {
      // 对所有选中的弹幕应用 Alpha 混合
      selectedDanmakus.value.forEach((d) => {
        const currentColor = d.content.color || '#ffffff'
        const blendedColor = blendColor(currentColor, alphaResult.color, alphaResult.alpha)
        store.updateDanmaku(d.id, { 'content.color': blendedColor })
      })
      delete editCache.value[path]
      return
    }
    
    // 否则按普通颜色处理并规范化（补全 # 号等）
    const normalized = normalizeColor(inputStr)
    if (!normalized) {
      notice.alert('颜色格式无效（支持 #RRGGBB 或 RRGGBB@Alpha 格式）', 'warn')
      return
    }
    
    store.updateSelectedDanmakus({ 'content.color': normalized })
    delete editCache.value[path]
    return
  }

  if (isOpacityPath(path)) {
    const operation = parseOpacityInput(String(inputValue))
    if ('error' in operation) {
      notice.alert(`字段 ${path} 验证失败: ${operation.error}`, 'warn')
      return
    }

    const fieldValues = getNumericFieldValues(path)
    if (fieldValues.length === 0) return

    if (operation.mode !== 'set' && selectedDanmakus.value.length > 1) {
      selectedDanmakus.value.forEach((d, idx) => {
        const originalValue = fieldValues[idx]
        if (typeof originalValue !== 'number') return

        const updatedValue = applyOperation(originalValue, operation)
        const normalizedValue = roundOpacityValue(validateRange(updatedValue, 0, 1))
        store.updateDanmaku(d.id, { [path]: normalizedValue })
      })
    } else {
      const baseValue = operation.mode === 'set' ? 0 : fieldValues[0]
      const updatedValue = applyOperation(baseValue, operation)
      const normalizedValue = roundOpacityValue(validateRange(updatedValue, 0, 1))
      store.updateSelectedDanmakus({ [path]: normalizedValue })
    }

    delete editCache.value[path]
    return
  }

  if (isRotatePath(path)) {
    selectedDanmakus.value.forEach((d) => {
      const currentValue = d.transform?.[path.endsWith('zRotate') ? 'zRotate' : 'yRotate'] || 0
      const operation = parseInput(String(inputValue), false)
      if (operation.error) {
        notice.alert(`字段 ${path} 验证失败: ${operation.error}`, 'warn')
        return
      }

      const baseValue = operation.mode === 'set' ? 0 : currentValue
      const updatedValue = applyOperation(baseValue, operation)
      const normalizedValue = normalizeAngle(updatedValue)
      store.updateDanmaku(d.id, { [path]: normalizedValue })
    })
    delete editCache.value[path]
    return
  }

  const bypassValidationFields = [
    'content.text',
    'content.font',
    'animation.easing',
    'content.stroke'
  ]
  const shouldBypass = bypassValidationFields.includes(path)

  if (shouldBypass) {
    if (path === 'content.text') {
      const textValue = String(inputValue)
      if (!isTextLengthValid(textValue)) {
        notice.alert('文本数据超出字符限制（最多255个字符，换行符占用2个），请尝试使用“行分隔工具”', 'warn', '警告')
      }
    }
    
    const updates: Record<string, any> = {}
    updates[path] = inputValue
    store.updateSelectedDanmakus(updates)
    delete editCache.value[path]
    return
  }

  const parseResult = parseInput(String(inputValue), false) 

  if (parseResult.error) {
    notice.alert(`字段 ${path} 验证失败: ${parseResult.error}`, 'warn')
    return
  }

  const updates: Record<string, any> = {}

  if (typeof inputValue === 'boolean') {
    updates[path] = inputValue
    store.updateSelectedDanmakus(updates)
    delete editCache.value[path]
    return
  }

  if (parseResult.mode === 'set' && typeof inputValue === 'string' && (path === 'content.font' || path === 'animation.easing')) {
    updates[path] = inputValue
    store.updateSelectedDanmakus(updates)
    delete editCache.value[path]
    return
  }

  if (parseResult.mode === 'multiple') {
    return
  }

  const fieldValues = getNumericFieldValues(path)
  if (fieldValues.length === 0) return

  let newValue: number
  if (parseResult.mode === 'set') {
    newValue = parseResult.value!
  } else {
    newValue = applyOperation(fieldValues[0], parseResult)
  }

  newValue = roundToInteger(newValue, store.allowNegativeValues)

  const validation = validateField(getValidationFieldName(path), newValue)
  if (!validation.valid) {
    notice.alert(`${validation.message}`, 'warn')
    const rule = M7_RULES[getValidationFieldName(path) as keyof typeof M7_RULES]
    if (rule) {
      newValue = roundToInteger(validateRange(newValue, rule.min, rule.max), store.allowNegativeValues)
    }
  }

  if (parseResult.mode !== 'set' && selectedDanmakus.value.length > 1) {
    selectedDanmakus.value.forEach((d, idx) => {
      const originalValue = fieldValues[idx]
      if (typeof originalValue !== 'number') return
      const updatedValue = roundToInteger(applyOperation(originalValue, parseResult), store.allowNegativeValues)
      const rule = M7_RULES[getValidationFieldName(path) as keyof typeof M7_RULES]
      const validated = roundToInteger(validateRange(updatedValue, rule?.min || 0, rule?.max || Infinity), store.allowNegativeValues)
      store.updateDanmaku(d.id, { [path]: validated })
    })
  } else {
    updates[path] = newValue
    store.updateSelectedDanmakus(updates)
  }

  delete editCache.value[path]
}

// 核心更新逻辑
function updateField(path: string, inputValue: string | number | boolean) {
  if (updateDebounceTimer.value) {
    clearTimeout(updateDebounceTimer.value)
  }

  updateDebounceTimer.value = setTimeout(() => {
    applyFieldUpdate(path, inputValue)
  }, 100)
}

function onTextChange() {
  if (skipNextTextChange) {
    skipNextTextChange = false
    return
  }

  updateField('content.text', text.value)
}

function onTextInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) {
    return
  }

  e.preventDefault()
  skipNextTextChange = true

  if (updateDebounceTimer.value) {
    clearTimeout(updateDebounceTimer.value)
  }

  applyFieldUpdate('content.text', text.value)
  ;(e.target as HTMLTextAreaElement).blur()
}

function onOpacityFieldChange(path: 'opacity.from' | 'opacity.to', value: string | number) {
  const textValue = String(value).trim()
  if (!textValue) {
    return
  }

  updateField(path, textValue)
}

// 解析时间值（支持±*/ 操作）
function parseTimeValue(input: string): number {
  const values = getNumericFieldValues('startTime')
  if (values.length === 0) return 0

  const parseResult = parseInput(input, false)
  if (parseResult.error) return values[0]

  return applyOperation(values[0], parseResult)
}

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
  store.clearSelection()
  editCache.value = {}
  closeFontDropdown()
}

// 监听选择变化，清除编辑缓存
watch(() => store.selectedIds, () => {
  editCache.value = {}
  closeFontDropdown()
}, { deep: true })

watch(() => [isFontDropdownOpen.value, localFontOptions.value.length, font.value], async ([isOpen]) => {
  if (!isOpen) {
    return
  }

  await nextTick()
  scrollSelectedFontIntoView()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

// 组件卸载时清理
onBeforeUnmount(() => {
  if (updateDebounceTimer.value) {
    clearTimeout(updateDebounceTimer.value)
  }

  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
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
  margin-bottom: 25px;
  padding-bottom: 16px;
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
