import type { DanmakuItem } from './danmaku'

/**
 * 增量补丁结构
 * 仅记录两次操作之间的差异，大幅降低内存占用
 */
export interface SnapshotDelta {
  upserted: DanmakuItem[]      // 新增或修改后的弹幕内容
  deletedIds: string[]         // 被删除的弹幕ID
  
  undoUpserted: DanmakuItem[]  // 修改前/删除前的原始数据（用于撤销还原）
  undoDeletedIds: string[]     // 撤销“新增”时需要反向删除的ID
}

export interface HistorySnapshot {
  id: string
  delta: SnapshotDelta
  createdAt: number
  description?: string
}

export interface HistoryState {
  snapshots: HistorySnapshot[]
  currentIndex: number
  navigationHistory: string[] // 记录所有状态跳转轨迹，用于追溯
}

/**
 * 历史记录管理器
 * 负责弹幕操作的撤销/重做功能（增量模式）
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

  // 内部维护的基准 Map，用于自动对比计算 Diff
  private lastStateMap: Map<string, string> = new Map() // ID -> JSON字符串(用于快速比对)
  private currentFullData: Map<string, DanmakuItem> = new Map() // 当前完整的弹幕库缓存

  /**
   * 记录一个新的增量快照
   */
  recordSnapshot(danmakus: DanmakuItem[], description?: string) {
    const now = Date.now()

    // 防抖：如果上次记录时间太近，则跳过
    if (now - this.lastSnapshotTime < this.debounceTime) {
      return
    }

    // 1. 构建下一次状态的 Map 以便对比
    const nextMap = new Map<string, DanmakuItem>()
    danmakus.forEach(d => nextMap.set(d.id, d))

    // 2. 计算 Delta (找出 增加、删除、修改)
    const delta: SnapshotDelta = {
      upserted: [],
      deletedIds: [],
      undoUpserted: [],
      undoDeletedIds: []
    }

    // 检查修改和新增
    nextMap.forEach((item, id) => {
      const oldItem = this.currentFullData.get(id)
      const newItemJson = JSON.stringify(item)
      
      if (!oldItem) {
        // 新增逻辑
        delta.upserted.push(this.clone(item))
        delta.undoDeletedIds.push(id)
      } else if (this.lastStateMap.get(id) !== newItemJson) {
        // 修改逻辑
        delta.upserted.push(this.clone(item))
        delta.undoUpserted.push(this.clone(oldItem))
      }
    })

    // 检查删除
    this.currentFullData.forEach((item, id) => {
      if (!nextMap.has(id)) {
        delta.deletedIds.push(id)
        delta.undoUpserted.push(this.clone(item))
      }
    })

    // 如果没有任何实质性变化，则不浪费槽位记录
    if (delta.upserted.length === 0 && delta.deletedIds.length === 0) {
      return
    }

    // 3. 删除当前索引之后的所有快照（时间线分支处理）
    if (this.state.currentIndex < this.state.snapshots.length - 1) {
      this.state.snapshots = this.state.snapshots.slice(0, this.state.currentIndex + 1)
    }

    // 创建新的增量快照
    const snapshot: HistorySnapshot = {
      id: this.generateSnapshotId(),
      delta,
      createdAt: now,
      description
    }

    // 添加快照入栈
    this.state.snapshots.push(snapshot)
    this.state.currentIndex = this.state.snapshots.length - 1

    // 维持最大记录数限制
    if (this.state.snapshots.length > this.maxSnapshots) {
      this.state.snapshots.shift()
      this.state.currentIndex = Math.max(0, this.state.currentIndex - 1)
    }

    // 将到达的最新 ID 压入事件记录链条（不断增加，记录流转日志）
    this.state.navigationHistory.push(snapshot.id)

    // 更新内部对比基准线
    this.updateInternalBase(danmakus)
    this.lastSnapshotTime = now

    // 日志
    this.logOperation(`记录新快照: ${description || '操作'} [ID: ${snapshot.id}]（存储槽位: ${this.state.currentIndex + 1}/${this.state.snapshots.length}）`)
  }

  /**
   * 撤销到上一个状态
   */
  undo(): DanmakuItem[] | null {
    if (this.state.currentIndex <= 0) {
      this.logOperation('无法撤销: 已在最早的快照')
      return null
    }

    const currentSnapshot = this.state.snapshots[this.state.currentIndex]
    const { delta } = currentSnapshot
    
    // 应用逆向操作（把删掉的加回来，把改了的改回去，把新增的删掉）
    delta.undoUpserted.forEach(item => this.currentFullData.set(item.id, this.clone(item)))
    delta.undoDeletedIds.forEach(id => this.currentFullData.delete(id))
    
    this.state.currentIndex--
    this.syncBaseMap() // 同步内部对比字符串

    // 记录跃迁
    const prevSnapshot = this.state.snapshots[this.state.currentIndex]
    this.state.navigationHistory.push(prevSnapshot.id)

    this.logOperation(`撤销操作（跃迁至快照 ID: ${prevSnapshot.id}）`)

    return Array.from(this.currentFullData.values())
  }

  /**
   * 重做到下一个状态
   */
  redo(): DanmakuItem[] | null {
    if (this.state.currentIndex >= this.state.snapshots.length - 1) {
      this.logOperation('无法重做: 已在最新的快照')
      return null
    }

    this.state.currentIndex++
    const snapshot = this.state.snapshots[this.state.currentIndex]
    const { delta } = snapshot

    // 应用正向操作
    delta.upserted.forEach(item => this.currentFullData.set(item.id, this.clone(item)))
    delta.deletedIds.forEach(id => this.currentFullData.delete(id))

    // 记录跃迁
    this.state.navigationHistory.push(snapshot.id)
    
    this.syncBaseMap()

    this.logOperation(`重做操作（跃迁至快照 ID: ${snapshot.id}）`)

    return Array.from(this.currentFullData.values())
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
    this.currentFullData.clear()
    this.lastStateMap.clear()
    this.logOperation('清除所有历史记录')
  }

  /**
   * 内部克隆方法
   */
  private clone<T>(item: T): T {
    return JSON.parse(JSON.stringify(item))
  }

  /**
   * 全量更新内部基准线（仅在记录新快照时调用）
   */
  private updateInternalBase(danmakus: DanmakuItem[]) {
    this.currentFullData.clear()
    this.lastStateMap.clear()
    danmakus.forEach(d => {
      this.currentFullData.set(d.id, this.clone(d))
      this.lastStateMap.set(d.id, JSON.stringify(d))
    })
  }

  /**
   * 同步 Map 基准（仅在撤销/重做应用 Delta 后调用）
   */
  private syncBaseMap() {
    this.lastStateMap.clear()
    this.currentFullData.forEach((item, id) => {
      this.lastStateMap.set(id, JSON.stringify(item))
    })
  }

  /**
   * 生成唯一的快照ID
   */
  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
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