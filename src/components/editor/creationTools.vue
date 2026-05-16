<template>
  <div
    v-if="visible"
    class="creation-tools-overlay"
    @mousedown.self="closePanel"
  >
    <section class="creation-tools-modal" role="dialog" aria-modal="true" aria-label="高级创建工具">
      <header class="modal-header">
        <div>
          <h2>高级创建工具</h2>
          <p>Ctrl + ; 开关。工具面板当前仅完成 UI 与交互骨架，预览框创建功能已可用。</p>
        </div>
        <button class="icon-btn" type="button" @click="closePanel">关闭</button>
      </header>

      <div class="modal-content">
        <section class="panel-block preview-block">
          <div class="block-header">
            <div>
              <h3>预备弹幕数据</h3>
              <p>支持单条对象、对象数组，或包含 `danmakus` 字段的对象。</p>
            </div>
            <div class="preview-summary" :class="{ error: previewSummary.hasError }">
              {{ previewSummary.message }}
            </div>
          </div>

          <textarea
            v-model="previewText"
            class="preview-editor"
            spellcheck="false"
            placeholder="在此编辑待创建的弹幕 JSON"
          />

          <div class="preview-actions">
            <button class="btn-primary" type="button" @click="handleCreate">
              创建
            </button>
            <button class="btn-secondary" type="button" @click="formatPreview">
              格式化 JSON
            </button>
            <button class="btn-secondary" type="button" @click="resetPreviewToTemplate">
              重置模板
            </button>
            <span class="status-text" :class="previewStatusTone">
              {{ previewStatus }}
            </span>
          </div>
        </section>

        <section class="panel-block tool-block">
          <div class="block-header tool-header">
            <div>
              <h3>工具面板</h3>
            </div>

            <div class="tool-header-actions">
              <label class="inline-field">
                <span>数量</span>
                <input
                  v-model="quantityInput"
                  type="number"
                  min="1"
                  step="1"
                  class="small-input"
                />
              </label>

              <div class="toggle-group">
                <button
                  class="toggle-btn"
                  :class="{ active: writeMode === 'replace' }"
                  type="button"
                  @click="writeMode = 'replace'"
                >
                  替换
                </button>
                <button
                  class="toggle-btn"
                  :class="{ active: writeMode === 'append' }"
                  type="button"
                  @click="writeMode = 'append'"
                >
                  添加
                </button>
              </div>

              <button class="btn-primary" type="button" @click="handleToolWrite">
                写入
              </button>
            </div>
          </div>

          <div class="tool-status-row">
            <span class="status-text info">{{ toolStatus }}</span>
          </div>

          <div class="tool-grid">
            <section
              v-for="section in toolSections"
              :key="section.title"
              class="tool-section"
            >
              <h4>{{ section.title }}</h4>

              <article
                v-for="field in section.fields"
                :key="field.path"
                class="field-card"
              >
                <div class="field-card-header">
                  <div>
                    <div class="field-title">{{ field.label }}</div>
                    <div class="field-path">{{ field.path }}</div>
                  </div>

                  <div
                    v-if="field.kind === 'numeric' || field.kind === 'color'"
                    class="mode-switch"
                  >
                    <button
                      class="mode-btn"
                      :class="{ active: getFieldMode(field.path) === 'range' }"
                      type="button"
                      @click="setFieldMode(field.path, 'range')"
                    >
                      范围
                    </button>
                    <button
                      class="mode-btn"
                      :class="{ active: getFieldMode(field.path) === 'relative' }"
                      type="button"
                      @click="setFieldMode(field.path, 'relative')"
                    >
                      相对
                    </button>
                  </div>
                </div>

                <div v-if="field.kind === 'numeric'" class="field-card-body">
                  <div class="input-grid two-column">
                    <label class="stack-field">
                      <span>起始</span>
                      <input
                        v-model="numericRules[field.path].start"
                        type="text"
                        :placeholder="field.startPlaceholder"
                      />
                    </label>

                    <label class="stack-field">
                      <span>{{ numericRules[field.path].mode === 'range' ? '结束' : '每次偏移值' }}</span>
                      <input
                        v-model="numericRules[field.path][numericRules[field.path].mode === 'range' ? 'end' : 'step']"
                        type="text"
                        :placeholder="numericRules[field.path].mode === 'range' ? field.endPlaceholder : field.stepPlaceholder"
                      />
                    </label>
                  </div>
                </div>

                <div v-else-if="field.kind === 'color'" class="field-card-body">
                  <div class="input-grid two-column">
                    <label class="stack-field">
                      <span>起始颜色</span>
                      <div class="color-input-row">
                        <input
                          v-model="colorRule.start"
                          type="color"
                          class="color-picker"
                          @input="syncColorInput('start')"
                        />
                        <input
                          v-model="colorRule.startText"
                          type="text"
                          placeholder="#FFFFFF"
                          @change="normalizeColorInput('start')"
                          style="width: 80%;"
                        />
                      </div>
                    </label>

                    <label class="stack-field">
                      <span>{{ colorRule.mode === 'range' ? '目标颜色' : '叠加颜色' }}</span>
                      <div class="color-input-row">
                        <input
                          v-model="colorRule.target"
                          type="color"
                          class="color-picker"
                          @input="syncColorInput('target')"
                        />
                        <input
                          v-model="colorRule.targetText"
                          type="text"
                          placeholder="#FFAA00"
                          @change="normalizeColorInput('target')"
                          style="width: 80%;"
                        />
                      </div>
                    </label>
                  </div>

                  <label class="stack-field">
                    <span>{{ colorRule.mode === 'range' ? 'Alpha 均分说明' : 'Alpha 混合相对值' }}</span>
                    <input
                      v-model="colorRule.alpha"
                      type="text"
                      :placeholder="colorRule.mode === 'range' ? '例如 0 到 1 之间均分过渡' : '例如 0.35'"
                    />
                  </label>
                </div>

                <div v-else-if="field.kind === 'text'" class="field-card-body">
                  <label class="stack-field">
                    <span>文本内容</span>
                    <textarea
                      v-model="directRules.text"
                      rows="3"
                      placeholder="输入固定文本"
                    />
                  </label>
                </div>

                <div v-else-if="field.kind === 'font'" class="field-card-body">
                  <label class="stack-field">
                    <span>字体名称</span>
                    <input
                      v-model="directRules.font"
                      type="text"
                      placeholder="Microsoft YaHei"
                    />
                  </label>
                </div>

                <div v-else-if="field.kind === 'stroke'" class="field-card-body">
                  <label class="checkbox-field">
                    <input v-model="directRules.stroke" type="checkbox" />
                    <span>启用描边</span>
                  </label>
                </div>

                <div v-else-if="field.kind === 'easing'" class="field-card-body">
                  <label class="stack-field">
                    <span>缓动类型</span>
                    <select v-model="directRules.easing">
                      <option value="speedup">speedup</option>
                      <option value="speeddown">speeddown</option>
                    </select>
                  </label>
                </div>
              </article>
            </section>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DanmakuItem } from '@/core/danmaku'
import { historyManager } from '@/core/history'
import { useEditorStore } from '@/store/editor'
import { M7_RULES, normalizeColor, validateRange } from '@/utils/validation'

type RuleMode = 'range' | 'relative'
type WriteMode = 'append' | 'replace'
type NumericFieldPath =
  | 'layer'
  | 'startTime'
  | 'content.size'
  | 'transform.start.x'
  | 'transform.start.y'
  | 'transform.end.x'
  | 'transform.end.y'
  | 'transform.zRotate'
  | 'transform.yRotate'
  | 'opacity.from'
  | 'opacity.to'
  | 'animation.duration'
  | 'animation.moveDuration'
  | 'animation.delay'
type ColorFieldPath = 'content.color'
type DirectFieldPath = 'content.text' | 'content.font' | 'content.stroke' | 'animation.easing'
type FieldPath = NumericFieldPath | ColorFieldPath | DirectFieldPath
type ColorInputTarget = 'start' | 'target'

type NumericFieldConfig = {
  path: NumericFieldPath
  label: string
  kind: 'numeric'
  startPlaceholder: string
  endPlaceholder: string
  stepPlaceholder: string
}

type ColorFieldConfig = {
  path: ColorFieldPath
  label: string
  kind: 'color'
}

type DirectFieldConfig = {
  path: DirectFieldPath
  label: string
  kind: 'text' | 'font' | 'stroke' | 'easing'
}

type ToolFieldConfig = NumericFieldConfig | ColorFieldConfig | DirectFieldConfig

type ToolSection = {
  title: string
  fields: ToolFieldConfig[]
}

type NumericRuleState = {
  mode: RuleMode
  start: string
  end: string
  step: string
}

type ColorRuleState = {
  mode: RuleMode
  start: string
  startText: string
  target: string
  targetText: string
  alpha: string
}

type ToolWriteRequest = {
  quantity: number
  writeMode: WriteMode
  previewText: string
  numericRules: Record<NumericFieldPath, NumericRuleState>
  colorRule: ColorRuleState
  directRules: {
    text: string
    font: string
    stroke: boolean
    easing: DanmakuItem['animation']['easing']
  }
}

type DanmakuDraft = Omit<DanmakuItem, 'id'> & {
  id?: string
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'tool-write', value: ToolWriteRequest): void
  (e: 'created', value: { count: number; ids: string[] }): void
}>()

const store = useEditorStore()

const previewText = ref('')
const previewStatus = ref('预览框中的 JSON 可以直接编辑并创建。')
const previewStatusTone = ref<'info' | 'success' | 'error'>('info')
const toolStatus = ref('工具面板生成逻辑尚未接入，点击“写入”会触发预留接口。')
const quantityInput = ref('10')
const writeMode = ref<WriteMode>('replace')

const numericRules = ref<Record<NumericFieldPath, NumericRuleState>>({
  layer: createNumericRule('0', '9', '+1'),
  startTime: createNumericRule(String(Math.round(store.currentTime)), String(Math.round(store.currentTime + 900)), '+100'),
  'content.size': createNumericRule('60', '80', '+2'),
  'transform.start.x': createNumericRule('120', '680', '+20'),
  'transform.start.y': createNumericRule('120', '320', '+10'),
  'transform.end.x': createNumericRule('120', '680', '+20'),
  'transform.end.y': createNumericRule('120', '320', '+10'),
  'transform.zRotate': createNumericRule('0', '180', '+15'),
  'transform.yRotate': createNumericRule('0', '180', '+15'),
  'opacity.from': createNumericRule('1', '0.2', '-0.05'),
  'opacity.to': createNumericRule('1', '0.2', '-0.05'),
  'animation.duration': createNumericRule('1200', '2400', '+100'),
  'animation.moveDuration': createNumericRule('600', '1800', '+100'),
  'animation.delay': createNumericRule('0', '900', '+100')
})

const colorRule = ref<ColorRuleState>({
  mode: 'range',
  start: '#FFFFFF',
  startText: '#FFFFFF',
  target: '#FFAA00',
  targetText: '#FFAA00',
  alpha: '0.35'
})

const directRules = ref({
  text: '欢迎使用高级创建工具',
  font: 'Microsoft YaHei',
  stroke: false,
  easing: 'speedup' as DanmakuItem['animation']['easing']
})

const toolSections: ToolSection[] = [
  {
    title: '基础信息',
    fields: [
      createNumericField('layer', '所属层', '0', '10', '+1'),
      createNumericField('startTime', '开始时间', '0', '1000', '+100')
    ]
  },
  {
    title: '起点坐标',
    fields: [
      createNumericField('transform.start.x', '起点 X', '0', '800', '+10'),
      createNumericField('transform.start.y', '起点 Y', '0', '450', '+10')
    ]
  },
  {
    title: '终点坐标',
    fields: [
      createNumericField('transform.end.x', '终点 X', '0', '800', '+10'),
      createNumericField('transform.end.y', '终点 Y', '0', '450', '+10')
    ]
  },
  {
    title: '内容',
    fields: [
      { path: 'content.text', label: '文本', kind: 'text' },
      { path: 'content.font', label: '字体', kind: 'font' },
      createNumericField('content.size', '字号', '60', '100', '+2'),
      { path: 'content.color', label: '颜色', kind: 'color' },
      { path: 'content.stroke', label: '描边', kind: 'stroke' }
    ]
  },
  {
    title: '旋转与透明度',
    fields: [
      createNumericField('transform.zRotate', 'Z 轴旋转', '0', '360', '+15'),
      createNumericField('transform.yRotate', 'Y 轴旋转', '0', '360', '+15'),
      createNumericField('opacity.from', '起始透明度', '1', '0', '-0.1'),
      createNumericField('opacity.to', '结束透明度', '1', '0', '-0.1')
    ]
  },
  {
    title: '动画',
    fields: [
      createNumericField('animation.duration', '生存时间', '1000', '3000', '+100'),
      createNumericField('animation.moveDuration', '运动时间', '500', '1500', '+100'),
      createNumericField('animation.delay', '延迟', '0', '500', '+50'),
      { path: 'animation.easing', label: '缓动', kind: 'easing' }
    ]
  }
]

const previewSummary = computed(() => {
  try {
    const drafts = parsePreviewDanmakus(previewText.value)
    return {
      hasError: false,
      message: `当前可解析 ${drafts.length} 条弹幕`
    }
  } catch (error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '预览 JSON 解析失败'
    }
  }
})

watch(
  () => props.visible,
  (visible) => {
    if (visible && !previewText.value.trim()) {
      resetPreviewToTemplate()
    }
  },
  { immediate: true }
)

function createNumericRule(start = '', end = '', step = ''): NumericRuleState {
  return {
    mode: 'range',
    start,
    end,
    step
  }
}

function createNumericField(
  path: NumericFieldPath,
  label: string,
  startPlaceholder: string,
  endPlaceholder: string,
  stepPlaceholder: string
): NumericFieldConfig {
  return {
    path,
    label,
    kind: 'numeric',
    startPlaceholder,
    endPlaceholder,
    stepPlaceholder
  }
}

function closePanel() {
  emit('update:visible', false)
}

function buildTemplateDraft(): DanmakuDraft[] {
  return [
    {
      layer: 0,
      startTime: Math.round(store.currentTime),
      content: {
        text: '欢迎使用高级创建工具',
        font: 'Microsoft YaHei',
        size: 60,
        color: '#FFFFFF',
        stroke: false
      },
      transform: {
        start: { x: 120, y: 180 },
        end: { x: 680, y: 180 },
        zRotate: 0,
        yRotate: 0
      },
      opacity: {
        from: 1,
        to: 1
      },
      animation: {
        duration: 1600,
        moveDuration: 800,
        delay: 0,
        easing: 'speedup'
      }
    }
  ]
}

function resetPreviewToTemplate() {
  previewText.value = JSON.stringify(buildTemplateDraft(), null, 2)
  previewStatus.value = '已重置为单条弹幕模板。'
  previewStatusTone.value = 'info'
}

function formatPreview() {
  try {
    const drafts = parsePreviewDanmakus(previewText.value)
    previewText.value = JSON.stringify(drafts, null, 2)
    previewStatus.value = 'JSON 已格式化。'
    previewStatusTone.value = 'success'
  } catch (error) {
    previewStatus.value = error instanceof Error ? error.message : 'JSON 格式化失败'
    previewStatusTone.value = 'error'
  }
}

function getFieldMode(path: FieldPath): RuleMode {
  if (path === 'content.color') {
    return colorRule.value.mode
  }

  return numericRules.value[path as NumericFieldPath]?.mode ?? 'range'
}

function setFieldMode(path: FieldPath, mode: RuleMode) {
  if (path === 'content.color') {
    colorRule.value.mode = mode
    return
  }

  const rule = numericRules.value[path as NumericFieldPath]
  if (rule) {
    rule.mode = mode
  }
}

function syncColorInput(target: ColorInputTarget) {
  if (target === 'start') {
    colorRule.value.startText = colorRule.value.start.toUpperCase()
    return
  }

  colorRule.value.targetText = colorRule.value.target.toUpperCase()
}

function normalizeColorInput(target: ColorInputTarget) {
  const rawValue = target === 'start' ? colorRule.value.startText : colorRule.value.targetText
  const normalized = normalizeColor(rawValue)
  if (!normalized) {
    toolStatus.value = `颜色字段 ${target === 'start' ? '起始' : '目标'} 输入无效，已保留原值。`
    return
  }

  if (target === 'start') {
    colorRule.value.start = normalized
    colorRule.value.startText = normalized
    return
  }

  colorRule.value.target = normalized
  colorRule.value.targetText = normalized
}

function buildToolWriteRequest(): ToolWriteRequest {
  return {
    quantity: normalizeQuantity(),
    writeMode: writeMode.value,
    previewText: previewText.value,
    numericRules: cloneValue(numericRules.value),
    colorRule: cloneValue(colorRule.value),
    directRules: cloneValue(directRules.value)
  }
}

function handleToolWrite() {
  emit('tool-write', buildToolWriteRequest())
  toolStatus.value = '已触发工具面板预留接口，当前版本不会把规则自动写入预览框。'
}

function handleCreate() {
  try {
    const drafts = parsePreviewDanmakus(previewText.value)
    if (drafts.length === 0) {
      throw new Error('预览框中没有可创建的弹幕数据')
    }

    const nextId = createIdAllocator()
    const createdDanmakus = drafts.map((draft) => {
      const normalized = normalizeDanmakuDraft(draft)
      return {
        ...normalized,
        id: nextId()
      }
    })

    store.danmakus.push(...createdDanmakus)
    store.selectedIds = createdDanmakus.map((item) => item.id)
    historyManager.recordSnapshot(store.danmakus, `高级创建工具：创建${createdDanmakus.length}条弹幕`)
    store._clearPendingChangeTracking()

    previewStatus.value = `已创建 ${createdDanmakus.length} 条弹幕。`
    previewStatusTone.value = 'success'
    emit('created', {
      count: createdDanmakus.length,
      ids: createdDanmakus.map((item) => item.id)
    })
  } catch (error) {
    previewStatus.value = error instanceof Error ? error.message : '创建失败'
    previewStatusTone.value = 'error'
  }
}

function normalizeQuantity(): number {
  const parsed = Number(quantityInput.value)
  const normalized = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 10
  quantityInput.value = String(normalized)
  return normalized
}

function createIdAllocator() {
  const generatedId = Number(store.generateNewId())
  const maxExistingId = store.danmakus.reduce((max, danmaku) => {
    const numericId = Number(danmaku.id)
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max
  }, 0)

  let nextId = Number.isFinite(generatedId)
    ? Math.max(generatedId, maxExistingId + 1)
    : maxExistingId + 1

  return () => String(nextId++)
}

function parsePreviewDanmakus(text: string): DanmakuDraft[] {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('预览框为空，请先输入弹幕 JSON')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  const drafts = extractDanmakuDrafts(parsed)
  if (drafts.length === 0) {
    throw new Error('未识别到可创建的弹幕数据')
  }

  return drafts
}

function extractDanmakuDrafts(input: unknown): DanmakuDraft[] {
  if (Array.isArray(input)) {
    return input.filter(isDanmakuDraftLike) as DanmakuDraft[]
  }

  if (!isRecord(input)) {
    return []
  }

  if (Array.isArray(input.danmakus)) {
    return input.danmakus.filter(isDanmakuDraftLike) as DanmakuDraft[]
  }

  return isDanmakuDraftLike(input) ? [input as DanmakuDraft] : []
}

function isDanmakuDraftLike(value: unknown): value is DanmakuDraft {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.startTime !== undefined &&
    isRecord(value.content) &&
    isRecord(value.transform) &&
    isRecord(value.transform.start) &&
    isRecord(value.transform.end) &&
    isRecord(value.opacity) &&
    isRecord(value.animation)
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeDanmakuDraft(draft: DanmakuDraft): Omit<DanmakuItem, 'id'> {
  const normalizedColorValue = normalizeColor(String(draft.content?.color ?? '#FFFFFF')) || '#FFFFFF'
  const easingValue = draft.animation?.easing === 'speeddown' ? 'speeddown' : 'speedup'

  return {
    layer: clampIntegerByRule(draft.layer, M7_RULES.layer),
    startTime: clampNonNegativeInteger(draft.startTime),
    content: {
      text: String(draft.content?.text ?? ''),
      font: String(draft.content?.font ?? 'Microsoft YaHei'),
      size: clampIntegerByRule(draft.content?.size, M7_RULES.size),
      color: normalizedColorValue,
      stroke: Boolean(draft.content?.stroke)
    },
    transform: {
      start: {
        x: roundInteger(draft.transform?.start?.x),
        y: roundInteger(draft.transform?.start?.y)
      },
      end: {
        x: roundInteger(draft.transform?.end?.x),
        y: roundInteger(draft.transform?.end?.y)
      },
      zRotate: clampIntegerByRule(draft.transform?.zRotate, M7_RULES.rotate),
      yRotate: clampIntegerByRule(draft.transform?.yRotate, M7_RULES.rotate)
    },
    opacity: {
      from: clampOpacity(draft.opacity?.from),
      to: clampOpacity(draft.opacity?.to)
    },
    animation: {
      duration: clampIntegerByRule(draft.animation?.duration, M7_RULES.duration),
      moveDuration: clampNonNegativeInteger(draft.animation?.moveDuration),
      delay: clampNonNegativeInteger(draft.animation?.delay),
      easing: easingValue
    }
  }
}

function roundInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function clampNonNegativeInteger(value: unknown): number {
  return Math.max(0, roundInteger(value))
}

function clampIntegerByRule(
  value: unknown,
  rule: {
    min: number
    max: number
  }
): number {
  const parsed = Number(value)
  const rounded = Number.isFinite(parsed) ? Math.round(parsed) : rule.min
  return Math.round(validateRange(rounded, rule.min, rule.max))
}

function clampOpacity(value: unknown): number {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) ? validateRange(parsed, 0, 1) : 1
  return Number(normalized.toFixed(2))
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

defineExpose({
  buildToolWriteRequest,
  resetPreviewToTemplate
})
</script>

<style scoped>
.creation-tools-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.creation-tools-modal {
  width: 1200px;
  max-width: calc(100vw - 40px);
  height: 800px;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #333;
  background: linear-gradient(180deg, #252526 0%, #1f1f20 100%);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #f2f2f2;
}

.modal-header p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #9aa0a6;
}

.modal-content {
  flex: 1;
  display: grid;
  gap: 0;
  min-height: 0;
}

.panel-block {
  min-height: 0;
  padding: 18px 20px;
}

.preview-block {
  border-bottom: 1px solid #333;
  background: #1b1b1c;
}

.tool-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #1e1e1e;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.block-header h3 {
  margin: 0;
  font-size: 14px;
  color: #4ec9b0;
}

.block-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #909090;
}

.preview-summary {
  padding: 8px 10px;
  border: 1px solid #33413f;
  border-radius: 3px;
  background: #212b2a;
  color: #a6ddd2;
  font-size: 12px;
  white-space: nowrap;
}

.preview-summary.error {
  border-color: #6a3a3a;
  background: #2b1f1f;
  color: #ffb3b3;
}

.preview-editor {
  width: 100%;
  height: 128px;
  padding: 12px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background: #252526;
  color: #e0e0e0;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  box-sizing: border-box;
  font-family: 'Consolas', 'Courier New', monospace;
}

.preview-editor:focus,
.stack-field input:focus,
.stack-field textarea:focus,
.stack-field select:focus,
.small-input:focus {
  outline: none;
  border-color: #4ec9b0;
  background: #303033;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.tool-header {
  margin-bottom: 0;
}

.tool-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tool-status-row {
  min-height: 20px;
}

.tool-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding-right: 4px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-section h4 {
  margin: 0;
  font-size: 12px;
  color: #d7ba7d;
  letter-spacing: 0.04em;
}

.field-card {
  border: 1px solid #333;
  border-radius: 6px;
  background: #252526;
  padding: 12px;
}

.field-card-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.field-title {
  font-size: 13px;
  color: #e7e7e7;
  font-weight: 600;
}

.field-path {
  margin-top: 4px;
  font-size: 11px;
  color: #7c7c7c;
  font-family: 'Consolas', 'Courier New', monospace;
}

.field-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-grid {
  display: grid;
  gap: 10px;
}

.input-grid.two-column {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stack-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stack-field span,
.inline-field span,
.checkbox-field span {
  font-size: 12px;
  color: #cfcfcf;
}

.stack-field input,
.stack-field textarea,
.stack-field select,
.small-input {
  padding: 8px 10px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background: #3c3c3c;
  color: #e0e0e0;
  font-size: 13px;
  box-sizing: border-box;
}

.stack-field textarea {
  resize: vertical;
  min-height: 72px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.stack-field input[type='text'],
.small-input {
  font-family: 'Consolas', 'Courier New', monospace;
}

.color-input-row {
  display: flex;
  gap: 8px;
}

.color-picker {
  width: 44px;
  min-width: 44px;
  height: 36px;
  padding: 0;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background: #3c3c3c;
  cursor: pointer;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-field input {
  width: 16px;
  height: 16px;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.small-input {
  width: 88px;
}

.toggle-group,
.mode-switch {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid #343436;
  border-radius: 4px;
  background: #202022;
}

.toggle-btn,
.mode-btn,
.btn-primary,
.btn-secondary,
.icon-btn {
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn,
.mode-btn {
  min-width: 54px;
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  color: #b9b9b9;
  font-size: 12px;
}

.toggle-btn:hover,
.mode-btn:hover {
  background: #333;
  color: #fff;
}

.toggle-btn.active,
.mode-btn.active {
  background: #2f4f63;
  border-color: #4d88ad;
  color: #fff;
}

.btn-primary,
.btn-secondary,
.icon-btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
}

.btn-primary {
  border: 1px solid #0f6d5f;
  background: #117865;
  color: #fff;
}

.btn-primary:hover {
  background: #14917a;
}

.btn-secondary,
.icon-btn {
  border: 1px solid #3e3e42;
  background: #303033;
  color: #e0e0e0;
}

.btn-secondary:hover,
.icon-btn:hover {
  background: #3a3a3f;
}

.status-text {
  font-size: 12px;
  color: #9aa0a6;
}

.status-text.success {
  color: #9cdc87;
}

.status-text.error {
  color: #ff9b9b;
}

.status-text.info {
  color: #9cdcfe;
}

.tool-grid::-webkit-scrollbar,
.preview-editor::-webkit-scrollbar,
.stack-field textarea::-webkit-scrollbar {
  width: 8px;
}

.tool-grid::-webkit-scrollbar-track,
.preview-editor::-webkit-scrollbar-track,
.stack-field textarea::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.tool-grid::-webkit-scrollbar-thumb,
.preview-editor::-webkit-scrollbar-thumb,
.stack-field textarea::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 4px;
}

.tool-grid::-webkit-scrollbar-thumb:hover,
.preview-editor::-webkit-scrollbar-thumb:hover,
.stack-field textarea::-webkit-scrollbar-thumb:hover {
  background: #5a5a5a;
}

@media (max-width: 1180px) {
  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .creation-tools-modal {
    height: calc(100vh - 24px);
    max-height: calc(100vh - 24px);
    max-width: calc(100vw - 24px);
  }

  .modal-content {
    grid-template-rows: 260px minmax(0, 1fr);
  }

  .block-header,
  .tool-header {
    flex-direction: column;
  }

  .preview-summary {
    white-space: normal;
  }

  .tool-grid {
    grid-template-columns: 1fr;
  }

  .input-grid.two-column {
    grid-template-columns: 1fr;
  }
}
</style>
