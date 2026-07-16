import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DocSection {
  id: string
  title: string
  children?: DocSection[]
}

export const docSections: DocSection[] = [
  { id: 'about', title: '关于' },
  {
    id: 'interface-project-manager',
    title: '工程管理',
    children: [
      { id: 'interface-create-project', title: '新建工程' },
      { id: 'interface-edit-project-info', title: '编辑现有工程信息' }
    ]
  },
  {
    id: 'interface-player-area',
    title: '设置面板',
    children: [
      { id: 'interface-file', title: '文件' },
      { id: 'interface-config', title: '配置' },
      { id: 'interface-player', title: '播放器' },
      { id: 'interface-preprocess', title: '预处理' },
      { id: 'interface-assistant', title: '辅助' }
    ]
  },
  { id: 'interface-editor', title: '编辑面板' },
  {
    id: 'interface-tools',
    title: '工具栏',
    children: [
      { id: 'interface-tools-list', title: '一般工具' },
      { id: 'interface-advanced-tools', title: '高级工具' }
    ]
  },
  { id: 'interface-timeline', title: '时间轴' },
  {
    id: 'interface-creation',
    title: '高级创建工具',
    children: [
      { id: 'interface-creation-presets', title: '预设管理器' },
      { id: 'interface-creation-expressions', title: '表达式规范' },
      { id: 'interface-creation-shortcut', title: '快捷键' }
    ]
  },
  {
    id: 'import-export',
    title: '文件导入导出',
    children: [
      { id: 'import-export-json', title: '工程 JSON' },
      { id: 'import-export-xml', title: 'XML 弹幕文件' },
      { id: 'import-export-paste', title: '粘贴弹幕' }
    ]
  },
  {
    id: 'tips',
    title: '使用建议与注意事项',
    children: [
      { id: 'suggestions', title: '使用建议流程' },
      { id: 'notes', title: '当前注意事项' }
    ]
  },
  { id: 'license', title: '开源协议' }
]

// 拥有自身文档内容的 section ID 集合
const sectionsWithContent = new Set([
  'about',
  'interface-project-manager',
  'interface-create-project',
  'interface-edit-project-info',
  'interface-file',
  'interface-config',
  'interface-player',
  'interface-preprocess',
  'interface-assistant',
  'interface-editor',
  'interface-tools-list',
  'interface-advanced-tools',
  'interface-timeline',
  'interface-creation',
  'interface-creation-presets',
  'interface-creation-expressions',
  'interface-creation-shortcut',
  'import-export-json',
  'import-export-xml',
  'import-export-paste',
  'suggestions',
  'notes',
  'license'
])

/** 在 docSections 树中按 id 查找节点 */
function findSectionById(sections: DocSection[], id: string): DocSection | null {
  for (const s of sections) {
    if (s.id === id) return s
    if (s.children) {
      const found = findSectionById(s.children, id)
      if (found) return found
    }
  }
  return null
}

/** 递归查找节点下第一个拥有内容的子孙 id */
function findFirstContentChild(section: DocSection): string | null {
  if (sectionsWithContent.has(section.id)) return section.id
  if (section.children) {
    for (const child of section.children) {
      const result = findFirstContentChild(child)
      if (result) return result
    }
  }
  return null
}

export const useHelpStore = defineStore('help', () => {
  const isVisible = ref(false)
  const activeSection = ref('about')

  function show(section?: string) {
    isVisible.value = true
    if (section) {
      handleSectionClick(section)
    }
  }

  function hide() {
    isVisible.value = false
  }

  function toggle() {
    isVisible.value = !isVisible.value
  }

  /** 处理侧边栏点击：有内容则打开自身，否则打开第一个子项 */
  function handleSectionClick(id: string) {
    if (sectionsWithContent.has(id)) {
      activeSection.value = id
      return
    }
    // 没有自身内容，查找第一个有内容的子节点
    const section = findSectionById(docSections, id)
    if (section) {
      const firstChild = findFirstContentChild(section)
      if (firstChild) {
        activeSection.value = firstChild
      }
    }
  }

  return {
    isVisible,
    activeSection,
    show,
    hide,
    toggle,
    handleSectionClick
  }
})
