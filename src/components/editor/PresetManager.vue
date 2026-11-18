<template>
  <aside class="preset-manager">
    <section class="preset-card action-card">
      <button class="action-btn" type="button" @click="openImportDialog">
        导入预设
      </button>
      <button
        class="action-btn"
        type="button"
        :disabled="presets.length === 0"
        @click="handleExport"
      >
        导出预设
      </button>
      <button class="action-btn primary" type="button" @click="$emit('add-current')">
        添加预设
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".prs"
        class="hidden-input"
        @change="handleImportFileChange"
      />
    </section>

    <section class="preset-card">
      <div class="section-header">
        <h3>预设列表</h3>
        <span class="section-hint">{{ filteredPresets.length }}/{{ presets.length }} 项</span>
      </div>

      <div v-if="presets.length > 0" class="preset-search-row">
        <input
          v-model="searchQuery"
          type="text"
          class="preset-search-input"
          placeholder="筛选预设..."
          aria-label="筛选预设"
        />
      </div>

      <div v-if="presets.length === 0" class="empty-state">
        暂无预设
      </div>

      <div v-else-if="filteredPresets.length === 0" class="empty-state">
        未找到匹配的预设
      </div>

      <div v-else class="preset-list">
        <button
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="preset-item"
          type="button"
          @click="$emit('apply-preset', preset.id)"
        >
          <span class="preset-name">{{ preset.name }}</span>
          <span class="preset-time">{{ formatPresetTime(preset.createdAt) }}</span>
        </button>
      </div>
    </section>

    <section class="preset-card">
      <button
        class="manager-toggle"
        type="button"
        :aria-expanded="managementExpanded"
        @click="managementExpanded = !managementExpanded"
      >
        <span>预设管理</span>
        <span class="toggle-indicator">{{ managementExpanded ? '收起' : '展开' }}</span>
      </button>

      <div
        v-if="managementExpanded"
        class="manager-panel"
      >
        <div class="manager-hint">
          单击选中管理项，再次点击或点击按钮重命名，`Delete` 删除当前管理选中预设
        </div>

        <div v-if="presets.length === 0" class="empty-state">
          暂无可管理预设
        </div>

        <div v-else-if="filteredPresets.length === 0" class="empty-state">
          未找到匹配的预设
        </div>

        <div v-else class="manager-list">
          <div
            v-for="preset in filteredPresets"
            :key="preset.id"
            class="manager-item"
            :class="{ active: preset.id === managedPresetId }"
            @click="handleManagerRowClick(preset.id)"
          >
            <input
              v-if="editingPresetId === preset.id"
              ref="editingInputRef"
              v-model="editingName"
              class="rename-input"
              type="text"
              maxlength="100"
              @click.stop
              @keydown.enter.prevent="commitRename"
              @keydown.escape.prevent.stop="cancelRename"
              @blur="commitRename"
            />
            <template v-else>
              <div class="manager-row-top">
                <span class="manager-name">{{ preset.name }}</span>
                <div class="manager-row-actions">
                  <button
                    type="button"
                    class="row-action-btn"
                    title="重命名"
                    @click.stop="startRename(preset.id)"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    class="row-action-btn danger"
                    title="删除预设"
                    @click.stop="requestDeletePreset(preset)"
                  >
                    删除
                  </button>
                </div>
              </div>
              <span class="manager-meta">{{ formatPresetTime(preset.createdAt) }}</span>
            </template>
          </div>
        </div>
      </div>
    </section>

    <div v-if="statusMessage" class="preset-status" :class="statusTone">
      {{ statusMessage }}
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CreationToolPreset } from '@/utils/toolPresets'
import { parsePresetImport, serializePresetExport } from '@/utils/toolPresets'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import { useHelpStore } from '@/store/help'

const props = defineProps<{
  presets: CreationToolPreset[]
  managedPresetId: string | null
}>()

const emit = defineEmits<{
  (e: 'add-current'): void
  (e: 'apply-preset', presetId: string): void
  (e: 'select-managed-preset', presetId: string | null): void
  (e: 'rename-preset', payload: { presetId: string; name: string }): void
  (e: 'delete-preset', presetId: string): void
  (e: 'import-presets', presets: CreationToolPreset[]): void
}>()

const store = useEditorStore()
const notice = useNoticeStore()
const help = useHelpStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const editingInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const managementExpanded = ref(false)
const editingPresetId = ref<string | null>(null)
const editingName = ref('')
const searchQuery = ref('')
const statusMessage = ref('')
const statusTone = ref<'info' | 'success' | 'error'>('info')

const filteredPresets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return props.presets
  return props.presets.filter((preset) => preset.name.toLocaleLowerCase().includes(query))
})

function setStatus(message: string, tone: 'info' | 'success' | 'error') {
  statusMessage.value = message
  statusTone.value = tone
  if (message) {
    notice.log(`[预设] ${message}`, tone)
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

function openImportDialog() {
  fileInputRef.value?.click()
}

async function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const presets = parsePresetImport(text)
    emit('import-presets', presets)
    setStatus(`${presets.length} 个预设导入成功`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '预设导入失败', 'error')
  } finally {
    if (input) {
      input.value = ''
    }
  }
}

async function handleExport() {
  if (props.presets.length === 0) {
    return
  }
  try {
    const payload = serializePresetExport(props.presets)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })

    await store.saveBlob(blob, 'creation-tool-presets.prs', {
      description: 'Creation Tool Preset File',
      accept: {
        'application/json': ['.prs']
      }
    })

    setStatus(`已导出 ${props.presets.length} 个预设`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '预设导出失败', 'error')
  }
}

function handleManagerRowClick(presetId: string) {
  if (editingPresetId.value === presetId) {
    return
  }

  if (props.managedPresetId === presetId) {
    startRename(presetId)
    return
  }

  emit('select-managed-preset', presetId)
}

function startRename(presetId: string) {
  const preset = props.presets.find((item) => item.id === presetId)
  if (!preset) {
    return
  }

  emit('select-managed-preset', presetId)
  editingPresetId.value = presetId
  editingName.value = preset.name

  void nextTick(() => {
    const input = getEditingInputElement()
    input?.focus()
    input?.select()
  })
}

function commitRename() {
  if (!editingPresetId.value) {
    return
  }

  const trimmed = editingName.value.trim()
  const targetId = editingPresetId.value
  editingPresetId.value = null

  if (!trimmed) {
    setStatus('预设名称不能为空', 'error')
    return
  }

  const current = props.presets.find((item) => item.id === targetId)
  if (current && current.name === trimmed) {
    return
  }

  emit('rename-preset', {
    presetId: targetId,
    name: trimmed
  })
}

function cancelRename() {
  editingPresetId.value = null
  editingName.value = ''
}

async function requestDeletePreset(preset: CreationToolPreset) {
  const confirmed = await notice.confirm(`确定要删除预设“${preset.name}”吗？`)
  if (!confirmed) {
    return
  }
  if (editingPresetId.value === preset.id) {
    cancelRename()
  }
  emit('delete-preset', preset.id)
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!managementExpanded.value || !props.managedPresetId || editingPresetId.value) {
    return
  }

  if (notice.isVisible || help.isVisible) {
    return
  }

  if (event.repeat || event.isComposing || event.keyCode === 229) {
    return
  }

  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return
  }

  if (isTextEditingTarget(event.target)) {
    return
  }

  if (event.key === 'Delete') {
    const targetPreset = props.presets.find((item) => item.id === props.managedPresetId)
    if (!targetPreset) {
      return
    }
    event.preventDefault()
    void requestDeletePreset(targetPreset)
  }
}

function formatPresetTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

watch(
  () => props.presets,
  (nextPresets) => {
    if (editingPresetId.value && !nextPresets.some((item) => item.id === editingPresetId.value)) {
      cancelRename()
    }
    if (props.managedPresetId && !nextPresets.some((item) => item.id === props.managedPresetId)) {
      emit('select-managed-preset', null)
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
.preset-manager {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0px 0 0px 12px;
  box-sizing: border-box;
}

.preset-card {
  border: 1px solid #333;
  border-radius: 10px;
  background: #1b1b1d;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.action-card {
  display: grid;
  gap: 1px;
  background: #2a2a2d;
}

.action-btn,
.manager-toggle,
.preset-item {
  border: none;
  background: #252528;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.2s ease;
}

.action-btn {
  padding: 11px 14px;
  font-size: 13px;
  text-align: left;
}

.action-btn:hover:not(:disabled),
.manager-toggle:hover,
.preset-item:hover {
  background: #303035;
}

.action-btn.primary {
  color: #9cdcfe;
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #2f2f33;
}

.section-header h3 {
  margin: 0;
  font-size: 13px;
  color: #d7ba7d;
}

.section-hint,
.manager-hint,
.preset-time,
.manager-meta,
.toggle-indicator {
  font-size: 11px;
  color: #8e8e93;
}

.empty-state {
  padding: 14px;
  font-size: 12px;
  color: #7e7e83;
}

.preset-list,
.manager-list {
  max-height: 240px;
  overflow-y: auto;
}

.preset-item {
  width: 100%;
  padding: 12px 14px;
  border-top: 1px solid #2a2a2d;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
}

.preset-name,
.manager-name {
  font-size: 13px;
  color: #efefef;
  word-break: break-all;
}

.manager-toggle {
  width: 100%;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.manager-panel {
  border-top: 1px solid #2f2f33;
}

.manager-hint {
  padding: 10px 14px;
  border-bottom: 1px solid #2a2a2d;
}

.manager-item {
  padding: 10px 14px;
  border-top: 1px solid #2a2a2d;
  cursor: pointer;
  transition: background 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manager-item:hover {
  background: #2b2b30;
}

.manager-item.active {
  background: #243744;
}

.manager-item.active:hover {
  background: #2b4251;
}

.rename-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #4d88ad;
  border-radius: 3px;
  background: #303033;
  color: #f0f0f0;
  box-sizing: border-box;
}

.rename-input:focus {
  outline: none;
}

.preset-status {
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #1b1b1d;
  font-size: 12px;
  color: #9aa0a6;
}

.preset-status.success {
  color: #9cdc87;
}

.preset-status.error {
  color: #ff9b9b;
}

.hidden-input {
  display: none;
}

.preset-list::-webkit-scrollbar,
.manager-list::-webkit-scrollbar {
  width: 8px;
}

.preset-list::-webkit-scrollbar-track,
.manager-list::-webkit-scrollbar-track {
  background: #1b1b1d;
}

.preset-list::-webkit-scrollbar-thumb,
.manager-list::-webkit-scrollbar-thumb {
  background: #48484d;
  border-radius: 4px;
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

.manager-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.manager-row-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.row-action-btn {
  padding: 2px 6px;
  border: 1px solid #444;
  border-radius: 3px;
  background: #2f2f34;
  color: #d6d6dc;
  font-size: 11px;
  cursor: pointer;
}

.row-action-btn:hover {
  background: #3d3d43;
}

.row-action-btn.danger {
  border-color: #7c352d;
  background: #4b201b;
  color: #ffb3b3;
}

.row-action-btn.danger:hover {
  background: #682b24;
}

@media (max-width: 860px) {
  .preset-manager {
    width: 100%;
    padding: 12px 0 0;
  }
}
</style>
