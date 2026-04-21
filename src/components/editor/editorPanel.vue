<template>
  <div class="editor-panel">
    <!-- 无选中状态 -->
    <div v-if="!hasSelection" class="empty-state">
      <p>未选择弹幕</p>
      <p class="hint">请在时间轴中选择一个或多个弹幕进行编辑</p>
    </div>

    <!-- 有选中状态 -->
    <template v-else>
      <div class="panel-header">
        <h2>已选择：{{ store.selectedCount }} 条弹幕</h2>
      </div>

      <div class="panel-content">
        <!-- 基础信息 -->
        <section class="editor-section">
          <h3>基础信息</h3>
          <div class="form-group">
            <label>层级 (Layer)</label>
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
            <label>字体 (Font)</label>
            <select v-model="font" @change="updateField('content.font', font)">
              <option value="Microsoft YaHei">微软雅黑</option>
              <option value="SimHei">黑体</option>
              <option value="SimSun">宋体</option>
              <option value="NSimSun">新宋体</option>
              <option value="FangSong">仿宋</option>
            </select>
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
                v-model="colorPicker"
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
            <div class="form-group">
              <label>初始 (From)</label>
              <input
                type="number"
                v-model="opacityFrom"
                @change="updateField('opacity.from', opacityFrom)"
                min="0"
                max="1"
                step="0.1"
              />
              <input
                type="range"
                v-model="opacityFrom"
                @change="updateField('opacity.from', opacityFrom)"
                min="0"
                max="1"
                step="0.01"
                class="slider"
              />
            </div>
            <div class="form-group">
              <label>结束 (To)</label>
              <input
                type="number"
                v-model="opacityTo"
                @change="updateField('opacity.to', opacityTo)"
                min="0"
                max="1"
                step="0.1"
              />
              <input
                type="range"
                v-model="opacityTo"
                @change="updateField('opacity.to', opacityTo)"
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
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { parseInput, applyOperation, formatInputDisplay } from '@/utils/parser'
import { validateField, normalizeColor, validateRange, M7_RULES } from '@/utils/validation'
import { formatTime } from '@/utils/time'

const store = useEditorStore()

// 本地编辑缓存，避免频繁触发响应式更新
const editCache = ref<Record<string, any>>({})
const updateDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

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
    const values = getFieldValues('content.color')
    if (values.length === 0) return '#ffffff'
    const first = selectedDanmakus.value[0]?.content.color
    return first || '#ffffff'
  },
  set: (v) => {
    editCache.value['content.color'] = v
  }
})

const stroke = computed<boolean>({
  get: () => {
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

// 核心更新逻辑
function updateField(path: string, inputValue: string | number | boolean) {
  if (updateDebounceTimer.value) {
    clearTimeout(updateDebounceTimer.value)
  }

  updateDebounceTimer.value = setTimeout(() => {
    const isTextField = path === 'content.text'
    const parseResult = parseInput(String(inputValue), isTextField)

    if (parseResult.error) {
      console.warn(`字段 ${path} 验证失败: ${parseResult.error}`)
      return
    }

    // 构建Pinia更新payload
    const updates: Record<string, any> = {}

    // 处理boolean字段（如stroke等）
    if (typeof inputValue === 'boolean') {
      updates[path] = inputValue
      store.updateSelectedDanmakus(updates)
      delete editCache.value[path]
      return
    }

    // 处理文本字段（如font、easing等）
    if (parseResult.mode === 'set' && typeof inputValue === 'string' && (path === 'content.font' || path === 'animation.easing')) {
      updates[path] = inputValue
      store.updateSelectedDanmakus(updates)
      delete editCache.value[path]
      return
    }

    // 处理颜色字段
    if (path === 'content.color') {
      const normalized = normalizeColor(String(inputValue))
      if (!normalized) {
        console.warn('颜色格式无效')
        return
      }
      updates[path] = normalized
      store.updateSelectedDanmakus(updates)
      delete editCache.value[path]
      return
    }

    // 处理数值字段
    if (parseResult.mode === 'multiple') {
      // 多个不同值的情况，不做任何更新
      return
    }

    const fieldValues = getNumericFieldValues(path)
    if (fieldValues.length === 0) return

    let newValue: number
    if (parseResult.mode === 'set') {
      newValue = parseResult.value!
    } else {
      // 对所有值应用相同的操作
      newValue = applyOperation(fieldValues[0], parseResult)
    }

    // 根据字段类型进行范围验证
    const validation = validateField(path.split('.').pop() || '', newValue)
    if (!validation.valid) {
      console.warn(validation.message)
      // 进行范围修正
      const rule = M7_RULES[path.split('.').pop() as keyof typeof M7_RULES]
      if (rule) {
        newValue = validateRange(newValue, rule.min, rule.max)
      }
    }

    // 对多选情况应用不同的操作
    if (parseResult.mode !== 'set' && selectedDanmakus.value.length > 1) {
      // 批量应用操作，每个弹幕单独计算
      selectedDanmakus.value.forEach((d, idx) => {
        const originalValue = fieldValues[idx]
        if (typeof originalValue !== 'number') return
        const updatedValue = applyOperation(originalValue, parseResult)
        const rule = M7_RULES[path.split('.').pop() as keyof typeof M7_RULES]
        const validated = validateRange(updatedValue, rule?.min || 0, rule?.max || Infinity)
        store.updateDanmaku(d.id, { [path]: validated })
      })
    } else {
      // 单选或直接赋值：统一设置为相同值
      updates[path] = newValue
      store.updateSelectedDanmakus(updates)
    }

    delete editCache.value[path]
  }, 100) // 300ms防抖
}

// 解析时间值（支持±*/ 操作）
function parseTimeValue(input: string): number {
  const values = getNumericFieldValues('startTime')
  if (values.length === 0) return 0

  const parseResult = parseInput(input, false)
  if (parseResult.error) return values[0]

  return applyOperation(values[0], parseResult)
}

// 清除选择
function handleClearSelection() {
  store.clearSelection()
  editCache.value = {}
}

// 监听选择变化，清除编辑缓存
watch(() => store.selectedIds, () => {
  editCache.value = {}
}, { deep: true })

// 组件卸载时清理
onBeforeUnmount(() => {
  if (updateDebounceTimer.value) {
    clearTimeout(updateDebounceTimer.value)
  }
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
  margin-bottom: 20px;
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
  padding-left: 12px;
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

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4ec9b0;
  background-color: #444;
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
  border-top: 1px solid #333;
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

/* 滚动条美化 */
.panel-content::-webkit-scrollbar {
  width: 8px;
}

.panel-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.panel-content::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: #5a5a5a;
}
</style>