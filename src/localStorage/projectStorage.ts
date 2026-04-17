const STORAGE_KEY = 'm7-project'

// 保存
export function saveProject(project: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

// 加载
export function loadProject() {
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return null

  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('加载项目失败', e)
    return null
  }
}

// 清除
export function clearProject() {
  localStorage.removeItem(STORAGE_KEY)
}