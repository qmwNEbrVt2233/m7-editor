<template>
  <div class="template-overlay" @mousedown.self="close">
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
            :disabled="store.selectedIds.length === 0"
            @click="createFromSelection"
          >
            <span>＋</span> 从选中弹幕创建
          </button>
          <div v-if="store.danmakuTemplates.length === 0" class="template-empty">
            暂无模板
          </div>
          <div v-else class="template-list  have-scrollbar">
            <button
              v-for="template in store.danmakuTemplates"
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
            <span>模板名称</span>
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
              <button class="template-danger-button" type="button" @click="deleteSelected">删除</button>
              <button class="template-secondary-button" type="button" @click="insertSelected">插入</button>
              <button
                class="template-primary-button"
                type="button"
                :disabled="!jsonValidation.valid"
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
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { isTauriRuntime } from '@/utils/tauriBackend'
import { useNoticeStore } from '@/store/notice'

const store = useEditorStore()
const notice = useNoticeStore()
const statusMessage = ref('')
const statusTone = ref<'success' | 'error'>('success')
const editedName = ref('')
const editedDanmakus = ref('[]')
const refreshing = ref(false)

const jsonValidation = computed(() => {
  try {
    const danmakus: unknown = JSON.parse(editedDanmakus.value)
    if (!Array.isArray(danmakus)) return { valid: false, message: '内容必须是弹幕数组' }
    const valid = store.isValidDanmakuTemplateContent(danmakus)
    return {
      valid,
      message: valid ? `${danmakus.length} 条弹幕格式有效` : '弹幕结构无效或内容为空'
    }
  } catch {
    return { valid: false, message: 'JSON 格式错误' }
  }
})

const selectedTemplate = computed(() => store.danmakuTemplates.find(
  (template) => template.name === store.selectedDanmakuTemplateName
))

watch(selectedTemplate, (template) => {
  editedName.value = template?.name || ''
  editedDanmakus.value = JSON.stringify(template?.danmakus || [], null, 2)
  statusMessage.value = ''
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

function selectTemplate(name: string) {
  store.selectDanmakuTemplate(name)
}

async function refreshTemplates() {
  refreshing.value = true
  try {
    await store.refreshDanmakuTemplates()
    showStatus('模板列表已刷新', 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  } finally {
    refreshing.value = false
  }
}

async function createFromSelection() {
  try {
    await store.createDanmakuTemplateFromSelection()
    showStatus('已从选中弹幕创建模板', 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
  }
}

function setReplacement(event: Event) {
  store.setDanmakuTemplateReplacement((event.target as HTMLInputElement).checked)
}

async function saveSelected() {
  const template = selectedTemplate.value
  if (!template || !jsonValidation.value.valid) return

  try {
    const danmakus: unknown = JSON.parse(editedDanmakus.value)
    if (!Array.isArray(danmakus)) throw new Error('内容必须是弹幕对象数组')
    await store.saveDanmakuTemplate(template.name, editedName.value, danmakus)
    editedDanmakus.value = JSON.stringify(selectedTemplate.value?.danmakus || danmakus, null, 2)
    showStatus(`模板：${template.name}的更改已保存`, 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
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
  if (!template) return
  try {
    await store.deleteDanmakuTemplateByName(template.name)
    showStatus(`模板：${template.name} 已删除`, 'success')
  } catch (error) {
    showStatus(errorMessage(error), 'error')
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
  width: min(960px, 100%);
  height: min(680px, 100%);
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
  border: 1px solid #444448;
  border-radius: 4px;
  background: #2a2a2d;
  color: #c8c8ce;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
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
</style>