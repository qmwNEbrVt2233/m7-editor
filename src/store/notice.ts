import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NoticeType = 'info' | 'success' | 'warn' | 'error' | undefined

export interface LogEntry {
  id: number
  timestamp: string
  type: NoticeType
  message: string
  AdditionalInfo: any
}

export const useNoticeStore = defineStore('notice', () => {
  // --- 状态层 ---
  const isVisible = ref(false)
  const type = ref<NoticeType>('info')
  const title = ref('')
  const popMessage = ref('')
  const logMessage =ref('')
  const isConfirm = ref(false)
  const lastLogTime = ref(Date.now())
  
  // 核心：用来处理 confirm 的 Promise 回调
  let confirmResolve: ((value: boolean) => void) | null = null

  // --- 日志记录层 ---
  const logList = ref<LogEntry[]>([])

  // --- 内部私有：添加历史记录 ---
  const addLog = (msg: string, noticeType?: NoticeType, AdditionalInfo?: any) => {
    logList.value.push({
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type: noticeType,
      message: msg,
      AdditionalInfo
    })

    lastLogTime.value = Date.now()
  }

  const log = (msg: string, AdditionalInfo?: any) => {
    logMessage.value = msg
    addLog(msg, undefined, AdditionalInfo)
  }

  const alert = (msg: string, alertType: NoticeType = 'info', alertTitle = '提示', AdditionalInfo?: any) => {
    isConfirm.value = false
    type.value = alertType
    title.value = alertTitle
    popMessage.value = msg
    isVisible.value = true
    
    addLog(msg, alertType, AdditionalInfo)
  }

  const confirm = (msg: string, alertTitle = '请确认'): Promise<boolean> => {
    isConfirm.value = true
    type.value = 'warn'
    title.value = alertTitle
    popMessage.value = msg
    isVisible.value = true

    addLog(msg, 'warn')

    return new Promise((resolve) => {
      confirmResolve = resolve
    })
  }

  // --- 弹窗按钮点击事件 ---
  const handleAction = (result: boolean) => {
    isVisible.value = false
    addLog(`用户点击了: ${result ? '确定' : '取消'}`, 'info')
    if (confirmResolve) {
      confirmResolve(result)
      confirmResolve = null
    }
  }

  return {
    isVisible, type, title, popMessage, logMessage, isConfirm, logList, lastLogTime,
    log, alert, confirm, handleAction
  }
})