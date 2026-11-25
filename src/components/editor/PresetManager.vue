<template>
  <aside class="preset-manager">
    <section class="preset-card header-card">
      <div class="header-top">
        <div>
          <h3>规则预设</h3>
        </div>
        <div class="header-right">
          <span class="section-hint">{{ filteredPresets.length }}/{{ store.creationToolPresets.length }}</span>
          <button
            v-if="isTauriRuntime()"
            class="refresh-btn"
            type="button"
            title="刷新预设列表"
            aria-label="刷新预设列表"
            :disabled="refreshing || mutating"
            @click="handleRefresh"
          >⟲</button>
        </div>
      </div>
      <p class="header-subtitle">
        {{ isTauriRuntime() ? '同步至 Documents/m7-editor/presets' : '保存在浏览器本地存储' }}
      </p>
    </section>

    <section class="preset-card action-card">
      <button class="action-btn primary" type="button" :disabled="mutating" @click="handleCreatePreset">
        新建预设
      </button>
      <button class="action-btn" type="button" :disabled="mutating" @click="openImportDialog">
        导入预设
      </button>
      <button
        class="action-btn"
        type="button"
        :disabled="store.creationToolPresets.length === 0 || mutating"
        @click="handleExport"
      >
        导出预设
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".prs,.json"
        class="hidden-input"
        @change="handleImportFileChange"
      />
    </section>

    <section v-if="activePreset" class="preset-card active-bar-card">
      <div class="active-bar-header">
        <span class="active-bar-name" :title="activePreset.name">{{ activePreset.name }}</span>
        <span v-if="isDirty" class="dirty-badge">未保存</span>
        <span v-else class="synced-badge">已同步</span>
      </div>
      <div class="active-bar-actions">
        <button
          type="button"
          class="bar-btn primary"
          :disabled="!isDirty || mutating"
          @click="handleSaveActive"
        >
          保存更改
        </button>
        <button
          type="button"
          class="bar-btn"
          :disabled="!isDirty || mutating"
          @click="handleRevertActive"
        >
          还原
        </button>
        <button
          type="button"
          class="bar-btn"
          :disabled="mutating"
          @click="handleSaveAsNew"
        >
          另存为
        </button>
      </div>
    </section>

    <section class="preset-card preset-list-card">
      <div v-if="store.creationToolPresets.length > 0" class="preset-search-row">
        <input
          v-model="searchQuery"
          type="text"
          class="preset-search-input"
          placeholder="筛选预设..."
          aria-label="筛选预设"
        />
      </div>

      <div v-if="store.creationToolPresets.length === 0" class="empty-state">
        暂无预设
      </div>

      <div v-else-if="filteredPresets.length === 0" class="empty-state">
        未找到匹配的预设
      </div>

      <div v-else class="preset-list have-scrollbar">
        <div
          v-for="preset in filteredPresets"
          :key="preset.name"
          class="preset-row"
          :class="{ active: preset.name === activePresetName }"
          @click="handleRowClick(preset)"
        >
          <input
            v-if="editingPresetName === preset.name"
            ref="editingInputRef"
            v-model="editingName"
            class="rename-input"
            type="text"
            maxlength="180"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.escape.prevent.stop="cancelRename"
            @blur="commitRename"
          />
          <template v-else>
            <div class="preset-row-top">
              <span class="preset-name" :title="preset.name">{{ preset.name }}</span>
              <span class="preset-time">{{ formatPresetTime(preset.lastChangeAt || preset.createdAt) }}</span>
            </div>
            <div class="preset-row-actions">
              <button
                type="button"
                class="row-action-btn"
                title="编辑结构 JSON"
                :disabled="mutating"
                @click="openJsonEditor(preset)"
              >
                编辑
              </button>
              <button
                type="button"
                class="row-action-btn"
                title="重命名"
                :disabled="mutating"
                @click="startRename(preset.name)"
              >
                重命名
              </button>
              <button
                type="button"
                class="row-action-btn danger"
                title="删除预设"
                :disabled="mutating"
                @click="requestDeletePreset(preset)"
              >
                删除
              </button>
            </div>
          </template>
        </div>
      </div>
    </section>

    <div
      v-if="jsonEditorTarget"
      class="preset-json-overlay"
      @mousedown.self="closeJsonEditor"
    >
      <section class="preset-json-dialog" role="dialog" aria-modal="true" aria-label="编辑预设结构">
        <header class="json-dialog-header">
          <div>
            <h3>编辑预设结构</h3>
            <p v-if="isTauriRuntime()">同步至 Documents/m7-editor/presets/{{ jsonNameValidation.normalized || jsonEditorTarget.name }}.json</p>
            <p v-else>修改预设名称与规则配置 JSON</p>
          </div>
          <button type="button" class="json-close-btn" aria-label="关闭" @click="closeJsonEditor">✕</button>
        </header>

        <div class="json-dialog-body">
          <label class="json-name-field">
            <div class="json-field-heading">
              <span>预设名称</span>
              <span v-if="!jsonNameValidation.valid" class="invalid-hint">{{ jsonNameValidation.message }}</span>
            </div>
            <input v-model="jsonEditorName" type="text" maxlength="180" />
          </label>

          <div class="json-field-heading">
            <label for="creation-preset-state-json">预设状态 JSON (state)</label>
            <span :class="{ 'invalid-hint': !jsonStateValidation.valid, 'valid-hint': jsonStateValidation.valid }">
              {{ jsonStateValidation.message }}
            </span>
          </div>

          <textarea
            id="creation-preset-state-json"
            v-model="jsonEditorText"
            class="json-editor-textarea have-scrollbar"
            spellcheck="false"
          />
        </div>

        <footer class="json-dialog-footer">
          <button
            type="button"
            class="json-secondary-btn"
            :disabled="mutating"
            @click="fillJsonFromCurrentPanel"
          >
            从当前面板填入
          </button>
          <button
            type="button"
            class="json-secondary-btn"
            :disabled="!jsonStateValidation.valid || mutating"
            @click="formatJsonEditor"
          >
            格式化
          </button>
          <div class="json-footer-spacer" />
          <button type="button" class="json-secondary-btn" :disabled="mutating" @click="closeJsonEditor">
            取消
          </button>
          <button
            type="button"
            class="json-primary-btn"
            :disabled="mutating || !jsonNameValidation.valid || !jsonStateValidation.valid"
            @click="saveJsonEditor"
          >
            保存
          </button>
        </footer>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore, saveBlobWithFallback } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { useHelpStore } from '@/store/help'
import { isTauriRuntime } from '@/utils/tauriBackend'
import {
  createDefaultPresetName,
  deduplicatePresetName,
  normalizeCreationPresetName,
  parsePresetImport,
  serializePresetExport,
  validateCreationPanelStateStrict,
  type CreationToolPanelState,
  type CreationToolPresetRecord
} from '@/utils/toolPresets'

const props = defineProps<{
  activePresetName: string | null
  isDirty: boolean
  getPanelState: () => CreationToolPanelState
}>()

const emit = defineEmits<{
  (e: 'apply-preset', preset: CreationToolPresetRecord): void
  (e: 'revert-preset', preset: CreationToolPresetRecord): void
  (e: 'active-preset-change', name: string | null): void
  (e: 'sync-active-state', state: CreationToolPanelState): void
  (e: 'status', message: string): void
}>()

const store = useEditorStore()
const notice = useNoticeStore()
const help = useHelpStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const editingInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const editingPresetName = ref<string | null>(null)
const editingName = ref('')
const searchQuery = ref('')
const refreshing = ref(false)
const mutating = ref(false)

const jsonEditorTarget = ref<CreationToolPresetRecord | null>(null)
const jsonEditorName = ref('')
const jsonEditorText = ref('')

const filteredPresets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return store.creationToolPresets
  return store.creationToolPresets.filter((preset) => preset.name.toLocaleLowerCase().includes(query))
})

const activePreset = computed(() => {
  if (!props.activePresetName) return null
  return store.creationToolPresets.find((preset) => preset.name === props.activePresetName) ?? null
})

const jsonNameValidation = computed(() => {
  const target = jsonEditorTarget.value
  if (!target) return { valid: false, normalized: '', message: '未选择预设' }
  const normalized = normalizeCreationPresetName(jsonEditorName.value)
  if (!normalized) {
    return { valid: false, normalized: '', message: '预设名称不能为空或仅含非法字符' }
  }
  const duplicate = store.creationToolPresets.some(
    (item) => item.name !== target.name && item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase()
  )
  if (duplicate) {
    return { valid: false, normalized, message: '同名预设已存在' }
  }
  return { valid: true, normalized, message: '' }
})

const jsonStateValidation = computed<
  | { valid: true; message: string; state: CreationToolPanelState }
  | { valid: false; message: string }
>(() => {
  try {
    const parsed: unknown = JSON.parse(jsonEditorText.value.replace(/^\uFEFF/, ''))
    const candidate = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'state' in parsed
      ? (parsed as Record<string, unknown>).state
      : parsed
    const validated = validateCreationPanelStateStrict(candidate)
    if (!validated.valid) {
      return { valid: false, message: validated.message }
    }
    return { valid: true, message: '结构有效', state: validated.state }
  } catch {
    return { valid: false, message: 'JSON 语法错误' }
  }
})

function setStatus(message: string, tone: 'info' | 'success' | 'error') {
  if (message) {
    notice.log(`[预设] ${message}`, tone)
    emit('status', message)
  }
}

function getEditingInputElement(): HTMLInputElement | null {
  const target = editingInputRef.value
  if (Array.isArray(target)) {
    return target[0] ?? null
  }
  return target
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

async function handleRefresh() {
  if (refreshing.value || mutating.value) return
  refreshing.value = true
  try {
    await store.refreshCreationToolPresets()
    if (props.activePresetName) {
      const refreshed = store.creationToolPresets.find((item) => item.name === props.activePresetName)
      if (!refreshed) {
        emit('active-preset-change', null)
      } else if (!props.isDirty) {
        emit('sync-active-state', refreshed.state)
      }
    }
    setStatus('预设列表已刷新', 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '刷新预设列表失败', 'error')
  } finally {
    refreshing.value = false
  }
}

async function handleCreatePreset() {
  if (mutating.value) return
  mutating.value = true
  try {
    const name = createDefaultPresetName(store.creationToolPresets)
    const created = await store.createCreationToolPreset(name, props.getPanelState())
    emit('active-preset-change', created.name)
    setStatus(`已创建预设：${created.name}`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '创建预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

async function handleSaveActive() {
  const current = activePreset.value
  if (!current || !props.isDirty || mutating.value) return
  mutating.value = true
  try {
    const updated = await store.updateCreationToolPreset(current.name, props.getPanelState())
    setStatus(`已保存预设更改：${updated.name}`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

function handleRevertActive() {
  const current = activePreset.value
  if (!current || !props.isDirty || mutating.value) return
  emit('revert-preset', current)
  setStatus(`已还原预设：${current.name}`, 'info')
}

async function handleSaveAsNew() {
  const current = activePreset.value
  if (!current || mutating.value) return
  mutating.value = true
  try {
    const baseName = `${current.name} 副本`
    const targetName = deduplicatePresetName(baseName, store.creationToolPresets.map((item) => item.name))
    const created = await store.createCreationToolPreset(targetName, props.getPanelState())
    emit('active-preset-change', created.name)
    setStatus(`已另存为新预设：${created.name}`, 'success')
    startRename(created.name)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '另存为预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

function openImportDialog() {
  fileInputRef.value?.click()
}

async function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  mutating.value = true
  try {
    const text = await file.text()
    const stem = file.name.replace(/\.[^.]+$/, '')
    const parsed = parsePresetImport(text, stem)
    const created = await store.importCreationToolPresets(parsed)
    setStatus(`已导入 ${created.length} 个预设，可在列表中点击应用`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '预设导入失败', 'error')
  } finally {
    mutating.value = false
    if (input) {
      input.value = ''
    }
  }
}

async function handleExport() {
  if (store.creationToolPresets.length === 0) return
  try {
    const payload = serializePresetExport(store.creationToolPresets, store.version)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    await saveBlobWithFallback(blob, 'creation-tool-presets.prs', {
      description: 'Creation Tool Preset File',
      accept: { 'application/json': ['.prs'] }
    })
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '预设导出失败', 'error')
  }
}

function handleRowClick(preset: CreationToolPresetRecord) {
  if (editingPresetName.value === preset.name) return
  emit('apply-preset', preset)
}

function startRename(name: string) {
  if (mutating.value) return
  const preset = store.creationToolPresets.find((item) => item.name === name)
  if (!preset) return
  editingPresetName.value = preset.name
  editingName.value = preset.name

  void nextTick(() => {
    const input = getEditingInputElement()
    input?.focus()
    input?.select()
  })
}

async function commitRename() {
  const oldName = editingPresetName.value
  if (!oldName || mutating.value) return
  editingPresetName.value = null

  const normalized = normalizeCreationPresetName(editingName.value)
  if (!normalized) {
    setStatus('预设名称不能为空或仅含非法字符', 'error')
    return
  }
  if (normalized === oldName) return

  const duplicate = store.creationToolPresets.some(
    (item) => item.name !== oldName && item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase()
  )
  if (duplicate) {
    setStatus('同名预设已存在', 'error')
    return
  }

  mutating.value = true
  try {
    const actualName = await store.renameCreationToolPreset(oldName, normalized)
    if (props.activePresetName === oldName) {
      emit('active-preset-change', actualName)
    }
    setStatus(`已重命名预设：${actualName}`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重命名预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

function cancelRename() {
  editingPresetName.value = null
  editingName.value = ''
}

async function requestDeletePreset(preset: CreationToolPresetRecord) {
  if (mutating.value) return

  if (editingPresetName.value === preset.name) {
    cancelRename()
  }

  mutating.value = true
  try {
    await store.deleteCreationToolPreset(preset.name)
    if (props.activePresetName === preset.name) {
      emit('active-preset-change', null)
    }
    setStatus(`已删除预设：${preset.name}`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '删除预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

function openJsonEditor(preset: CreationToolPresetRecord) {
  if (mutating.value) return
  jsonEditorTarget.value = preset
  jsonEditorName.value = preset.name
  jsonEditorText.value = JSON.stringify(preset.state, null, 2)
}

function closeJsonEditor() {
  if (mutating.value) return
  jsonEditorTarget.value = null
  jsonEditorName.value = ''
  jsonEditorText.value = ''
}

function fillJsonFromCurrentPanel() {
  jsonEditorText.value = JSON.stringify(props.getPanelState(), null, 2)
}

function formatJsonEditor() {
  if (!jsonStateValidation.value.valid) return
  jsonEditorText.value = JSON.stringify(jsonStateValidation.value.state, null, 2)
}

async function saveJsonEditor() {
  const target = jsonEditorTarget.value
  if (!target || mutating.value || !jsonNameValidation.value.valid || !jsonStateValidation.value.valid) {
    return
  }

  mutating.value = true
  try {
    const oldName = target.name
    const saved = await store.saveCreationToolPreset(
      oldName,
      jsonNameValidation.value.normalized,
      jsonStateValidation.value.state
    )
    if (props.activePresetName === oldName) {
      if (saved.name !== oldName) {
        emit('active-preset-change', saved.name)
      }
      emit('sync-active-state', saved.state)
    }
    jsonEditorTarget.value = null
    jsonEditorName.value = ''
    jsonEditorText.value = ''
    setStatus(`已保存预设：${saved.name}`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存预设失败', 'error')
  } finally {
    mutating.value = false
  }
}

function handleKeydownCapture(event: KeyboardEvent) {
  if (notice.isVisible || help.isVisible) return
  if (event.isComposing || event.keyCode === 229) return

  if (event.key === 'Escape') {
    if (jsonEditorTarget.value) {
      event.preventDefault()
      event.stopPropagation()
      closeJsonEditor()
      return
    }
    if (editingPresetName.value) {
      event.preventDefault()
      event.stopPropagation()
      cancelRename()
      return
    }
  }

  if (
    event.key === 'Delete' &&
    !jsonEditorTarget.value &&
    !editingPresetName.value &&
    props.activePresetName &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    !isTextEditingTarget(event.target)
  ) {
    const targetPreset = store.creationToolPresets.find((item) => item.name === props.activePresetName)
    if (!targetPreset) return
    event.preventDefault()
    void requestDeletePreset(targetPreset)
  }
}

function formatPresetTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

watch(
  () => store.creationToolPresets,
  (nextPresets) => {
    if (editingPresetName.value && !nextPresets.some((item) => item.name === editingPresetName.value)) {
      cancelRename()
    }
    if (props.activePresetName && !nextPresets.some((item) => item.name === props.activePresetName)) {
      emit('active-preset-change', null)
    }
    if (jsonEditorTarget.value && !nextPresets.some((item) => item.name === jsonEditorTarget.value?.name)) {
      jsonEditorTarget.value = null
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydownCapture, { capture: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydownCapture, { capture: true })
})
</script>

<style scoped>
.preset-manager {
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 0 0 12px;
  box-sizing: border-box;
  min-height: 0;
}

.preset-card {
  border: 1px solid #333;
  border-radius: 10px;
  background: #1b1b1d;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  flex-shrink: 0;
}

.header-card {
  padding: 12px 14px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.header-top h3 {
  margin: 0;
  font-size: 13px;
  color: #d7ba7d;
}

.header-subtitle {
  margin: 4px 0 0;
  font-size: 11px;
  color: #8e8e93;
  line-height: 1.35;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.section-hint {
  font-size: 11px;
  color: #8e8e93;
}

.refresh-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: #1B1B1D;
  color: #c8c8ce;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.refresh-btn:hover:not(:disabled) {
  filter: brightness(1.3);
}

.refresh-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: #2a2a2d;
}

.action-btn {
  border: none;
  background: #252528;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.2s ease;
  padding: 9px 6px;
  font-size: 12px;
  text-align: center;
}

.action-btn:hover:not(:disabled) {
  background: #303035;
}

.action-btn.primary {
  color: #9cdcfe;
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.active-bar-card {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #1f2428;
  border-color: #36454f;
}

.active-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.active-bar-name {
  font-size: 12px;
  font-weight: 600;
  color: #f0f0f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-badge,
.synced-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.dirty-badge {
  background: #4e3b17;
  color: #f7c96d;
  border: 1px solid #7d5c20;
}

.synced-badge {
  background: #1d3c34;
  color: #82cbb7;
  border: 1px solid #2b5f52;
}

.active-bar-actions {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 6px;
}

.bar-btn {
  padding: 5px 6px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #2c2c30;
  color: #dcdce0;
  font-size: 11px;
  cursor: pointer;
}

.bar-btn.primary {
  border-color: #0f6d5f;
  background: #117865;
  color: #fff;
}

.bar-btn:hover:not(:disabled) {
  filter: brightness(1.15);
}

.bar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preset-list-card {
  flex: 1;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}

.preset-search-row {
  padding: 8px 10px;
  border-bottom: 1px solid #2a2a2d;
}

.preset-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  background: #2b2b2f;
  color: #e8e8e8;
  font-size: 12px;
}

.preset-search-input:focus {
  outline: none;
  border-color: #4ec9b0;
}

.empty-state {
  padding: 20px 14px;
  font-size: 12px;
  color: #7e7e83;
  text-align: center;
}

.preset-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.preset-row {
  padding: 10px 12px;
  border-top: 1px solid #2a2a2d;
  background: #222225;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: background 0.18s ease;
}

.preset-row:first-child {
  border-top: none;
}

.preset-row:hover {
  background: #2c2c31;
}

.preset-row.active {
  background: #1d3530;
  box-shadow: inset 3px 0 0 #159981;
}

.preset-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.preset-name {
  font-size: 13px;
  color: #efefef;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-time {
  flex-shrink: 0;
  font-size: 10px;
  color: #8e8e93;
}

.preset-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.row-action-btn {
  padding: 2px 7px;
  border: 1px solid #444;
  border-radius: 3px;
  background: #2f2f34;
  color: #d6d6dc;
  font-size: 11px;
  cursor: pointer;
}

.row-action-btn:hover:not(:disabled) {
  background: #3d3d43;
}

.row-action-btn.danger {
  border-color: #7c352d;
  background: #4b201b;
  color: #ffb3b3;
}

.row-action-btn.danger:hover:not(:disabled) {
  background: #682b24;
}

.row-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rename-input {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid #4d88ad;
  border-radius: 3px;
  background: #303033;
  color: #f0f0f0;
  box-sizing: border-box;
  font-size: 12px;
}

.rename-input:focus {
  outline: none;
}

.hidden-input {
  display: none;
}

.preset-json-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(4px);
}

.preset-json-dialog {
  width: min(860px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  border: 1px solid #3c3c40;
  border-radius: 8px;
  background: #1e1e1f;
  color: #e6e6e8;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}

.json-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 15px 18px;
  border-bottom: 1px solid #333336;
  background: #242426;
}

.json-dialog-header h3 {
  margin: 0;
  font-size: 16px;
}

.json-dialog-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #96969b;
}

.json-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: #2b2b2e;
  color: #d8d8d8;
  font-size: 16px;
  cursor: pointer;
}

.json-close-btn:hover {
  background: #3a3a3e;
}

.json-dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
}

.json-name-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.json-name-field input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #414145;
  border-radius: 4px;
  background: #252527;
  color: #ededed;
  outline: none;
}

.json-name-field input:focus,
.json-editor-textarea:focus {
  border-color: #4ec9b0;
}

.json-field-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #bcbcc1;
}

.invalid-hint {
  color: #ee9696;
}

.valid-hint {
  color: #82cbb7;
}

.json-editor-textarea {
  flex: 1;
  min-height: 160px;
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

.json-dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #333336;
  background: #222224;
}

.json-footer-spacer {
  flex: 1;
}

.json-secondary-btn,
.json-primary-btn {
  padding: 7px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.json-secondary-btn {
  border: 1px solid #48484c;
  background: #2c2c2f;
  color: #dedee2;
}

.json-primary-btn {
  border: 1px solid #0f6d5f;
  background: #117865;
  color: #fff;
}

.json-secondary-btn:hover:not(:disabled),
.json-primary-btn:hover:not(:disabled) {
  filter: brightness(1.15);
}

.json-secondary-btn:disabled,
.json-primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .preset-manager {
    width: 100%;
    padding: 12px 0 0;
  }

  .preset-list-card {
    max-height: 280px;
  }
}
</style>
