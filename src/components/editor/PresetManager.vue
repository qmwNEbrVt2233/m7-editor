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
        <span class="section-hint">{{ presets.length }} 项</span>
      </div>

      <div v-if="presets.length === 0" class="empty-state">
        暂无预设
      </div>

      <div v-else class="preset-list">
        <button
          v-for="preset in presets"
          :key="preset.id"
          class="preset-item"
          type="button"
          @click="$emit('apply-preset', preset.id)"
        >
          <span class="preset-name">{{ preset.name }}</span>
          <span class="preset-time">{{ formatPresetTime(preset.updatedAt) }}</span>
        </button>
      </div>
    </section>

    <section class="preset-card">
      <button
        class="manager-toggle"
        type="button"
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
          单击选中管理项，再次点击重命名，`Delete` 删除当前管理选中预设
        </div>

        <div v-if="presets.length === 0" class="empty-state">
          暂无可管理预设
        </div>

        <div v-else class="manager-list">
          <div
            v-for="preset in presets"
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
              @click.stop
              @keydown.enter.prevent="commitRename"
              @keydown.escape.prevent="cancelRename"
              @blur="commitRename"
            />
            <template v-else>
              <span class="manager-name">{{ preset.name }}</span>
              <span class="manager-meta">{{ formatPresetTime(preset.updatedAt) }}</span>
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
import { nextTick, onBeforeUnmount, ref } from 'vue'
import type { CreationToolPreset } from '@/utils/toolPresets'
import { parsePresetImport, serializePresetExport } from '@/utils/toolPresets'

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

const fileInputRef = ref<HTMLInputElement | null>(null)
const editingInputRef = ref<HTMLInputElement | null>(null)
const managementExpanded = ref(false)
const editingPresetId = ref<string | null>(null)
const editingName = ref('')
const statusMessage = ref('')
const statusTone = ref<'info' | 'success' | 'error'>('info')

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
    statusMessage.value = `${presets.length} 个预设导入成功`
    statusTone.value = 'success'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '预设导入失败'
    statusTone.value = 'error'
  } finally {
    if (input) {
      input.value = ''
    }
  }
}

function handleExport() {
  try {
    const payload = serializePresetExport(props.presets)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'creation-tool-presets.prs'
    anchor.click()
    URL.revokeObjectURL(url)

    statusMessage.value = `已导出 ${props.presets.length} 个预设。`
    statusTone.value = 'success'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '预设导出失败'
    statusTone.value = 'error'
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

  editingPresetId.value = presetId
  editingName.value = preset.name

  nextTick(() => {
    editingInputRef.value?.focus()
    editingInputRef.value?.select()
  })
}

function commitRename() {
  if (!editingPresetId.value) {
    return
  }

  emit('rename-preset', {
    presetId: editingPresetId.value,
    name: editingName.value
  })
  editingPresetId.value = null
}

function cancelRename() {
  editingPresetId.value = null
  editingName.value = ''
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!managementExpanded.value || !props.managedPresetId || editingPresetId.value) {
    return
  }

  if (event.key === 'Delete') {
    event.preventDefault()
    emit('delete-preset', props.managedPresetId)
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

window.addEventListener('keydown', handleWindowKeydown)

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

.manager-item.active {
  background: #243744;
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
</style>
