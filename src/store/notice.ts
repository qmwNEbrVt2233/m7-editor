import { defineStore } from 'pinia'
import { saveBlobWithFallback } from '@/store/editor'
import { formatDateTime } from '@/utils/time'

export type NoticeType = 'info' | 'success' | 'warn' | 'error' | undefined

export interface LogEntry {
  id: number
  timestamp: string
  type: NoticeType
  message: string
  AdditionalInfo: any
}

let confirmResolve: ((value: boolean) => void) | null = null

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}时${minutes}分${seconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }

  return `${seconds}秒`
}

function serializeAdditionalInfo(value: unknown) {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }

  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }

  try {
    return safeStringify(value) || ''
  } catch {
    return String(value)
  }
}

function safeStringify(value: unknown) {
  const seen = new WeakSet<object>()

  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return `${currentValue}n`
      }

      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack
        }
      }

      if (currentValue && typeof currentValue === 'object') {
        if (seen.has(currentValue)) {
          return '[Circular]'
        }
        seen.add(currentValue)
      }

      return currentValue
    },
    2
  )
}

function buildLogMarkdown(logList: LogEntry[]): string {
  const logs = [...<LogEntry[]>(logList)]
  const createdAt = formatDateTime(Date.now())

  const timestamps = logs
    .map((item) => item.id)
    .filter((value): value is number => Number.isFinite(value))

  const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null
  const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null
  const timeSpan = firstTimestamp !== null && lastTimestamp !== null
    ? formatDuration(lastTimestamp - firstTimestamp)
    : '0秒'

  const lines: string[] = [
    '# 日志信息',
    '## 日志文件头',
    `- 文件生成时间：${createdAt}`,
    `- 日志数量：${logs.length}`,
    `- 起始时间：${firstTimestamp !== null ? formatDateTime(firstTimestamp) : '无'}`,
    `- 结束时间：${lastTimestamp !== null ? formatDateTime(lastTimestamp) : '无'}`,
    `- 时间跨度：${timeSpan}`,
    ''
  ]

  logs.forEach((item) => {
    const type = item.type ?? 'log'
    const extraInfo = serializeAdditionalInfo(item.AdditionalInfo)

    lines.push(`### 时间：${item.timestamp} id：${item.id}`)
    lines.push(`[${type}] ${item.message}`)

    if (extraInfo.trim()) {
      lines.push('')
      lines.push('```text')
      lines.push(extraInfo)
      lines.push('```')
    }

    lines.push('')
  })

  return lines.join('\n').trimEnd() + '\n'
}

export const useNoticeStore = defineStore('notice', {
  state: () => {
    return {
      isVisible: false,
      type: 'info',
      title: '',
      popMessage: '',
      logMessage: '',
      isConfirm: false,
      lastLogTime: Date.now(),
      logList: <LogEntry[]>([])
    }
  },

  actions: {
    addLog(msg: string, noticeType?: NoticeType, AdditionalInfo?: any) {
      this.logList.push({
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        type: noticeType,
        message: msg,
        AdditionalInfo
      })

      this.lastLogTime = Date.now()
    },

    log(msg: string, noticeType?: NoticeType, AdditionalInfo?: any) {
      this.logMessage = msg
      this.addLog(msg, noticeType, AdditionalInfo)
    },

    alert(msg: string, alertType: NoticeType = 'info', alertTitle = '提示', AdditionalInfo?: any) {
      this.isConfirm = false
      this.type = alertType
      this.title = alertTitle
      this.popMessage = msg
      this.isVisible = true
      
      this.addLog(msg, alertType, AdditionalInfo)
    },

    confirm(msg: string, alertTitle = '请确认'): Promise<boolean> {
      this.isConfirm = true
      this.type = 'warn'
      this.title = alertTitle
      this.popMessage = msg
      this.isVisible = true

      this.addLog(msg, 'warn')

      return new Promise((resolve) => {
        confirmResolve = resolve
      })
    },

    // --- 弹窗按钮点击事件 ---
    handleAction(result: boolean) {
      this.isVisible = false
      this.addLog(`用户点击了: ${result ? '确定' : '取消'}`, 'info')
      if (confirmResolve) {
        confirmResolve(result)
        confirmResolve = null
      }
    },

    async exportLogs() {
      const markdown = buildLogMarkdown(this.logList)
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })

      await saveBlobWithFallback(blob, `notice-logs ${formatDateTime(Date.now())}.md`, {
        description: 'Markdown 日志文件',
        accept: {
          'text/markdown': ['.md']
        }
      })
    }
  }
})