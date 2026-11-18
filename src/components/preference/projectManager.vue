<template>
  <div v-if="visible" class="project-manager">
    <div class="manager-shell">
      <header class="manager-header">
        <div>
          <h2>工程管理</h2>
          <p v-if="fileSystemState">按下 h 以获取帮助，默认工程目录：{{ fileSystemState.defaultProjectsDir }}</p>
        </div>
        <div class="button-row">
          <button type="button" class="btn" :disabled="isExitBusy" @click="importProject">导入单文件工程</button>
          <button type="button" class="btn" :disabled="isExitBusy" @click="importXml">导入XML</button>
          <button type="button" class="btn" :disabled="isExitBusy" @click="skipFolderProject">{{store.InitializationPhase ? '跳过' : '关闭'}}</button>
        </div>
      </header>

      <main class="manager-body">
        <section class="project-list have-scrollbar">
          <div class="section-title">
            <h3>已注册工程</h3>
            <div class="button-row">
              <button type="button" class="btn" :disabled="isBusy" @click="importProjectFolder">导入文件夹</button>
              <button type="button" class="btn" :disabled="isBusy" @click="refreshProjects">刷新</button>
            </div>
          </div>

          <input
            v-if="projects.length > 0"
            v-model="projectSearchQuery"
            type="text"
            class="dark-input wide"
            placeholder="搜索工程名称、描述或路径..."
            aria-label="搜索已注册工程"
          />

          <div v-if="loading" class="empty-state">正在读取工程列表...</div>
          <div v-else-if="projects.length === 0" class="empty-state">暂无文件夹工程</div>
          <div v-else-if="filteredProjects.length === 0" class="empty-state">未找到匹配的工程</div>
          <div v-else class="project-items have-scrollbar">
            <article
              v-for="project in filteredProjects"
              :key="project.path"
              class="project-item"
              :class="{ 'has-warning': !project.projectExists || (project.config.media && !project.mediaExists) }"
            >
              <div class="project-main" @click.stop="loadProject(project.path)">
                <h4>
                  {{ project.config.name }}
                </h4>
                <p>{{ project.config.description || '无描述' }}</p>
                <span>最后修改：{{ formatTime(project.config.lastChangeAt) }}<br/>路径：{{ project.path }}</span>
                <p v-if="!project.projectExists" class="media-warning-text">
                  ⚠️ 工程数据文件缺失：{{ project.config.projectFile }}
                </p>
                <p v-if="project.config.media && !project.mediaExists" class="media-warning-text">
                  ⚠️ 媒体文件缺失：{{ project.mediaPath || '未知路径' }}
                </p>
              </div>
              <div class="project-actions">
                <button type="button" class="btn" :disabled="isBusy || editingProjectPath === project.path" @click.stop="startEditing(project)">编辑</button>
                <button type="button" class="btn btn-danger" :disabled="isBusy" @click.stop="deleteProject(project.path)">删除</button>
              </div>
            </article>
          </div>
          <!-- 编辑面板 -->
          <div v-if="editingProjectPath" class="edit-panel">
            <h4>编辑工程</h4>
            <label class="form-row">
              <span>工程名称</span>
              <input v-model.trim="editingName" class="dark-input wide" />
            </label>
            <label class="form-row">
              <span>描述</span>
              <textarea v-model="editingDescription" class="dark-input wide text-area-edit have-scrollbar" placeholder="无" />
            </label>
            <label class="form-row">
              <span>移动到新路径</span>
              <div class="path-row">
                <input v-model="editingNewParentDir" class="dark-input path-input" placeholder="留空不移动" />
                <button type="button" class="btn" :disabled="editingLoading" @click="chooseEditNewParentDir">选择</button>
              </div>
            </label>
            <label class="form-row">
              <span>媒体链接方式</span>
              <select v-model="editingMediaMode" class="dark-select wide">
                <option value="internal">内部复制（媒体在工程 media 文件夹中）</option>
                <option value="external">外部链接（引用外部文件）</option>
              </select>
            </label>
            <label v-if="editingMediaMode === 'external'" class="form-row">
              <span>外部媒体路径</span>
              <div class="path-row">
                <input v-model="editingMediaExternalPath" class="dark-input path-input" placeholder="外部媒体文件路径" />
                <button type="button" class="btn" :disabled="editingLoading" @click="chooseEditMediaFile">选择</button>
              </div>
            </label>
            <div class="edit-actions">
              <button type="button" class="btn" @click="cancelEditing" :disabled="editingLoading">取消</button>
              <button type="button" class="btn primary-btn" @click="saveEditing" :disabled="editingLoading">
                {{ editingLoading ? '保存中...' : '保存修改' }}
              </button>
            </div>
          </div>
        </section>

        <section class="create-panel have-scrollbar">
          <h3>创建工程</h3>

          <label class="form-row">
            <span>工程名称</span>
            <input v-model.trim="projectName" class="dark-input wide" @input="checkProjectPath" />
          </label>

          <label class="form-row">
            <span>创建路径</span>
            <div class="path-row">
              <input v-model="parentDir" class="dark-input path-input" @input="checkProjectPath" />
              <button type="button" class="btn" :disabled="isBusy" @click="chooseParentDir">选择</button>
            </div>
          </label>

          <p v-if="pathCheck" class="path-check" :class="{ danger: pathCheck.exists }">
            {{ pathCheck.exists ? '目录已存在：' : '将创建：' }}{{ pathCheck.path }}
          </p>

          <label class="form-row">
            <span>媒体文件</span>
            <div class="path-row">
              <input v-model="mediaPath" class="dark-input path-input" placeholder="可留空" />
              <button type="button" class="btn" :disabled="isBusy" @click="chooseMediaFile">选择</button>
            </div>
          </label>

          <label class="check-row">
            <input v-model="copyMedia" type="checkbox" />
            <span>复制媒体到工程文件夹中</span>
          </label>

          <label v-if="!store.InitializationPhase" class="check-row">
            <input v-model="createFromCurrent" type="checkbox" :disabled="importFromFile" />
            <span>从当前编辑内容创建</span>
          </label>

          <label class="check-row">
            <input v-model="importFromFile" type="checkbox" :disabled="createFromCurrent" />
            <span>从导入的工程创建</span>
          </label>

          <div v-if="importFromFile" class="form-row">
            <div class="path-row">
              <input :value="importedProjectPath" class="dark-input path-input" readonly placeholder="未选择工程文件" />
              <button type="button" class="btn" :disabled="isBusy" @click="chooseImportedProjectFile">选择工程文件</button>
            </div>
          </div>

          <label class="form-row">
            <span>描述</span>
            <textarea v-model="description" class="dark-input wide text-area have-scrollbar" placeholder="无" />
          </label>

          <button
            type="button"
            class="btn primary-btn create-submit-btn"
            :disabled="!canCreateProject || isBusy"
            @click="createProject"
          >
            {{ busyAction === 'create' ? '创建中...' : '创建并进入工程' }}
          </button>
        </section>
      </main>
    </div>
    <input
      type="file"
      ref="projectInput"
      @change="onFileChange"
      style="display: none"
      accept=".json"
    />
    <input
      type="file"
      ref="xmlInput"
      @change="onXmlFileChange"
      style="display: none"
      accept=".xml,text/xml,application/xml"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useNoticeStore } from '@/store/notice'
import {
  checkFolderProjectPath,
  chooseProjectFolder,
  isSameFsPath,
  openMediaFileWithTauri,
  openProjectFile,
  type EditFolderProjectInput,
  type FolderProjectSummary,
  type ProjectPathCheck
} from '@/utils/tauriBackend'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  loaded: []
}>()

const store = useEditorStore()
const notice = useNoticeStore()

const loading = ref(false)
const busyAction = ref<'load' | 'create' | 'import' | 'delete' | 'edit' | 'skip' | ''>('')
const fileSystemState = computed(() => store.fileSystemState)
const projectName = ref('Project_1')
const parentDir = ref('')
const mediaPath = ref('')
const copyMedia = ref(true)
const createFromCurrent = ref(false)
const description = ref('')
const projectSearchQuery = ref('')
const pathCheck = ref<ProjectPathCheck | null>(null)
let pathCheckTimer: ReturnType<typeof setTimeout> | null = null
let pathCheckSeq = 0

// 编辑状态
const editingProjectPath = ref<string | null>(null)
const editingName = ref('')
const editingDescription = ref('')
const editingMediaMode = ref<'internal' | 'external'>('internal')
const editingMediaExternalPath = ref('')
const editingNewParentDir = ref('')
const editingLoading = ref(false)

// 从导入工程创建
const importFromFile = ref(false)
const importedProjectPath = ref('')
const importedProjectData = ref<any>(null)

const isExitBusy = computed(() => busyAction.value !== '' || editingLoading.value)
const isBusy = computed(() => isExitBusy.value || loading.value)

const projects = computed<FolderProjectSummary[]>(() =>
  [...(fileSystemState.value?.projects ?? [])].sort((a, b) => b.config.lastChangeAt - a.config.lastChangeAt)
)

const filteredProjects = computed<FolderProjectSummary[]>(() => {
  const query = projectSearchQuery.value.trim().toLocaleLowerCase()
  if (!query) return projects.value
  return projects.value.filter((project) =>
    project.config.name.toLocaleLowerCase().includes(query) ||
    (project.config.description || '').toLocaleLowerCase().includes(query) ||
    project.path.toLocaleLowerCase().includes(query)
  )
})

const canCreateProject = computed(() => {
  const baseValid = Boolean(projectName.value.trim() && parentDir.value.trim() && !pathCheck.value?.exists)
  if (importFromFile.value) {
    return baseValid && importedProjectData.value !== null
  }
  return baseValid
})

// 互斥：从当前内容创建 ↔ 从导入工程创建
watch(importFromFile, (val) => { if (val) createFromCurrent.value = false })
watch(createFromCurrent, (val) => { if (val) { importFromFile.value = false; importedProjectData.value = null; importedProjectPath.value = '' } })

watch(() => props.visible, (visible) => {
  if (visible) {
    void refreshProjects()
  } else {
    cancelEditing()
  }
})

watch(() => store.fileSystemState, (fsState) => {
  if (!fsState) return
  parentDir.value ||= fsState.defaultProjectsDir
  if (editingProjectPath.value && !fsState.projects.some((project) => isSameFsPath(project.path, editingProjectPath.value!))) {
    cancelEditing()
  }
  void checkProjectPathNow()
})

function handleManagerKeydown(event: KeyboardEvent) {
  if (!props.visible || notice.isVisible) return
  if (event.key === 'Escape' && editingProjectPath.value && !editingLoading.value) {
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleManagerKeydown, { capture: true })
  void refreshProjects()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleManagerKeydown, { capture: true })
  if (pathCheckTimer) {
    clearTimeout(pathCheckTimer)
    pathCheckTimer = null
  }
})

async function refreshProjects() {
  if (loading.value) return
  loading.value = true
  try {
    const fsState = await store.refreshFileSystemState()
    parentDir.value ||= fsState.defaultProjectsDir
    await checkProjectPathNow()
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '工程列表读取失败', error)
  } finally {
    loading.value = false
  }
}

function checkProjectPath() {
  if (pathCheckTimer) clearTimeout(pathCheckTimer)
  pathCheckTimer = setTimeout(() => {
    pathCheckTimer = null
    void checkProjectPathNow()
  }, 150)
}

async function checkProjectPathNow() {
  const seq = ++pathCheckSeq
  const currentParent = parentDir.value.trim()
  const currentName = projectName.value.trim()
  if (!currentParent || !currentName) {
    pathCheck.value = null
    return
  }

  try {
    const result = await checkFolderProjectPath(currentParent, currentName)
    if (seq === pathCheckSeq) {
      pathCheck.value = result
    }
  } catch {
    if (seq === pathCheckSeq) {
      pathCheck.value = null
    }
  }
}

async function chooseParentDir() {
  try {
    const path = await chooseProjectFolder()
    if (path) {
      parentDir.value = path
      await checkProjectPathNow()
    }
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '选择路径失败', error)
  }
}

async function chooseMediaFile() {
  try {
    const media = await openMediaFileWithTauri()
    if (media) {
      mediaPath.value = media.path
    }
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '选择媒体失败', error)
  }
}

async function createProject() {
  if (!canCreateProject.value || isBusy.value) return

  busyAction.value = 'create'
  try {
    const fromProject = importFromFile.value && importedProjectData.value
      ? importedProjectData.value
      : undefined

    await store.createFolderProjectFromInput({
      parentDir: parentDir.value,
      name: projectName.value,
      fromCurrent: !fromProject && createFromCurrent.value,
      fromProject,
      mediaPath: mediaPath.value || undefined,
      copyMedia: copyMedia.value,
      description: description.value
    })

    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '创建工程失败', error)
  } finally {
    busyAction.value = ''
  }
}

async function loadProject(path: string) {
  if (isBusy.value) return
  if (!store.InitializationPhase) {
    const confirmed = await notice.confirm('确定要加载工程吗？这将丢失未保存的进度')
    if (!confirmed) {
      return
    }
  }
  busyAction.value = 'load'
  try {
    await store.loadFolderProjectFromPath(path)
    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '加载工程失败', error)
  } finally {
    busyAction.value = ''
  }
}

async function importProjectFolder() {
  if (isBusy.value) return
  busyAction.value = 'import'
  try {
    const result = await store.importFolderProjectFromPath()
    if (!result) return

    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '导入工程失败', error)
  } finally {
    busyAction.value = ''
  }
}

async function deleteProject(path: string) {
  if (isBusy.value) return
  const target = projects.value.find((p) => isSameFsPath(p.path, path))
  const label = target?.config.name ? `“${target.config.name}”` : '此工程'
  const confirmed = await notice.confirm(`确定要删除工程${label}吗？工程文件夹将被移至回收站`)
  if (!confirmed) return

  busyAction.value = 'delete'
  try {
    await store.deleteFolderProjectByPath(path, false)
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '删除工程失败', error)
  } finally {
    busyAction.value = ''
  }
}

const projectInput = ref<HTMLInputElement | null>(null)
const xmlInput = ref<HTMLInputElement | null>(null)

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busyAction.value = 'import'
  try {
    const text = await file.text()
    const project = JSON.parse(text)
    await store.applyImportedProject(project, {
      closeManager: true,
      logMessage: `[工程] 已导入单文件工程：${file.name}`
    })
    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '工程文件导入失败', error)
  } finally {
    input.value = ''
    busyAction.value = ''
  }
}

async function onXmlFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busyAction.value = 'import'
  try {
    const xml = await file.text()
    await store.applyImportedXmlText(xml, { closeManager: true })
    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', 'XML导入失败', error)
  } finally {
    input.value = ''
    busyAction.value = ''
  }
}

async function importProject() {
  if (isExitBusy.value) return
  if (!store.InitializationPhase) {
    const confirmed = await notice.confirm('确定要加载工程吗？这将丢失未保存的进度')
    if (!confirmed) {
      return
    }
  }
  projectInput.value?.click()
}

async function importXml() {
  if (isExitBusy.value) return
  if (!store.InitializationPhase) {
    const confirmed = await notice.confirm('确定要加载 XML 弹幕文件吗？这将丢失未保存的进度')
    if (!confirmed) {
      return
    }
  }
  xmlInput.value?.click()
}

// ── 编辑工程 ──
function startEditing(project: FolderProjectSummary) {
  editingProjectPath.value = project.path
  editingName.value = project.config.name
  editingDescription.value = project.config.description || ''
  editingMediaMode.value = project.config.media?.useExternalLink ? 'external' : 'internal'
  editingMediaExternalPath.value = project.config.media?.externalPath || ''
  editingNewParentDir.value = ''
}

function cancelEditing() {
  editingProjectPath.value = null
  editingName.value = ''
  editingDescription.value = ''
  editingMediaMode.value = 'internal'
  editingMediaExternalPath.value = ''
  editingNewParentDir.value = ''
}

async function saveEditing() {
  if (!editingProjectPath.value || editingLoading.value) return

  const trimmedName = editingName.value.trim()
  if (!trimmedName) {
    notice.alert('工程名称不能为空', 'warn')
    return
  }

  const project = projects.value.find(p => isSameFsPath(p.path, editingProjectPath.value!))
  const original = project?.config

  const trimmedExternalPath = editingMediaExternalPath.value.trim()
  const originalMode = original?.media?.useExternalLink ? 'external' : 'internal'
  if (editingMediaMode.value === 'external' && !trimmedExternalPath) {
    if (original?.media && originalMode === 'internal') {
      const confirmed = await notice.confirm('未填写外部媒体路径，保存后将移除工程内的媒体配置并删除副本，是否继续？')
      if (!confirmed) return
    } else if (original?.media) {
      notice.alert('请填写外部媒体文件路径', 'warn')
      return
    }
  }

  editingLoading.value = true
  try {
    const input: EditFolderProjectInput = {
      projectPath: editingProjectPath.value
    }

    if (trimmedName !== original?.name) {
      input.name = trimmedName
    }
    if (editingNewParentDir.value.trim()) {
      input.newParentDir = editingNewParentDir.value.trim()
    }
    if (editingDescription.value !== (original?.description ?? '')) {
      input.description = editingDescription.value
    }

    // 媒体模式变更
    if (editingMediaMode.value !== originalMode) {
      input.mediaUseExternalLink = editingMediaMode.value === 'external'
      if (editingMediaMode.value === 'external') {
        input.mediaExternalPath = trimmedExternalPath
      }
    } else if (editingMediaMode.value === 'external' && trimmedExternalPath !== (original?.media?.externalPath ?? '')) {
      input.mediaExternalPath = trimmedExternalPath
    }

    await store.editFolderProjectByInput(input)
    cancelEditing()
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '编辑工程失败', error)
  } finally {
    editingLoading.value = false
  }
}

async function chooseEditMediaFile() {
  try {
    const media = await openMediaFileWithTauri()
    if (media) {
      editingMediaExternalPath.value = media.path
    }
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '选择媒体失败', error)
  }
}

async function chooseEditNewParentDir() {
  try {
    const path = await chooseProjectFolder()
    if (path) {
      editingNewParentDir.value = path
    }
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '选择路径失败', error)
  }
}

// ── 从文件导入工程 ──
async function chooseImportedProjectFile() {
  try {
    const data = await openProjectFile()
    if (data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('工程文件格式无效（根节点必须是对象）')
      }
      if (data.danmakus !== undefined && !Array.isArray(data.danmakus)) {
        throw new Error('工程文件格式无效（danmakus 必须是数组）')
      }
      importedProjectData.value = data
      // 尝试从数据中提取名称作为默认工程名
      if (typeof data?.meta?.name === 'string' && data.meta.name.trim()) {
        projectName.value = data.meta.name.trim()
        await checkProjectPathNow()
      }
      importedProjectPath.value = '已选择工程文件'
      notice.log('[工程] 已读取工程文件', 'success')
    }
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '读取工程文件失败', error)
  }
}

async function skipFolderProject() {
  if (isExitBusy.value) return
  busyAction.value = 'skip'
  try {
    await store.skipProjectManager()
    emit('loaded')
    emit('close')
  } catch (error) {
    notice.alert(error instanceof Error ? error.message : String(error), 'error', '跳过工程失败', error)
  } finally {
    busyAction.value = ''
  }
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '未知时间'
  return new Date(value).toLocaleString()
}
</script>

<style scoped lang="css">
.project-manager {
  position: fixed;
  inset: 0;
  z-index: 9997;
  display: flex;
  color: #e8e8e8;
}

.manager-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #333;
}

.manager-header h2,
.create-panel h3,
.section-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.manager-header p {
  margin: 8px 0 0;
  color: #a8a8a8;
  font-size: 12px;
}

.manager-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 16px;
  padding: 16px;
}

.project-list,
.create-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
  padding-right: 4px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.button-row,
.path-row,
.project-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-items {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #262626;
  border: 1px solid #3b3b3b;
  border-radius: 6px;
  cursor: pointer;
}

.project-item:hover {
  background: #292929;
}

.project-main {
  min-width: 100px;
  width: 100%;
}

.project-main h4 {
  margin: 0 0 6px;
  font-size: 15px;
}

.project-main p,
.project-main span,
.empty-state,
.path-check {
  color: #a8a8a8;
  font-size: 12px;
}

.project-main p {
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  border: 1px dashed #444;
  border-radius: 6px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #bdbdbd;
  font-size: 13px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cfcfcf;
  font-size: 13px;
}

.dark-input {
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 10px 8px;
  border-radius: 3px;
  outline: none;
  box-sizing: border-box;
}

.dark-input:focus {
  border-color: #64b5f6;
}

.wide {
  width: 100%;
}

.path-input {
  flex: 1;
  min-width: 0;
}

.text-area {
  height: 20vh;
  resize: none;
}

.text-area-edit {
  height: 10vh;
  resize: none;
}

.media-warning-text {
  color: #ffb74d !important;
  margin: 6px 0 0 !important;
  font-size: 11px !important;
}

.project-item.has-warning {
  border-color: #8a6d3b;
}

.edit-panel {
  padding: 14px;
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-panel h4 {
  margin: 0;
  font-size: 14px;
  color: #ccc;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.dark-input select {
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 10px 8px;
  border-radius: 3px;
}

.dark-select {
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 10px 8px;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.dark-select:focus {
  border-color: #64b5f6;
}

.path-check {
  margin: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.path-check.danger {
  color: #ff9b8f;
}

.btn {
  min-width: 60px;
  padding: 9px 12px;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover:not(:disabled) {
  filter: brightness(1.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn {
  background: #245f8d;
  border-color: #3478ae;
}

.create-submit-btn {
  position: sticky;
  margin-top: auto;
  bottom: 0;
}

.btn-danger {
  background: #5c2018;
  color: #ffb3b3;
  border-color: #8a2e24;
}

@media (max-width: 820px) {
  .manager-shell {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    margin: 12px;
  }

  .manager-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}
</style>
