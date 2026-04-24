import type { DanmakuItem } from './danmaku'

export interface HistorySnapshot {
  id: string
  danmakus: DanmakuItem[]
  createdAt: number
  description?: string
}

export interface HistoryState {
  snapshots: HistorySnapshot[]
  currentIndex: number
  navigationHistory: string[] // 记录当前位置id的变动历史
}

/**
 * 历史记录管理器
 * 负责弹幕操作的撤销/重做功能
 */
export class HistoryManager {
  private state: HistoryState = {
    snapshots: [],
    currentIndex: -1,
    navigationHistory: []
  }

  private maxSnapshots = 10
  private lastSnapshotTime = 0
  private debounceTime = 100 // 防抖延迟，避免频繁快速操作创建过多记录点

  /**
   * 记录一个新的快照
   */
  recordSnapshot(danmakus: DanmakuItem[], description?: string) {
    const now = Date.now()

    // 防抖：如果上次记录时间太近，则跳过
    if (now - this.lastSnapshotTime < this.debounceTime) {
      return
    }

    // 删除当前索引之后的所有快照（当进行新操作时，后面的重做历史将被清空）
    if (this.state.currentIndex < this.state.snapshots.length - 1) {
      this.state.snapshots = this.state.snapshots.slice(0, this.state.currentIndex + 1)
      this.state.navigationHistory = this.state.navigationHistory.slice(0, this.state.currentIndex + 1)
    }

    // 创建新的快照
    const snapshot: HistorySnapshot = {
      id: this.generateSnapshotId(),
      danmakus: JSON.parse(JSON.stringify(danmakus)),
      createdAt: now,
      description
    }

    // 添加快照
    this.state.snapshots.push(snapshot)
    this.state.navigationHistory.push(snapshot.id)

    // 移动当前索引到新快照
    this.state.currentIndex = this.state.snapshots.length - 1

    // 如果超过最大记录数，删除最早的记录
    if (this.state.snapshots.length > this.maxSnapshots) {
      this.state.snapshots.shift()
      this.state.navigationHistory.shift()
      this.state.currentIndex--
    }

    this.lastSnapshotTime = now

    this.logOperation(`记录新快照: ${description || '操作'}（当前位置: ${this.state.currentIndex + 1}/${this.state.snapshots.length}）`)
  }

  /**
   * 撤销到上一个快照
   */
  undo(): DanmakuItem[] | null {
    if (this.state.currentIndex <= 0) {
      this.logOperation('无法撤销: 已在最早的快照')
      return null
    }

    this.state.currentIndex--
    const snapshot = this.state.snapshots[this.state.currentIndex]

    this.logOperation(`撤销操作（移动至快照 ${this.state.currentIndex + 1}/${this.state.snapshots.length}）`)

    return JSON.parse(JSON.stringify(snapshot.danmakus))
  }

  /**
   * 重做到下一个快照
   */
  redo(): DanmakuItem[] | null {
    if (this.state.currentIndex >= this.state.snapshots.length - 1) {
      this.logOperation('无法重做: 已在最新的快照')
      return null
    }

    this.state.currentIndex++
    const snapshot = this.state.snapshots[this.state.currentIndex]

    this.logOperation(`重做操作（移动至快照 ${this.state.currentIndex + 1}/${this.state.snapshots.length}）`)

    return JSON.parse(JSON.stringify(snapshot.danmakus))
  }

  /**
   * 获取当前状态信息
   */
  getState() {
    return {
      totalSnapshots: this.state.snapshots.length,
      currentIndex: this.state.currentIndex,
      canUndo: this.state.currentIndex > 0,
      canRedo: this.state.currentIndex < this.state.snapshots.length - 1,
      currentSnapshot: this.state.snapshots[this.state.currentIndex] || null,
      navigationHistory: [...this.state.navigationHistory]
    }
  }

  /**
   * 清除所有历史记录
   */
  clear() {
    this.state.snapshots = []
    this.state.currentIndex = -1
    this.state.navigationHistory = []
    this.logOperation('清除所有历史记录')
  }

  /**
   * 生成唯一的快照ID
   */
  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 日志输出
   */
  private logOperation(message: string) {
    console.log(`[历史记录] ${message}`)
  }
}

// 创建全局历史管理器实例
export const historyManager = new HistoryManager()
