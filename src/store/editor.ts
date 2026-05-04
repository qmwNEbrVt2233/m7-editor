import { defineStore } from 'pinia'
import type { DanmakuItem } from '@/core/danmaku.ts'
import { saveProject, loadProject } from '../localStorage/projectStorage'
import { historyManager } from '@/core/history'
import { watch } from 'vue'
import { parseXML, toXML } from '@/core/converter.ts'

let hasPendingChange = false
let hasSelectionSnapshotWatcher = false

function clearPendingChangeTracking() {
  hasPendingChange = false
}

function ensureSelectionSnapshotWatcher(store: {
  selectedIds: string[]
  danmakus: DanmakuItem[]
}) {
  if (hasSelectionSnapshotWatcher) {
    return
  }

  watch(
    () => store.selectedIds.length,
    (newLen, oldLen) => {
      if (hasPendingChange && oldLen > 0 && newLen === 0) {
        historyManager.recordSnapshot(store.danmakus, '数据修改')
        hasPendingChange = false
      }
    }
  )

  hasSelectionSnapshotWatcher = true
}

function isDanmakuLike(value: unknown): value is DanmakuItem {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, any>
  return (
    candidate.startTime !== undefined &&
    candidate.content &&
    candidate.transform &&
    candidate.opacity &&
    candidate.animation
  )
}

function extractDanmakusFromParsedJson(parsed: unknown): DanmakuItem[] | null {
  if (Array.isArray(parsed)) {
    const danmakus = parsed.filter(isDanmakuLike)
    return danmakus.length > 0 ? (danmakus as DanmakuItem[]) : null
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, any>

    if (Array.isArray(record.danmakus)) {
      const danmakus = record.danmakus.filter(isDanmakuLike)
      return danmakus.length > 0 ? (danmakus as DanmakuItem[]) : null
    }

    if (isDanmakuLike(record)) {
      return [record as DanmakuItem]
    }
  }

  return null
}

function tryParseDanmakusJson(text: string): DanmakuItem[] | null {
  const parsed = JSON.parse(text)
  return extractDanmakusFromParsedJson(parsed)
}

function parsePastedDanmakusText(text: string): DanmakuItem[] {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  if (!trimmed) {
    throw new Error('剪贴板内容为空')
  }

  const sanitized = trimmed.replace(/,\s*([}\]])/g, '$1')
  const wrappedAsArray = `[${sanitized.replace(/^\s*,+|,+\s*$/g, '')}]`

  const candidates = Array.from(new Set([
    trimmed,
    sanitized,
    wrappedAsArray
  ]))

  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const danmakus = tryParseDanmakusJson(candidate)
      if (danmakus && danmakus.length > 0) {
        return JSON.parse(JSON.stringify(danmakus)) as DanmakuItem[]
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('粘贴数据中未找到可用的弹幕')
}

export const useEditorStore = defineStore('editor', {
  state: () => {
    const saved = loadProject()

    return {
      // 视频相关状态
      videoUrl: saved?.video?.url || '',
      videoDuration: saved?.video?.duration || 0,
      videoElement: null as HTMLVideoElement | null,
      videoFilePath: '' as string, // 记录视频文件的磁盘路径

      danmakus: saved?.danmakus || [
        {
          id: '1',
          layer: 0,
          startTime: 0,
          content: {
            text: '欢迎使用m7编辑器',
            font: 'Microsoft YaHei',
            size: 60,
            color: '#ffffff',
            stroke: false
          },
          transform: {
            start: { x: 130, y: 180 },
            end: { x: 130, y: 180 },
            zRotate: 0,
            yRotate: 0
          },
          opacity: { from: 1, to: 1 },
          animation: {
            duration: 2000,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        },
        {
          id: '2',
          layer: 0,
          startTime: 2000,
          content: {
            text: '欢迎使用m7编辑器',
            font: 'Microsoft YaHei',
            size: 60,
            color: '#ffffff',
            stroke: false
          },
          transform: {
            start: { x: 130, y: 180 },
            end: { x: 900, y: 180 },
            zRotate: 0,
            yRotate: 0
          },
          opacity: { from: 1, to: 1 },
          animation: {
            duration: 500,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        }
      ],
      selectedIds: [] as string[],
      currentTime: 0,
      playing: false,
      // 快捷键配置：播放头移动的步长（毫秒）
      playheadStepMs: 16.666667,  // 默认60fps对应的毫秒值
      // 弹幕生存时间配置
      danmakuDuration: {
        mode: 'ms' as 'ms' | 'multiplier',
        value: 1000
      },
      // 播放器与 XML 导出设置
      screenWidth: saved?.player?.screenWidth || 800,
      screenHeight: saved?.player?.screenHeight || 450,
      maxLayers: saved?.player?.maxLayers || 100,
      exportXmlAsRatio: false,
      importXmlDurationOffsetEnabled: true,
      exportXmlDurationOffsetEnabled: true
    }
  },

  getters: {
    /**
     * 获取选中的弹幕列表
     */
    getSelectedDanmakus(): DanmakuItem[] {
      return this.danmakus.filter((d: DanmakuItem) => this.selectedIds.includes(d.id))
    },

    /**
     * 获取选中弹幕的数量
     */
    selectedCount(): number {
      return this.selectedIds.length
    }
  },

  actions: {
    addDanmaku(item: DanmakuItem) {
      this.danmakus.push(item)
    },

    setTime(time: number) {
      this.currentTime = time
    },

    togglePlay() {
      this.playing = !this.playing
    },
    
    startPlayback() {
      this.playing = true
      const startTime = performance.now();
      const initialTime = this.currentTime;

      const loop = () => {
        if (!this.playing) return;
        // 计算当前播放头：暂停时的 currentTime + 本次播放经过的时间
        this.currentTime = initialTime + (performance.now() - startTime);
        requestAnimationFrame(loop);
      };
      loop();
    },

    pausePlayback() {
      this.playing = false
    },

    saveToLocal() {
      const project = this.exportProject()
      saveProject(project)
      console.log('已保存到本地')
    },

    loadFromLocal() {
      const project = loadProject()

      if (!project) {
        console.warn('没有可加载的项目')
        return
      }

      this.danmakus = project.danmakus || []
      
      // 加载视频信息
      if (project.video?.url) {
        this.videoUrl = project.video.url
      }
      if (project.video?.duration) {
        this.videoDuration = project.video.duration
      }

      if (project.player?.screenWidth) {
        this.screenWidth = project.player.screenWidth
      }
      if (project.player?.screenHeight) {
        this.screenHeight = project.player.screenHeight
      }
      if (typeof project.player?.maxLayers === 'number') {
        this.setMaxLayers(project.player.maxLayers)
      }

      console.log('加载完成')
    },

    downloadProject() {
      const project = this.exportProject()

      const blob = new Blob(
        [JSON.stringify(project, null, 2)],
        { type: 'application/json' }
      )

      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = 'project.json'
      a.click()

      URL.revokeObjectURL(url)
    },

    downloadXml() {
      const xml = toXML(this.danmakus, {
        useRatioPosition: this.exportXmlAsRatio,
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        durationOffsetMs: this.exportXmlDurationOffsetEnabled ? 50 : 0
      })
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = 'danmaku.xml'
      a.click()

      URL.revokeObjectURL(url)
    },

    loadFromFile(file: File) {
      const reader = new FileReader()

      reader.onload = () => {
        try {
          const project = JSON.parse(reader.result as string)

          this.danmakus = project.danmakus || []
          
          // 加载视频信息
          if (project.video?.url) {
            this.videoUrl = project.video.url
          }
          if (project.video?.duration) {
            this.videoDuration = project.video.duration
          }

          if (project.player?.screenWidth) {
            this.screenWidth = project.player.screenWidth
          }
          if (project.player?.screenHeight) {
            this.screenHeight = project.player.screenHeight
          }
          if (typeof project.player?.maxLayers === 'number') {
            this.setMaxLayers(project.player.maxLayers)
          }

          console.log('文件加载成功')
        } catch (e) {
          console.error('文件解析失败', e)
        }
      }

      reader.readAsText(file)
    },

    loadXmlFromFile(file: File) {
      const reader = new FileReader()

      reader.onload = () => {
        try {
          const xml = String(reader.result ?? '')
          const { danmakus, errors } = parseXML(xml, {
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            durationOffsetMs: this.importXmlDurationOffsetEnabled ? -50 : 0,
            maxLayers: this.maxLayers
          })

          this.danmakus = danmakus
          this.selectedIds = []
          this.currentTime = 0

          historyManager.clear()
          historyManager.recordSnapshot(this.danmakus, `导入XML(${danmakus.length}条弹幕)`)
          clearPendingChangeTracking()

          errors.forEach((error) => {
            console.warn('[XML 导入] 已跳过异常弹幕:', error.message, error.metadata)
          })

          if (errors.length > 0) {
            console.warn(`[XML 导入] 共跳过 ${errors.length} 条异常弹幕`)
          }

          console.log('XML 导入成功:', danmakus.length, '条弹幕')
        } catch (error) {
          console.error('XML 解析失败', error)
        }
      }

      reader.readAsText(file)
    },

    selectDanmaku(id: string, multi = false) {
      if (multi) {
        if (this.selectedIds.includes(id)) {
          this.selectedIds = this.selectedIds.filter(i => i !== id)
        } else {
          this.selectedIds.push(id)
        }
      } else {
        this.selectedIds = [id]
      }
    },

    clearSelection() {
      this.selectedIds = []
    },

    /*
    _applyDeepPatch(obj: any, patch: any) {
      for (const [key, value] of Object.entries(patch)) {
        if (key.includes('.')) {
          const keys = key.split('.')
          let current = obj
          
          // 迭代到倒数第一个 key 之前
          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i]
            // 确保路径存在
            if (!current[k]) {
              current[k] = {}
            }
            current = current[k]
          }
          
          // 直接设置最深层的值
          // Vue 3 的 reactive 能够拦截到这种深度赋值
          current[keys[keys.length - 1]] = value
        } else {
          obj[key] = value
        }
      }
    },
    */
    _applyDeepPatch(id: string, obj: any, patch: any) {
      for (const [key, value] of Object.entries(patch)) {
        console.log('写入:', key, value, typeof value)
        // 检测到数据被修改，检查是否需要记录快照
        this._checkAndRecordSnapshot()
        
        // 检查是否写入了transform.end
        this._checkAndMovePlayhead(patch, id)

        // ✅ 情况1：路径写法（优先级最高）
        if (key.includes('.')) {
          const keys = key.split('.')
          let current = obj

          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i]
            if (!current[k] || typeof current[k] !== 'object') {
              current[k] = {}
            }
            current = current[k]
          }

          current[keys[keys.length - 1]] = value
          continue
        }

        // ✅ 情况2：value 是对象 → 递归 merge
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          if (!obj[key] || typeof obj[key] !== 'object') {
            obj[key] = {}
          }

          this._applyDeepPatch(id, obj[key], value)
          continue
        }

        // ✅ 情况3：普通值
        obj[key] = value
      }
    },

    updateDanmaku(id: string, patch: any) {
      console.log('正在更新弹幕:', id, '补丁内容:', patch);
      const d = this.danmakus.find((d: any) => d.id === id)
      if (!d) return

      this._applyDeepPatch(id, d, patch)
    },

    updateSelectedDanmakus(patch: any) {
      this.danmakus.forEach((d: any) => {
        if (this.selectedIds.includes(d.id)) {
          this._applyDeepPatch(d.id, d, patch)
        }
      })
    },
    
    /**
     * 检查是否需要记录快照（当没有弹幕被选中时）
    */ 
    _checkAndRecordSnapshot(): void {
      ensureSelectionSnapshotWatcher(this)
      hasPendingChange = true
    },

    _clearPendingChangeTracking(): void {
      clearPendingChangeTracking()
    },
    
    /**
     * 检查是否需要移动播放头
     */
    _checkAndMovePlayhead(patch: any, danmakuId: string): void {
      const hasChangedGrop1 = patch['transform.end.x'] !== undefined || 
                      (patch.transform?.end?.x !== undefined) ||
                      patch['transform.end.y'] !== undefined || 
                      (patch.transform?.end?.y !== undefined) ||
                      patch['opacity.to'] !== undefined || 
                      (patch.opacity?.to !== undefined)
      const hasChangedGrop2 = patch['opacity.from'] !== undefined || 
                      (patch.opacity?.from !== undefined) ||
                      patch['content.text'] !== undefined || 
                      (patch.content?.text !== undefined) ||
                      patch['content.font'] !== undefined || 
                      (patch.content?.font !== undefined) ||
                      patch['content.size'] !== undefined || 
                      (patch.content?.size !== undefined) ||
                      patch['content.color'] !== undefined || 
                      (patch.content?.color !== undefined) ||
                      patch['content.stroke'] !== undefined || 
                      (patch.content?.stroke !== undefined) ||
                      patch['transform.start.x'] !== undefined || 
                      (patch.transform?.start?.x !== undefined)||
                      patch['transform.start.y'] !== undefined || 
                      (patch.transform?.start?.y !== undefined) ||
                      patch['transform.zRotate'] !== undefined || 
                      (patch.transform?.zRotate !== undefined) ||
                      patch['transform.yRotate'] !== undefined || 
                      (patch.transform?.yRotate !== undefined) ||
                      patch['animation.moveDuration'] !== undefined || 
                      (patch.animation?.moveDuration !== undefined) ||
                      patch['animation.delay'] !== undefined || 
                      (patch.animation?.delay !== undefined) ||
                      patch['animation.easing'] !== undefined || 
                      (patch.animation?.easing !== undefined)
      const hasDuration = patch['animation.duration'] !== undefined || 
                      (patch.animation?.duration !== undefined)
      const hasStartTime = patch['startTime'] !== undefined || 
                      (patch.startTime !== undefined)
      if (hasChangedGrop1) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const endTime = danmaku.startTime + danmaku.animation.duration
          this.setTime(endTime)
          console.log('移动播放头到弹幕结束位置:', endTime)
        }
      }
      if (hasChangedGrop2) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const startTime = danmaku.startTime
          this.setTime(startTime)
          console.log('移动播放头到弹幕开始位置:', startTime)
        }
      }
      if (hasDuration) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const endTime = danmaku.startTime + danmaku.animation.duration
            this.setTime(endTime)
            console.log('移动播放头到弹幕结束位置:', endTime)
          }
        }, 10)
      }
      if (hasStartTime) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const startTime = danmaku.startTime
            this.setTime(startTime)
            console.log('移动播放头到弹幕开始位置:', startTime)
          }
        }, 10)
      }
    },

    // 视频相关操作
    setVideoUrl(url: string) {
      this.videoUrl = url
    },

    setVideoDuration(duration: number) {
      this.videoDuration = duration
    },
    
    /**
     * 设置视频文件路径
     */
    setVideoFilePath(path: string) {
      this.videoFilePath = path
    },

    setVideoElement(element: HTMLVideoElement | null) {
      this.videoElement = element
    },

    // 同步视频与播放头位置
    syncVideoToCurrentTime() {
      if (this.videoElement && this.videoUrl) {
        this.videoElement.currentTime = this.currentTime / 1000 // 将ms转换为秒
      }
    },

    // 导出时包含视频信息
    exportProject() {
      return {
        meta: {
          version: '0.2.0',
          createdAt: Date.now()
        },
        timeline: {
          scale: 0.1,
          offset: 0
        },
        video: {
          url: this.videoFilePath || this.videoUrl, // 优先使用文件路径
          duration: this.videoDuration
        },
        player: {
          screenWidth: this.screenWidth,
          screenHeight: this.screenHeight,
          maxLayers: this.maxLayers
        },
        danmakus: this.danmakus
      }
    },

    /**
     * 设置播放器 screen 尺寸
     */
    setScreenSize(width: number, height: number) {
      this.screenWidth = Math.max(1, Math.round(width))
      this.screenHeight = Math.max(1, Math.round(height))
    },

    /**
     * 设置 XML 导出是否使用比例坐标
     */
    setExportXmlAsRatio(enabled: boolean) {
      this.exportXmlAsRatio = enabled
    },

    setImportXmlDurationOffsetEnabled(enabled: boolean) {
      this.importXmlDurationOffsetEnabled = enabled
    },

    setExportXmlDurationOffsetEnabled(enabled: boolean) {
      this.exportXmlDurationOffsetEnabled = enabled
    },

    setMaxLayers(value: number) {
      const normalized = Math.max(1, Math.round(value))
      const maxUsedLayer = this.danmakus.reduce((max: number, danmaku: any) => {
        return Math.max(max, danmaku.layer)
      }, -1)
      const minimumAllowed = Math.max(1, maxUsedLayer + 1)

      this.maxLayers = Math.max(normalized, minimumAllowed)
    },

    /**
     * 生成新的弹幕ID
     * 确保ID在所有弹幕中是唯一的
     */
    generateNewId(): string {
      let maxId = 0
      this.danmakus.forEach((d: DanmakuItem) => {
        const id = parseInt(d.id)
        if (!isNaN(id) && id > maxId) {
          maxId = id
        }
      })
      return String(maxId + 1)
    },

    /**
     * 检查给定的时间段在某个layer上是否与其他弹幕冲突
     * 冲突判断：startTime1 < startTime2 + duration2 && startTime2 < startTime1 + duration1
     */
    isTimeConflict(startTime: number, duration: number, layer: number, excludeIds: string[] = []): boolean {
      return this.danmakus.some((d: DanmakuItem) => {
        if (d.layer !== layer || excludeIds.includes(d.id)) return false
        return startTime < d.startTime + d.animation.duration && d.startTime < startTime + duration
      })
    },

    /**
     * 为多条弹幕分配合适的layer值，避免时间冲突
     * @param danmakusToAdd 要添加的弹幕数组
     */
    assignLayersForDanmakus(danmakusToAdd: DanmakuItem[]): void {
      danmakusToAdd.forEach((newDanmaku) => {
        let layer = newDanmaku.layer
        const maxLayers = this.maxLayers

        // 如果当前layer有冲突，则尝试更高的layer
        while (
          layer < maxLayers &&
          this.isTimeConflict(newDanmaku.startTime, newDanmaku.animation.duration, layer, [newDanmaku.id])
        ) {
          layer++
        }

        newDanmaku.layer = Math.min(layer, maxLayers - 1)
      })
    },

    /**
     * 处理多条弹幕的startTime偏移
     * 将所有要创建的弹幕中最小的startTime作为基准，计算与播放头的差值，应用于所有弹幕
     * @param danmakusToAdd 要添加的弹幕数组
     */
    adjustStartTimesForDanmakus(danmakusToAdd: DanmakuItem[]): void {
      if (danmakusToAdd.length === 0) return

      // 找最小的startTime
      const minStartTime = Math.min(...danmakusToAdd.map((d) => d.startTime))

      // 计算偏移量（播放头位置 - 最小startTime）
      const offset = this.currentTime - minStartTime

      // 应用偏移到所有弹幕
      danmakusToAdd.forEach((d) => {
        d.startTime = Math.max(0, d.startTime + offset)
      })
    },

    /**
     * 创建单条弹幕
     */
    createSingleDanmaku(): void {
      let duration = 1000

      if (this.danmakuDuration.mode === 'ms') {
        duration = Math.max(100, this.danmakuDuration.value)
      } else if (this.danmakuDuration.mode === 'multiplier') {
        // 倍数模式：基于playheadStepMs计算
        const playheadStepMs = this.playheadStepMs || 16.666667
        duration = Math.round(Math.max(100, playheadStepMs * this.danmakuDuration.value))
      }

      const newDanmaku: DanmakuItem = {
        id: this.generateNewId(),
        layer: 0,
        startTime: Math.round(this.currentTime),
        content: {
          text: '请输入弹幕内容',
          font: 'Microsoft YaHei',
          size: 60,
          color: '#ffffff',
          stroke: false
        },
        transform: {
          start: { x: 130, y: 180 },
          end: { x: 130, y: 180 },
          zRotate: 0,
          yRotate: 0
        },
        opacity: { from: 1, to: 1 },
        animation: {
          duration,
          moveDuration: 500,
          delay: 0,
          easing: 'speedup'
        }
      }

      // 检查layer冲突并分配合适的layer
      this.assignLayersForDanmakus([newDanmaku])

      // 添加弹幕
      this.danmakus.push(newDanmaku)

      // 清空选择，并将新弹幕ID加入选择
      this.selectedIds = [newDanmaku.id]

      // 记录历史
      historyManager.recordSnapshot(this.danmakus, '创建弹幕')
      clearPendingChangeTracking()

      console.log('[操作] 创建单条弹幕:', newDanmaku.id)
    },

    /**
     * 删除选中的弹幕
     */
    deleteSelectedDanmakus(): void {
      const idsToDelete = [...this.selectedIds]
      this.danmakus = this.danmakus.filter((d: DanmakuItem) => !idsToDelete.includes(d.id))
      this.selectedIds = []

      // 记录历史
      historyManager.recordSnapshot(this.danmakus, `删除${idsToDelete.length}条弹幕`)
      clearPendingChangeTracking()

      console.log('[操作] 删除弹幕:', idsToDelete)
    },

    /**
     * 复制选中的弹幕数据到剪贴板
     */
    copySelectedDanmakus(): void {
      const selectedDanmakus = this.getSelectedDanmakus
      if (selectedDanmakus.length === 0) {
        console.warn('[操作] 没有选中的弹幕')
        return
      }

      const data = JSON.stringify(selectedDanmakus)
      navigator.clipboard.writeText(data).catch(() => {
        console.error('[操作] 复制到剪贴板失败')
      })

      console.log('[操作] 复制弹幕:', selectedDanmakus.length, '条')
    },

    /**
     * 粘贴弹幕
     * 从剪贴板读取并创建多条弹幕
     * 依次逐个分配ID和layer
     */
    async pasteDanmakus(): Promise<void> {
      try {
        const text = await navigator.clipboard.readText()
        const danmakusToAdd = parsePastedDanmakusText(text)

        if (!Array.isArray(danmakusToAdd)) {
          console.error('[操作] 粘贴数据格式错误: 未解析出弹幕数组')
          return
        }

        // 依次逐个为每条弹幕生成新ID
        // 关键：逐个生成ID时，需要确保每个ID都是新的
        let currentMaxId = 0
        this.danmakus.forEach((d: DanmakuItem) => {
          const id = parseInt(d.id)
          if (!isNaN(id) && id > currentMaxId) {
            currentMaxId = id
          }
        })
        
        // 为每条弹幕逐个递推分配ID
        danmakusToAdd.forEach((d) => {
          currentMaxId++
          d.id = String(currentMaxId)
          console.log('为粘贴的弹幕分配ID:', d.id)
        })

        // 调整startTime：以最小的startTime作为基准，调整到播放头位置
        this.adjustStartTimesForDanmakus(danmakusToAdd)

        // 按layer排序，然后逐个分配layer，避免弹幕之间的冲突
        this.assignLayersForDanmakusSequentially(danmakusToAdd)

        // 添加到弹幕列表
        this.danmakus.push(...danmakusToAdd)

        // 更新选中状态为新粘贴的弹幕
        this.selectedIds = danmakusToAdd.map((d) => d.id)

        // 记录历史
        historyManager.recordSnapshot(this.danmakus, `粘贴${danmakusToAdd.length}条弹幕`)
        clearPendingChangeTracking()

        console.log('[操作] 粘贴弹幕:', danmakusToAdd.length, '条')
      } catch (error) {
        console.error('[操作] 粘贴失败:', error)
      }
    },
    
    /**
     * 按layer排序后逐个分配layer
     * 这样可以确保粘贴的多条弹幕之间也能正确避让
     */
    assignLayersForDanmakusSequentially(danmakusToAdd: DanmakuItem[]): void {
      // 按layer排序
      const sorted = [...danmakusToAdd].sort((a, b) => a.layer - b.layer)
      
      sorted.forEach((danmakuToProcess) => {
        let layer = danmakuToProcess.layer
        const maxLayers = this.maxLayers
        
        // 对于每条弹幕，检查它与所有其他弹幕的冲突
        while (layer < maxLayers) {
          let hasConflict = false
          
          // 检查与既有弹幕的冲突
          for (const existing of this.danmakus) {
            if (existing.layer === layer) {
              const conflict = danmakuToProcess.startTime < existing.startTime + existing.animation.duration &&
                              existing.startTime < danmakuToProcess.startTime + danmakuToProcess.animation.duration
              if (conflict) {
                hasConflict = true
                break
              }
            }
          }
          
          // 检查与已处理弹幕的冲突
          if (!hasConflict) {
            for (const processed of sorted) {
              if (processed === danmakuToProcess) break // 只检查已处理的
              
              if (processed.layer === layer) {
                const conflict = danmakuToProcess.startTime < processed.startTime + processed.animation.duration &&
                                processed.startTime < danmakuToProcess.startTime + danmakuToProcess.animation.duration
                if (conflict) {
                  hasConflict = true
                  break
                }
              }
            }
          }
          
          if (!hasConflict) {
            break // 找到合适的layer
          }
          layer++
        }
        
        danmakuToProcess.layer = Math.min(layer, maxLayers - 1)
      })
    },

    /**
     * 撤销操作
     */
    undo(): void {
      const result = historyManager.undo()
      if (result) {
        this.danmakus = result
        this.selectedIds = []
        clearPendingChangeTracking()
      }
    },

    /**
     * 重做操作
     */
    redo(): void {
      const result = historyManager.redo()
      if (result) {
        this.danmakus = result
        this.selectedIds = []
        clearPendingChangeTracking()
      }
    },

    /**
     * 初始化历史记录（在项目加载时调用）
     */
    initHistory(): void {
      historyManager.clear()
      historyManager.recordSnapshot(this.danmakus, '项目初始化')
      clearPendingChangeTracking()
    },

    /**
     * 更新弹幕生存时间配置
     */
    setDanmakuDuration(mode: 'ms' | 'multiplier', value: number): void {
      this.danmakuDuration.mode = mode
      this.danmakuDuration.value = value
    },
    
    /**
     * 清空缓存工程
     */
    clearCache(): void {
      const confirmed = window.confirm('确定要清空本地缓存的工程吗？此操作不可撤销。')
      if (confirmed) {
        localStorage.clear()
        console.log('[操作] 已清空缓存工程')
        // 重新加载以恢复默认状态
        window.location.reload()
      }
    },

    moveSelectedLayers(delta: number): void {
      if (!Number.isFinite(delta) || delta === 0 || this.selectedIds.length === 0) {
        return
      }

      const selectedDanmakus = this.danmakus.filter((d: DanmakuItem) => this.selectedIds.includes(d.id))
      if (selectedDanmakus.length === 0) {
        return
      }

      const minLayer = Math.min(...selectedDanmakus.map((d: any) => d.layer))
      const maxLayer = Math.max(...selectedDanmakus.map((d: any) => d.layer))

      let appliedDelta = Math.trunc(delta)
      if (appliedDelta < 0) {
        appliedDelta = Math.max(appliedDelta, -minLayer)
      } else {
        appliedDelta = Math.min(appliedDelta, (this.maxLayers - 1) - maxLayer)
      }

      if (appliedDelta === 0) {
        return
      }

      selectedDanmakus.forEach((danmaku: any) => {
        danmaku.layer += appliedDelta
      })

      this._checkAndRecordSnapshot()
    }
  }
})