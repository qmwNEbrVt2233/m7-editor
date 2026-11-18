const STORAGE_KEY = 'm7-project'

// 保存
export function saveProject(project: any): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    return true
  } catch (e) {
    console.error('保存项目失败', e)
    return false
  }
}

// 加载
export function loadProject() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null

    const parsed: unknown = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, any>
  } catch (e) {
    console.error('加载项目失败', e)
    return null
  }
}

// 清除
export function clearProject() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error('清除项目失败', e)
  }
}