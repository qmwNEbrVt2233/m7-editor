<template>
  <div class="template-overlay no-select" @mousedown.self="close">
    <section class="template-dialog" role="dialog" aria-modal="true" aria-label="弹幕模板管理器">
      <header class="template-header">
        <div>
          <h2>弹幕模板</h2>
          <p v-if="isTauriRuntime()">同步至 Documents/m7-editor/templates</p>
        </div>
        <button class="template-icon-button" type="button" aria-label="关闭" @click="close">✕</button>
      </header>

      <div class="template-body">
        <aside class="template-sidebar">
          <div class="template-list-heading">
            <span>模板列表</span>
            <button
              v-if="isTauriRuntime()"
              class="template-refresh-button"
              type="button"
              aria-label="刷新模板列表"
              title="刷新模板列表"
              :disabled="refreshing"
              @click="refreshTemplates"
            >⟲</button>
          </div>
          <label class="template-replacement">
            <input
              :checked="store.replaceDefaultDanmakuWithTemplate"
              type="checkbox"
              @change="setReplacement"
            />
            <span>使用选中的模板代替默认创建弹幕</span>
          </label>
          <button
            class="template-create-button"
            type="button"
            :disabled="store.selectedIds.length === 0 || mutating"
            @click="createFromSelection"
          >
            <span>＋</span> 从选中弹幕创建
          </button>
          <div v-if="store.danmakuTemplates.length > 0" class="template-search-row">
            <input
              v-model="searchQuery"
              type="text"
              class="template-search-input"
              placeholder="搜索模板..."
              aria-label="搜索模板"
            />
          </div>
          <div v-if="store.danmakuTemplates.length === 0" class="template-empty">
            暂无模板
          </div>
          <div v-else-if="filteredTemplates.length === 0" class="template-empty">
            未找到匹配的模板
          </div>
          <div v-else class="template-list  have-scrollbar">
            <button
              v-for="template in filteredTemplates"
              :key="template.name"
              class="template-list-item"
              :class="{ active: template.name === store.selectedDanmakuTemplateName }"
              type="button"
              @click="selectTemplate(template.name)"
            >
              <span class="template-list-name">{{ template.name }}</span>
            </button>
          </div>
        </aside>

        <main v-if="selectedTemplate" class="template-editor">
          <label class="template-field">
            <div class="template-field-heading">
              <span>模板名称</span>
              <span v-if="!nameValidation.valid" class="invalid-hint">{{ nameValidation.message }}</span>
            </div>
            <input v-model="editedName" type="text" maxlength="100" />
          </label>

          <div class="template-content-heading">
            <label for="danmaku-template-json">弹幕内容</label>
            <span :class="{ invalid: !jsonValidation.valid }">{{ jsonValidation.message }}</span>
          </div>
          <textarea
            id="danmaku-template-json"
            v-model="editedDanmakus"
            class="template-json-editor have-scrollbar"
            spellcheck="false"
          />

          <div class="template-footer">
            <span class="template-status" :class="statusTone">{{ statusMessage }}</span>
            <div class="template-actions">
              <button class="template-danger-button" type="button" :disabled="mutating" @click="deleteSelected">删除</button>
              <button class="template-secondary-button" type="button" :disabled="!jsonValidation.valid" @click="formatEditedJson">格式化</button>
              <button class="template-secondary-button" type="button" :disabled="mutating" @click="insertSelected">插入</button>
              <button
                class="template-primary-button"
                type="button"
                :disabled="mutating || !nameValidation.valid || !jsonValidation.valid"
                @click="saveSelected"
              >保存</button>
            </div>
          </div>
        </main>

        <main v-else class="template-no-selection">
          <span>选择模板以查看或编辑内容</span>
        </main>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { isTauriRuntime } from '@/utils/tauriBackend'
import { useNoticeStore } from '@/store/notice'
import { useHelpStore } from '@/store/help'
import { normalizeColor } from '@/utils/validation'

const store = useEditorStore()
const notice = useNoticeStore()
const help = useHelpStore()
const statusMessage = ref('')
const statusTone = ref<'success' | 'error'>('success')
const editedName = ref('')
const editedDanmakus = ref('[]')
const searchQuery = ref('')
const refreshing = ref(false)
const mutating = ref(false)
const loadedTemplateName = ref<string | null>(null)

onMounted(() => window.addEventListener('keydown', handleTemplateShortcuts))
onBeforeUnmount(() => window.removeEventListener('keydown', handleTemplateShortcuts))

const filteredTemplates = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return store.danmakuTemplates
  return store.danmakuTemplates.filter((template) =>
    template.name.toLocaleLowerCase().includes(query)
  )
})

const selectedTemplate = computed(() => store.danmakuTemplates.find(
  (template) => template.name === store.selectedDanmakuTemplateName
))

function normalizeTemplateNameInput(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '')
}

const nameValidation = computed(() => {
  const current = selectedTemplate.value
  if (!current) return { valid: false, message: '未选择模板' }
  const normalized = normalizeTemplateNameInput(editedName.value)
  if (!normalized) {
    return { valid: false, message: '模板名称不能为空或仅含非法字符' }
  }
  const duplicate = store.danmakuTemplates.some(
    (item) => item.name === normalized && item.name !== current.name
  )
  if (duplicate) {
    return { valid: false, message: '模板名称已存在' }
  }
  return { valid: true, message: '' }
})

function validateTemplateItems(danmakus: unknown[]): string | null {
  for (let i = 0; i < danmakus.length; i++) {
    const item = danmakus[i] as Record<string, any>
    const idx = i + 1
    if (!store.allowNegativeValues && item.startTime < 0) {
      return `第 ${idx} 条弹幕 startTime 不能为负数`
    }
    if (item.layer < 0) {
      return `第 ${idx} 条弹幕 layer 不能为负数`
    }
    if (item.content.size < 10 || item.content.size > 127) {
      return `第 ${idx} 条弹幕字号必须在 10 ~ 127 之间`
    }
    if (!normalizeColor(item.content.color)) {
      return `第 ${idx} 条弹幕颜色格式无效`
    }
    if (item.opacity.from < 0 || item.opacity.from > 1 || item.opacity.to < 0 || item.opacity.to > 1) {
      return `第 ${idx} 条弹幕透明度必须在 0 ~ 1 之间`
    }
    if (item.animation.duration !== undefined && item.animation.duration <= 0) {
      return `第 ${idx} 条弹幕生存时间 (duration) 必须大于 0`
    }
    if (item.animation.moveDuration < 0 || item.animation.delay < 0) {
      return `第 ${idx} 条弹幕运动时间与延迟不能为负数`
    }
  }
  return null
}

const jsonValidation = computed(() => {
  try {
    const danmakus: unknown = JSON.parse(editedDanmakus.value)
    if (!Array.isArray(danmakus)) return { valid: false, message: '内容必须是弹幕数组' }
    if (!store.isValidDanmakuTemplateContent(danmakus)) {
      return { valid: false, message: '弹幕结构无效或内容为空' }
    }
    const detailError = validateTemplateItems(danmakus)
    if (detailError) {
      return { valid: false, message: detailError }
    }
    return {
      valid: true,
      message: `${danmakus.length} 条弹幕格式有效`
    }
  } catch {
    return { valid: false, message: 'JSON 格式错误' }
  }
})

watch(selectedTemplate, (template) => {
  const nextName = template?.name ?? null
  if (nextName !== loadedTemplateName.value) {
    loadedTemplateName.value = nextName
    editedName.value = template?.name || ''
    editedDanmakus.value = JSON.stringify(template?.danmakus || [], null, 2)
  }
}, { immediate: true })

void store.loadDanmakuTemplates().catch((error) => showStatus(errorMessage(error), 'error'))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function showStatus(message: string, tone: 'success' | 'error') {
  statusMessage.value = message
  statusTone.value = tone
  notice.log(message, tone)
}

function close() {
  store.showTemplateManager = false
}

function handleTemplateShortcuts(e: KeyboardEvent) {
  if (!store.showTemplateManager || notice.isVisible || help.isVisible) return
  if (e.isComposing || e.keyCode === 229 || isTextEditingTarget(e.target)) return

  const isCtrl = e.ctrlKey || e.metaKey
  const isAlt = e.altKey
  const isShift = e.shiftKey
  if (isCtrl || isAlt || isShift || e.repeat) return

  if (
    e.key === 'Enter' &&
    e.target instanceof HTMLElement &&
    e.target.closest('button:not(.template-list-item), a')
  ) {
    return
  }

  const key = e.key.toLowerCase()
  const action = key === 'c' ? createFromSelection
    : key === 'r' ? refreshTemplates
      : e.key === 'Delete' ? deleteSelected
        : e.key === 'Enter' ? insertSelected
          : key === 's' ? saveSelected
            : null

  if (!action) return
  e.preventDefault()
  void action()
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.matches('input, textarea, select')
}

function selectTemplate(name: string) {
  statusMessage.value = ''
  store.selectDanmakuTemplate(name)
}

function formatEditedJson() {
  try {
    const danmakus: unknown = JSON.parse(editedDanmakus.value)
    if (!Array.isArray(danmakus)) {
      showStatus('内容必须是弹幕数组', 'error')
      return
    }
    editedDanmakus.value = JSON.stringify(danmakus, null, 2)
    showStatus('JSON 已格式化', 'success')
  } catch {
    showStatus('JSON 格式错误，无法格式化', 'error')
  }
}

async function refreshTemplates() {
  if (refreshing.value || mutating.value) return
  refreshing.value = true
  try {
    await store.refreshDanmakuTemplates()
    const current = selectedTemplate.value
    loadedTemplateName.value = current?.name ?? null
    editedName.value = current?.name || ''
    editedDanmakus.value = JSON.stringify(current?.danmakus || [], null, 2)
    showStatus('模板列表已刷新', 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  } finally {
    refreshing.value = false
  }
}

async function createFromSelection() {
  if (mutating.value) return
  mutating.value = true
  try {
    await store.createDanmakuTemplateFromSelection()
    showStatus('已从选中弹幕创建模板', 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  } finally {
    mutating.value = false
  }
}

function setReplacement(event: Event) {
  store.setDanmakuTemplateReplacement((event.target as HTMLInputElement).checked)
}

async function saveSelected() {
  const template = selectedTemplate.value
  if (!template || mutating.value || !nameValidation.value.valid || !jsonValidation.value.valid) return

  mutating.value = true
  try {
    const danmakus: unknown = JSON.parse(editedDanmakus.value)
    if (!Array.isArray(danmakus)) throw new Error('内容必须是弹幕对象数组')
    const oldName = template.name
    await store.saveDanmakuTemplate(oldName, editedName.value, danmakus)
    const savedTemplate = selectedTemplate.value
    const savedName = savedTemplate?.name || normalizeTemplateNameInput(editedName.value)
    loadedTemplateName.value = savedName
    editedName.value = savedName
    editedDanmakus.value = JSON.stringify(savedTemplate?.danmakus || danmakus, null, 2)
    showStatus(`模板：${savedName} 的更改已保存`, 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  } finally {
    mutating.value = false
  }
}

function insertSelected() {
  if (!store.insertSelectedDanmakuTemplate()) {
    showStatus('请选择有效模板', 'error')
    return
  }
  showStatus('模板已插入弹幕列表', 'success')
}

async function deleteSelected() {
  const template = selectedTemplate.value
  if (!template || mutating.value) return

  const confirmed = await notice.confirm(`确定要删除模板“${template.name}”吗？此操作不可撤销`)
  if (!confirmed) return

  mutating.value = true
  try {
    await store.deleteDanmakuTemplateByName(template.name)
    showStatus(`模板：${template.name} 已删除`, 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  } finally {
    mutating.value = false
  }
}
</script>

<style scoped>
.template-overlay {
  position: fixed;
  inset: 0;
  z-index: 9995;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(4px);
}

.template-dialog {
  width: min(960px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 24px));
  min-height: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #38383b;
  border-radius: 8px;
  background: #1e1e1e;
  color: #e5e5e5;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  border-bottom: 1px solid #353538;
  background: linear-gradient(180deg, #252526, #202021);
}

.template-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.template-header p {
  margin: 5px 0 0;
  color: #96969b;
  font-size: 12px;
}

.template-icon-button {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 4px;
  background: #222;
  color: #d8d8d8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.template-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(210px, 29%) minmax(0, 1fr);
}

.template-sidebar {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #353538;
  background: #202021;
}

.template-list-heading,
.template-content-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #bcbcc1;
  font-size: 12px;
}

.template-list-heading {
  padding: 10px 12px;
}

.template-list-heading span:last-child,
.template-content-heading span {
  color: #85858b;
}

.template-refresh-button {
  width: 27px;
  height: 27px;
  border: none;
  border-radius: 4px;
  background: #202021;
  color: #c8c8ce;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.template-refresh-button:hover:not(:disabled) {
  filter: brightness(1.3);
}

.template-refresh-button:disabled {
  opacity: 0.5;
  cursor: wait;
}

.template-content-heading span.invalid {
  color: #ee9696;
}

.template-create-button {
  margin: 0 10px 10px;
  padding: 9px 10px;
  border: 1px solid #38534d;
  border-radius: 4px;
  background: #223430;
  color: #a9ded2;
  text-align: left;
  cursor: pointer;
}

.template-create-button span {
  margin-right: 5px;
  font-size: 16px;
}

.template-create-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.template-list {
  min-height: 0;
  overflow: auto;
  padding: 0 10px 10px;
}

.template-list-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  margin: 0 0 5px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #d7d7da;
  text-align: left;
  cursor: pointer;
}

.template-list-item:hover {
  background: #29292c;
}

.template-list-item.active {
  background: #117865;
  border-color: #159981;
  color: #fff;
}

.template-list-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-empty,
.template-no-selection {
  display: grid;
  place-items: center;
  color: #77777d;
  font-size: 13px;
}

.template-empty {
  flex: 1;
}

.template-editor {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 17px 18px 14px;
  background: #1e1e1f;
}

.template-field {
  display: grid;
  gap: 6px;
  color: #bcbcc1;
  font-size: 12px;
}

.template-field input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #414145;
  border-radius: 4px;
  outline: none;
  background: #252527;
  color: #ededed;
}

.template-field input:focus,
.template-json-editor:focus {
  border-color: #4ec9b0;
}

.template-replacement {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #cacacf;
  font-size: 12px;
  padding: 0 9px 10px;
}

.template-replacement input {
  accent-color: #117865;
}

.template-content-heading {
  margin-top: 2px;
}

.template-json-editor {
  flex: 1;
  min-height: 100px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid #414145;
  border-radius: 4px;
  outline: none;
  resize: none;
  background: #252527;
  color: #d8d8dc;
  font: 12px/1.55 Consolas, 'Courier New', monospace;
  tab-size: 2;
}

.template-footer {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.template-status {
  min-width: 0;
  overflow: hidden;
  color: #82cbb7;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-status.error {
  color: #ee9696;
}

.template-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.template-actions button {
  padding: 7px 14px;
  border: 1px solid #48484c;
  border-radius: 3px;
  background: #2c2c2f;
  color: #dedee2;
  cursor: pointer;
}

.template-actions .template-danger-button {
    background: #5c2018;
    color: #ffb3b3;
    border-color: #8a2e24;
}

.template-actions .template-primary-button {
  border: 1px solid #0f6d5f;
  background: #117865;
  color: #fff;
}

.template-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.template-actions button:hover,
.template-icon-button:hover {
  filter: brightness(1.15);
}

@media (max-width: 620px) {
  .template-overlay {
    padding: 8px;
  }

  .template-dialog {
    height: min(760px, 100%);
  }

  .template-body {
    grid-template-columns: 130px minmax(0, 1fr);
  }

  .template-editor {
    padding: 12px 10px;
  }

  .template-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .template-actions {
    align-self: flex-end;
  }
}

.template-search-row {
  padding: 0 10px 8px;
}

.template-search-input {
  width: 100%;
  box-sizing: border-box;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #3b3b40;
  border-radius: 4px;
  background: #28282b;
  color: #e5e5e8;
  font-size: 12px;
  outline: none;
}

.template-search-input:focus {
  border-color: #4ec9b0;
}

.template-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.invalid-hint {
  color: #ee9696;
}
</style>