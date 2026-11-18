import type { DanmakuItem } from './danmaku'
import { useNoticeStore } from '@/store/notice'

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

export interface HistoryOperationResult {
  danmakus: DanmakuItem[]
  selectedIds: string[]
  snapshotId: string
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

  private maxSnapshots = 100
  private maxNavigationHistory = 500
  private lastSnapshotTime = 0

  // 内部维护的基准 Map，用于自动对比计算 Diff
  private lastStateMap: Map<string, string> = new Map() // ID -> JSON字符串(用于快速比对)
  private currentFullData: Map<string, DanmakuItem> = new Map() // 当前完整的弹幕库缓存

  ensureBaseline(danmakus: DanmakuItem[], description = '编辑器初始状态') {
    if (this.state.snapshots.length > 0) return
    const list = Array.isArray(danmakus) ? danmakus : []
    const now = Date.now()
    const snapshot: HistorySnapshot = {
      id: this.generateSnapshotId(),
      delta: {
        upserted: [],
        deletedIds: [],
        undoUpserted: [],
        undoDeletedIds: []
      },
      createdAt: now,
      description
    }
    this.state.snapshots = [snapshot]
    this.state.currentIndex = 0
    this.pushNavigationHistory(snapshot.id)
    this.updateInternalBase(list)
    this.lastSnapshotTime = now
    this.logOperation('记录历史基线: ' + description + ' [ID: ' + snapshot.id + ']')
  }

  /**
   * 记录一个新的增量快照
   */
  recordSnapshot(danmakus: DanmakuItem[], description?: string, _immediate = false) {
    const list = Array.isArray(danmakus) ? danmakus : []

    if (this.state.snapshots.length === 0) {
      this.ensureBaseline(list, description || '编辑器初始状态')
      return
    }

    const now = Date.now()

    // 1. 构建下一次状态的 Map 以便对比
    const nextMap = new Map<string, DanmakuItem>()
    for (const d of list) {
      if (d && typeof d.id === 'string' && d.id) {
        nextMap.set(d.id, d)
      }
    }

    // 2. 计算 Delta (找出 增加、删除、修改)
    const delta: SnapshotDelta = {
      upserted: [],
      deletedIds: [],
      undoUpserted: [],
      undoDeletedIds: []
    }
    const nextJsonMap = new Map<string, string>()

    // 检查修改和新增
    nextMap.forEach((item, id) => {
      const oldItem = this.currentFullData.get(id)
      const newItemJson = JSON.stringify(item)

      if (!oldItem) {
        // 新增逻辑
        delta.upserted.push(this.cloneDanmaku(item))
        delta.undoDeletedIds.push(id)
        nextJsonMap.set(id, newItemJson)
      } else if (this.lastStateMap.get(id) !== newItemJson) {
        // 修改逻辑
        delta.upserted.push(this.cloneDanmaku(item))
        delta.undoUpserted.push(this.cloneDanmaku(oldItem))
        nextJsonMap.set(id, newItemJson)
      }
    })

    // 检查删除
    this.currentFullData.forEach((item, id) => {
      if (!nextMap.has(id)) {
        delta.deletedIds.push(id)
        delta.undoUpserted.push(this.cloneDanmaku(item))
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

    // 将到达的最新 ID 压入事件记录链条
    this.pushNavigationHistory(snapshot.id)

    // 仅按增量更新内部基准缓存，避免对未变更弹幕执行全量克隆与序列化
    for (const deletedId of delta.deletedIds) {
      this.currentFullData.delete(deletedId)
      this.lastStateMap.delete(deletedId)
    }
    for (const item of delta.upserted) {
      this.currentFullData.set(item.id, this.cloneDanmaku(item))
      const json = nextJsonMap.get(item.id)
      if (json !== undefined) {
        this.lastStateMap.set(item.id, json)
      }
    }
    this.lastSnapshotTime = now

    // 日志
    this.logOperation(`记录新快照: ${description || '操作'} [ID: ${snapshot.id}]（存储槽位: ${this.state.currentIndex + 1}/${this.state.snapshots.length}/${this.maxSnapshots}）`)
  }

  /**
   * 撤销到上一个状态
   */
  undo(): HistoryOperationResult | null {
    if (this.state.currentIndex <= 0) {
      this.logOperation('无法撤销: 已在最早的快照')
      return null
    }

    const currentSnapshot = this.state.snapshots[this.state.currentIndex]
    const { delta } = currentSnapshot
    
    // 应用逆向操作（把删掉的加回来，把改了的改回去，把新增的删掉）
    delta.undoUpserted.forEach(item => {
      const cloned = this.cloneDanmaku(item)
      this.currentFullData.set(item.id, cloned)
      this.lastStateMap.set(item.id, JSON.stringify(cloned))
    })
    delta.undoDeletedIds.forEach(id => {
      this.currentFullData.delete(id)
      this.lastStateMap.delete(id)
    })
    
    this.state.currentIndex--

    // 记录跃迁
    const prevSnapshot = this.state.snapshots[this.state.currentIndex]
    this.pushNavigationHistory(prevSnapshot.id)

    this.logOperation(`撤销操作（跃迁至快照 ID: ${prevSnapshot.id} 存储槽位: ${this.state.currentIndex + 1}/${this.state.snapshots.length}/${this.maxSnapshots}）`)

    return {
      danmakus: this.exportCurrentData(),
      selectedIds: this.uniqueIds(delta.undoUpserted.map(item => item.id)),
      snapshotId: prevSnapshot.id
    }
  }

  /**
   * 重做到下一个状态
   */
  redo(): HistoryOperationResult | null {
    if (this.state.currentIndex >= this.state.snapshots.length - 1) {
      this.logOperation('无法重做: 已在最新的快照')
      return null
    }

    this.state.currentIndex++
    const snapshot = this.state.snapshots[this.state.currentIndex]
    const { delta } = snapshot

    // 应用正向操作
    delta.upserted.forEach(item => {
      const cloned = this.cloneDanmaku(item)
      this.currentFullData.set(item.id, cloned)
      this.lastStateMap.set(item.id, JSON.stringify(cloned))
    })
    delta.deletedIds.forEach(id => {
      this.currentFullData.delete(id)
      this.lastStateMap.delete(id)
    })

    // 记录跃迁
    this.pushNavigationHistory(snapshot.id)

    this.logOperation(`重做操作（跃迁至快照 ID: ${snapshot.id}）`)

    return {
      danmakus: this.exportCurrentData(),
      selectedIds: this.uniqueIds(delta.upserted.map(item => item.id)),
      snapshotId: snapshot.id
    }
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

  listSnapshots() {
    return this.state.snapshots.map((snapshot, index) => ({
      snapshotId: snapshot.id,
      index,
      createdAt: snapshot.createdAt,
      description: snapshot.description || '',
      isCurrent: index === this.state.currentIndex,
      changedIds: [...new Set([
        ...snapshot.delta.upserted.map((item) => item.id),
        ...snapshot.delta.deletedIds
      ])],
      createdIds: [...snapshot.delta.undoDeletedIds],
      deletedIds: [...snapshot.delta.deletedIds]
    }))
  }

  getSnapshotDanmakus(snapshotId: string, offset = 0, limit = 100) {
    const targetIndex = this.state.snapshots.findIndex((snapshot) => snapshot.id === snapshotId)
    if (targetIndex < 0) throw new Error(`找不到历史快照：${snapshotId}`)

    const danmakus = new Map<string, DanmakuItem>(this.currentFullData)

    if (targetIndex < this.state.currentIndex) {
      for (let index = this.state.currentIndex; index > targetIndex; index--) {
        const delta = this.state.snapshots[index].delta
        delta.undoUpserted.forEach((item) => danmakus.set(item.id, item))
        delta.undoDeletedIds.forEach((id) => danmakus.delete(id))
      }
    } else if (targetIndex > this.state.currentIndex) {
      for (let index = this.state.currentIndex + 1; index <= targetIndex; index++) {
        const delta = this.state.snapshots[index].delta
        delta.upserted.forEach((item) => danmakus.set(item.id, item))
        delta.deletedIds.forEach((id) => danmakus.delete(id))
      }
    }

    const snapshot = this.state.snapshots[targetIndex]
    const allItems = Array.from(danmakus.values())
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100
    return {
      snapshotId: snapshot.id,
      index: targetIndex,
      createdAt: snapshot.createdAt,
      description: snapshot.description || '',
      total: allItems.length,
      offset: safeOffset,
      items: allItems.slice(safeOffset, safeOffset + safeLimit).map((item) => this.cloneDanmaku(item))
    }
  }

  /**
   * 清除所有历史记录
   */
  clear() {
    this.state.snapshots = []
    this.state.currentIndex = -1
    this.state.navigationHistory = []
    this.lastSnapshotTime = 0
    this.currentFullData.clear()
    this.lastStateMap.clear()
    this.logOperation('清除所有历史记录')
  }

  private pushNavigationHistory(snapshotId: string) {
    this.state.navigationHistory.push(snapshotId)
    if (this.state.navigationHistory.length > this.maxNavigationHistory) {
      this.state.navigationHistory.splice(0, this.state.navigationHistory.length - this.maxNavigationHistory)
    }
  }

  private cloneDanmaku(item: DanmakuItem): DanmakuItem {
    if (!item || typeof item !== 'object') {
      return this.clone(item)
    }
    return {
      id: item.id,
      layer: item.layer,
      startTime: item.startTime,
      content: {
        text: item.content?.text ?? '',
        font: item.content?.font ?? 'Microsoft YaHei',
        size: item.content?.size ?? 60,
        color: item.content?.color ?? '#ffffff',
        stroke: Boolean(item.content?.stroke)
      },
      transform: {
        start: {
          x: item.transform?.start?.x ?? 0,
          y: item.transform?.start?.y ?? 0
        },
        end: {
          x: item.transform?.end?.x ?? 0,
          y: item.transform?.end?.y ?? 0
        },
        zRotate: item.transform?.zRotate ?? 0,
        yRotate: item.transform?.yRotate ?? 0
      },
      opacity: {
        from: item.opacity?.from ?? 1,
        to: item.opacity?.to ?? 1
      },
      animation: {
        duration: item.animation?.duration ?? 1000,
        moveDuration: item.animation?.moveDuration ?? 500,
        delay: item.animation?.delay ?? 0,
        easing: item.animation?.easing === 'speeddown' ? 'speeddown' : 'speedup'
      }
    }
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
      if (!d || typeof d.id !== 'string' || !d.id) return
      const cloned = this.cloneDanmaku(d)
      this.currentFullData.set(d.id, cloned)
      this.lastStateMap.set(d.id, JSON.stringify(cloned))
    })
  }

  /**
   * 导出当前数据的深拷贝
   * 避免调用方直接修改历史管理器内部缓存，污染后续增量计算基准
   */
  private exportCurrentData(): DanmakuItem[] {
    return Array.from(this.currentFullData.values()).map(item => this.cloneDanmaku(item))
  }

  /**
   * 去重并过滤空 ID，避免快照增量中出现重复选中项
   */
  private uniqueIds(ids: string[]): string[] {
    return [...new Set(ids.filter(Boolean))]
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
    try {
      const notice = useNoticeStore()
      notice.log(message)
    } catch {
      // 允许在未挂载 Pinia 的单测或独立环境中使用 HistoryManager
    }
  }
}

// 创建全局历史管理器实例
export const historyManager = new HistoryManager()
