import { defineStore } from 'pinia'
import { useNoticeStore } from './notice'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import type { DanmakuItem } from '@/core/danmaku.ts'
import { saveProject, loadProject, clearProject } from '../localStorage/projectStorage'
import { historyManager } from '@/core/history'
import { parseXML, toXML } from '@/core/converter.ts'
import {
  getProjectVideoPath,
  isTauriRuntime,
  registerMediaPath
} from '@/utils/tauriMedia'

type SavePickerAcceptType = {
  description: string
  accept: Record<string, string[]>
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: SavePickerAcceptType[]
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

export async function saveBlobWithFallback(
  blob: Blob,
  filename: string,
  acceptType: SavePickerAcceptType
) {
  const notice = useNoticeStore()
  const savePickerWindow = window as SavePickerWindow

  if (typeof savePickerWindow.showSaveFilePicker !== 'function') {
    triggerBlobDownload(blob, filename)
    return
  }

  try {
    const fileHandle = await savePickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [acceptType]
    })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    notice.log(`'[保存] File System Access API 保存失败，回退到 Blob 下载'`, error)
    triggerBlobDownload(blob, filename)
  }
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
    const savedVideoPath = getProjectVideoPath(saved?.video)
    historyManager.recordSnapshot(saved?.danmakus || [], `加载工程(${(saved?.danmakus || []).length}条弹幕)`)

    return {
      // 视频相关状态
      videoUrl: savedVideoPath ? '' : saved?.video?.url || '',
      videoDuration: saved?.video?.duration || 0,
      videoElement: null as HTMLVideoElement | null,
      videoFilePath: savedVideoPath, // 记录视频文件的磁盘路径

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
            end: { x: 800, y: 180 },
            zRotate: 0,
            yRotate: 0
          },
          opacity: { from: 1, to: 0 },
          animation: {
            duration: 500,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        }
      ],
      selectedIds: [] as string[],
      currentTime: saved?.timeline?.currentTime || 0,
      timelineScale: saved?.timeline?.scale || 0.1,
      timelineOffset: saved?.timeline?.offset || 0,
      timelineScrollTop: saved?.timeline?.scrollTop || 0,
      playing: false,
      aggressiveOptimization: false,
      // 屏幕录制模式
      screenRecordingMode: false,
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
      screenScale: saved?.player?.screenScale || Math.round(window.innerHeight / (saved?.player?.screenHeight || 450) * 100 * 0.55),
      maxLayers: saved?.player?.maxLayers || 100,
      exportXmlAsRatio: false,
      importXmlDurationOffsetEnabled: true,
      exportXmlDurationOffsetEnabled: true,
      allowNegativeValues: saved?.preprocess?.allowNegativeValues || false,
      showCreationTools: false,
      showSpectrogram: saved?.timeline?.showSpectrogram || false,
      spectrogramColorScheme: saved?.timeline?.spectrogramColorScheme || 'default',
      spectrogramCustomColor: saved?.timeline?.spectrogramCustomColor || '#00bbff',
      // 导入完成时间戳：用于触发缓冲池重构
      importTimestamp: 0,
      // _applyDeepPatch 防抖计时器
      _applyDeepPatchDebounceTimer: null as ReturnType<typeof setTimeout> | null,
      // moveSelectedLayers 防抖计时器
      _moveSelectedLayersDebounceTimer: null as ReturnType<typeof setTimeout> | null
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

    setAggressiveOptimization(enabled: boolean) {
      this.aggressiveOptimization = enabled
    },
     
    startPlayback() {
      this.playing = true
      const startTime = performance.now()
      const initialTime = this.currentTime

      const loop = () => {
        if (!this.playing) return
        // 计算当前播放头：暂停时的 currentTime + 本次播放经过的时间
        this.currentTime = initialTime + (performance.now() - startTime)
        requestAnimationFrame(loop)
      }
      loop()
    },

    pausePlayback() {
      this.playing = false
    },

    saveToLocal() {
      const project = this.exportProject()
      saveProject(project)
      console.log('已保存到本地')
    },

    async loadFromLocal() {
      const project = loadProject()

      if (!project) {
        console.warn('没有可加载的项目')
        return
      }

      await this.applyProject(project)
      historyManager.recordSnapshot(this.danmakus, `加载工程(${this.danmakus.length}条弹幕)`)

      console.log('加载完成')
    },

    async downloadProject() {
      const project = this.exportProject()

      const blob = new Blob(
        [JSON.stringify(project, null, 2)],
        { type: 'application/json' }
      )

      await saveBlobWithFallback(blob, 'project.json', {
        description: 'JSON 工程文件',
        accept: {
          'application/json': ['.json']
        }
      })
    },

    async downloadXml() {
      const xml = toXML(this.danmakus, {
        useRatioPosition: this.exportXmlAsRatio,
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        durationOffsetMs: this.exportXmlDurationOffsetEnabled ? 50 : 0
      })
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })

      await saveBlobWithFallback(blob, 'danmaku.xml', {
        description: 'XML 弹幕文件',
        accept: {
          'application/xml': ['.xml'],
          'text/xml': ['.xml']
        }
      })
    },

    async saveBlob(
      blob: Blob,
      filename: string,
      acceptType: SavePickerAcceptType
    ) {
      await saveBlobWithFallback(blob, filename, acceptType)
    },

    loadFromFile(file: File) {
      const notice = useNoticeStore()
      const reader = new FileReader()

      reader.onload = async () => {
        try {
          const project = JSON.parse(reader.result as string)
          await this.applyProject(project)
          historyManager.recordSnapshot(this.danmakus, `导入工程(${this.danmakus.length}条弹幕)`)
          // 标记导入完成，触发缓冲池重构
          this.importTimestamp = Date.now()

          console.log('文件加载成功')
        } catch (e) {
          console.error('文件解析失败', e)
          notice.alert((e instanceof Error ? e.message : String(e)), 'error', '文件解析失败: ', e)
        }
      }

      reader.readAsText(file)
    },

    loadXmlFromFile(file: File) {
      const notice = useNoticeStore()
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
          historyManager.recordSnapshot(this.danmakus)

          errors.forEach((error) => {
            notice.log('[XML 导入] 已跳过异常弹幕:'+ error.message + '，导出日志以获取更多信息', error.metadata)
          })

          if (errors.length > 0) {
            console.warn(`[XML 导入] 共跳过 ${errors.length} 条异常弹幕`)
          }
          
          // 标记导入完成，触发缓冲池重构
          this.importTimestamp = Date.now()

          notice.alert(errors.length === 0 ? `共 ${danmakus.length} 条，未见异常弹幕` : `共 ${danmakus.length} 条，共跳过 ${errors.length} 条异常弹幕`, errors.length === 0 ? 'success' : 'warn', 'XML导入成功')
        } catch (error) {
          notice.alert(error instanceof Error ? error.message : String(error), 'error', 'XML解析失败', error)
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
    
    _applyDeepPatch(id: string, obj: any, patch: any) {
      for (const [key, value] of Object.entries(patch)) {
        // console.log('写入:', key, value, typeof value)

        // 情况1：路径写法（优先级最高）
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

        // 情况2：value 是对象 → 递归 merge
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

        // 情况3：普通值
        obj[key] = value
      }

      // 防抖处理：清除之前的计时器，设置新的100ms延迟
      if (this._applyDeepPatchDebounceTimer) {
        clearTimeout(this._applyDeepPatchDebounceTimer)
      }

      this._applyDeepPatchDebounceTimer = setTimeout(() => {
        historyManager.recordSnapshot(this.danmakus)
        this._checkAndMovePlayhead(patch, id)
        this._applyDeepPatchDebounceTimer = null
      }, 100)
    },

    updateDanmaku(id: string, patch: any) {
      // console.log('正在更新弹幕:', id, '补丁内容:', patch);
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
     * 检查是否需要移动播放头
     */
    _checkAndMovePlayhead(patch: any, danmakuId: string): void {
      const hasDuration = patch['animation.duration'] !== undefined || 
                      (patch.animation?.duration !== undefined)
      const hasStartTime = patch['startTime'] !== undefined || 
                      (patch.startTime !== undefined)
      const hasChangedGrop1 = patch['transform.end.x'] !== undefined || 
                      (patch.transform?.end?.x !== undefined) ||
                      patch['transform.end.y'] !== undefined || 
                      (patch.transform?.end?.y !== undefined) ||
                      patch['opacity.to'] !== undefined || 
                      (patch.opacity?.to !== undefined)
      const hasChangedGrop2 = !(hasChangedGrop1 || hasDuration || hasStartTime)
      if (hasChangedGrop1) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const endTime = danmaku.startTime + danmaku.animation.duration
          this.setTime(endTime)
          // console.log('移动播放头到弹幕结束位置:', endTime)
        }
      }
      if (hasChangedGrop2) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        if (danmaku) {
          const startTime = danmaku.startTime
          this.setTime(startTime)
          // console.log('移动播放头到弹幕开始位置:', startTime)
        }
      }
      if (hasDuration) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const endTime = danmaku.startTime + danmaku.animation.duration
            this.setTime(endTime)
            // console.log('移动播放头到弹幕结束位置:', endTime)
          }
        }, 10)
      }
      if (hasStartTime) {
        const danmaku = this.danmakus.find((d: any) => d.id === danmakuId)
        setTimeout(() => {
          if (danmaku) {
            const startTime = danmaku.startTime
            this.setTime(startTime)
            // console.log('移动播放头到弹幕开始位置:', startTime)
          }
        }, 10)
      }
    },

    // 视频相关操作
    setVideoUrl(url: string) {
      this.videoUrl = url
    },

    setVideoSource(url: string, path = '') {
      this.videoUrl = url
      this.videoFilePath = path
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

    async resolveVideoPath(path?: string) {
      const notice = useNoticeStore()
      path = path ?? this.videoFilePath
      if (!path) return

      this.videoFilePath = path

      if (!isTauriRuntime()) {
        if (path.startsWith('file://')) {
          this.videoUrl = path
        }
        return
      }

      try {
        const media = await registerMediaPath(path)
        this.videoFilePath = media.path
        this.videoUrl = media.url
      } catch (error) {
        notice.alert('无法读取工程中的媒体文件:', 'error', '错误', path + error)
        this.videoUrl = ''
      }
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
    
    // 时间轴视图相关操作
    setTimelineView(scale: number, offset: number, scrollTop?: number) {
      if (Number.isFinite(scale)) {
        this.timelineScale = Math.max(0.01, Math.min(3, scale))
      }

      if (Number.isFinite(offset)) {
        this.timelineOffset = Math.max(0, offset)
      }

      if (Number.isFinite(scrollTop)) {
        this.timelineScrollTop = Math.max(0, scrollTop as number)
      }
    },

    // 工程参数加载
    async applyProject(project: any) {
      this.danmakus = project.danmakus || []
      this.selectedIds = []

      const videoPath = getProjectVideoPath(project.video)

      if (videoPath) {
        await this.resolveVideoPath(videoPath)
      } else if (project.video?.url) {
        this.videoFilePath = ''
        this.videoUrl = project.video.url
      } else {
        this.videoFilePath = ''
        this.videoUrl = ''
      }

      if (typeof project.video?.duration === 'number') {
        this.videoDuration = project.video.duration
      }

      if (typeof project.player?.screenWidth === 'number') {
        this.screenWidth = project.player.screenWidth
      }
      if (typeof project.player?.screenHeight === 'number') {
        this.screenHeight = project.player.screenHeight
      }
      if (typeof project.player?.screenScale === 'number') {
        this.screenScale = project.player.screenScale
      }
      if (typeof project.player?.maxLayers === 'number') {
        this.setMaxLayers(project.player.maxLayers)
      }
      if (typeof project.preprocess?.allowNegativeValues === 'boolean') {
        this.allowNegativeValues = project.preprocess.allowNegativeValues
      }
      if (typeof project.timeline?.showSpectrogram === 'boolean') {
        this.showSpectrogram = project.timeline.showSpectrogram
      }
      if (typeof project.timeline?.spectrogramColorScheme === 'string') {
        this.spectrogramColorScheme = project.timeline.spectrogramColorScheme
      }
      if (typeof project.timeline?.spectrogramCustomColor === 'string') {
        this.spectrogramCustomColor = project.timeline.spectrogramCustomColor
      }

      this.currentTime = typeof project.timeline?.currentTime === 'number'
        ? Math.max(0, Math.round(project.timeline.currentTime))
        : 0

      this.setTimelineView(
        typeof project.timeline?.scale === 'number' ? project.timeline.scale : 0.1,
        typeof project.timeline?.offset === 'number' ? project.timeline.offset : 0,
        typeof project.timeline?.scrollTop === 'number' ? project.timeline.scrollTop : 0,
      )
    },

    // 导出时包含视频信息
    exportProject() {
      return {
        meta: {
          version: '1.6.0',
          createdAt: Date.now()
        },
        timeline: {
          currentTime: this.currentTime,
          scale: this.timelineScale,
          offset: this.timelineOffset,
          scrollTop: this.timelineScrollTop,
          showSpectrogram: this.showSpectrogram,
          spectrogramColorScheme: this.spectrogramColorScheme,
          spectrogramCustomColor: this.spectrogramCustomColor,
        },
        video: {
          path: this.videoFilePath,
          url: this.videoFilePath || this.videoUrl, // 优先使用文件路径
          duration: this.videoDuration
        },
        player: {
          screenWidth: this.screenWidth,
          screenHeight: this.screenHeight,
          screenScale: this.screenScale,
          maxLayers: this.maxLayers
        },
        preprocess: {
          allowNegativeValues: this.allowNegativeValues
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

    setScreenScale(scale: number) {
      this.screenScale = Math.max(1, Math.round(scale))
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

    setAllowNegativeValues(enabled: boolean) {
      this.allowNegativeValues = enabled
    },

    setMaxLayers(value: number) {
      const normalized = Math.max(1, Math.round(value))
      const maxUsedLayer = this.danmakus.reduce((max: number, danmaku: any) => {
        return Math.max(max, danmaku.layer)
      }, -1)
      const minimumAllowed = Math.max(1, maxUsedLayer + 1)

      this.maxLayers = Math.max(normalized, minimumAllowed)
    },

    setShowSpectrogram(enabled: boolean) {
      this.showSpectrogram = enabled
    },

    setSpectrogramColorScheme(scheme: string) {
      this.spectrogramColorScheme = scheme
    },

    setSpectrogramCustomColor(color: string) {
      this.spectrogramCustomColor = color
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
        d.startTime = Math.round(Math.max(0, d.startTime + offset))
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
          text: '',
          font: 'SimHei',
          size: 60,
          color: '#ffffff',
          stroke: false
        },
        transform: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
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

      console.log('创建单条弹幕:', newDanmaku.id)
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

      console.log('删除弹幕:', idsToDelete)
    },

    /**
     * 写入数据到剪贴板
     * 尝试使用Tauri剪贴板插件，回退到浏览器API
     */
    async _writeToClipboard(data: string): Promise<void> {
      const notice = useNoticeStore()
      try {
        // 尝试使用Tauri2剪贴板插件
        await writeText(data)
        console.log('[剪贴板] 已通过Tauri插件写入')
      } catch (error) {
        console.warn('[剪贴板] Tauri剪贴板插件不可用，回退到浏览器API', error)
        try {
          await navigator.clipboard.writeText(data)
          console.log('[剪贴板] 已通过浏览器API写入')
        } catch (fallbackError) {
          notice.alert('写入剪贴板的两种方法均失败，粘贴弹幕功能不可用', 'error', '剪贴板错误', `${fallbackError}`)
          throw new Error('复制到剪贴板失败')
        }
      }
    },

    /**
     * 从剪贴板读取数据
     * 尝试使用Tauri剪贴板插件，回退到浏览器API
     */
    async _readFromClipboard(): Promise<string> {
      const notice = useNoticeStore()
      try {
        // 尝试使用Tauri2剪贴板插件
        const data = await readText()
        console.log('[剪贴板] 已通过Tauri插件读取')
        return data
      } catch (error) {
        console.warn('[剪贴板] Tauri剪贴板插件不可用，回退到浏览器API', error)
        try {
          const data = await navigator.clipboard.readText()
          console.log('[剪贴板] 已通过浏览器API读取')
          return data
        } catch (fallbackError) {
          notice.alert('[剪贴板] 读取剪贴板的两种方法均失败，粘贴弹幕功能不可用', 'error', '剪贴板错误', fallbackError)
          throw new Error('从剪贴板读取失败')
        }
      }
    },

    /**
     * 复制当前帧弹幕
     */
    async copyCurrentFrameDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      const time = this.currentTime

      // 获取当前可见的弹幕（在当前时间区间内）
      let visibleDanmakus = this.danmakus.filter((d: DanmakuItem) => {
        return time >= d.startTime && time <= d.startTime + d.animation.duration
      })

      // 如果有选中的弹幕，进一步过滤
      if (this.selectedIds.length > 0) {
        visibleDanmakus = visibleDanmakus.filter((d: DanmakuItem) =>
          this.selectedIds.includes(d.id)
        )
      }

      if (visibleDanmakus.length === 0) {
        notice.log('当前帧没有可复制的弹幕')
        return
      }

      // 计算渲染状态并创建新的弹幕对象
      const copiedDanmakus: DanmakuItem[] = visibleDanmakus.map((d: DanmakuItem) => {
        // 计算渲染进度
        const t = time - d.startTime
        const { delay, moveDuration, easing } = d.animation

        let progress = 0
        if (moveDuration <= 0) {
          progress = 1
        } else if (t <= delay) {
          progress = 0
        } else {
          progress = (t - delay) / moveDuration
        }

        progress = Math.max(0, Math.min(1, progress))

        // 应用 easing 函数
        if (easing === 'speedup') {
          progress = progress * progress
        } else {
          progress = 1 - (1 - progress) * (1 - progress)
        }

        // 计算当前位置
        const x =
          Math.round(d.transform.start.x +
          (d.transform.end.x - d.transform.start.x) * progress)
        const y =
          Math.round(d.transform.start.y +
          (d.transform.end.y - d.transform.start.y) * progress)

        // 计算当前透明度
        const lifeProgress = Math.max(
          0,
          Math.min(1, (time - d.startTime) / d.animation.duration)
        )
        const opacity =
          (d.opacity.from + (d.opacity.to - d.opacity.from) * lifeProgress).toFixed(2)
        const opacityValue = parseFloat(opacity)

        // 计算 duration（使用用户设置）
        let duration = 1000
        if (this.danmakuDuration.mode === 'ms') {
          duration = Math.round(Math.max(100, this.danmakuDuration.value))
        } else if (this.danmakuDuration.mode === 'multiplier') {
          const playheadStepMs = this.playheadStepMs || 16.666667
          duration = Math.round(
            Math.max(100, playheadStepMs * this.danmakuDuration.value)
          )
        }

        // 创建新的弹幕对象（没有变换，起始与结束相同）
        return {
          id: d.id,
          layer: d.layer,
          startTime: 0,
          content: d.content,
          transform: {
            start: { x, y },
            end: { x, y },
            zRotate: d.transform.zRotate,
            yRotate: d.transform.yRotate
          },
          opacity: { from: opacityValue, to: opacityValue },
          animation: {
            duration,
            moveDuration: 500,
            delay: 0,
            easing: 'speedup'
          }
        }
      })

      const data = JSON.stringify(copiedDanmakus)
      try {
        await this._writeToClipboard(data)
        notice.log('复制当前帧弹幕:' + copiedDanmakus.length + '条')
      } catch (error) {
        notice.alert('复制到剪贴板失败:', 'error', '剪贴板错误', error)
      }
    },

    /**
     * 复制选中的弹幕数据到剪贴板
     */
    async copySelectedDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      const selectedDanmakus = this.getSelectedDanmakus
      if (selectedDanmakus.length === 0) {
        notice.alert('没有选中的弹幕', 'error')
        return
      }

      const data = JSON.stringify(selectedDanmakus)
      try {
        await this._writeToClipboard(data)
        notice.log('复制弹幕:' + selectedDanmakus.length + '条')
      } catch (error) {
        notice.alert('复制到剪贴板失败:', 'error', '剪贴板错误', error)
      }
    },

    /**
     * 粘贴弹幕
     * 从剪贴板读取并创建多条弹幕
     * 依次逐个分配ID和layer
     */
    async pasteDanmakus(): Promise<void> {
      const notice = useNoticeStore()
      try {
        const text = await this._readFromClipboard()
        const danmakusToAdd = parsePastedDanmakusText(text)

        if (!Array.isArray(danmakusToAdd)) {
          notice.alert('粘贴数据格式错误: 未解析出弹幕数组', 'error', '剪贴板错误')
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

        notice.log('粘贴弹幕:' + danmakusToAdd.length + '条')
      } catch (error) {
        notice.alert('粘贴失败:', 'error', '剪贴板错误', error)
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
      }
    },

    /**
     * 初始化历史记录（在项目加载时调用）
     */
    initHistory(): void {
      historyManager.clear()
      historyManager.recordSnapshot(this.danmakus, '项目初始化')
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
    async clearCache(): Promise<void> {
      const notice = useNoticeStore()
      const confirmed = await notice.confirm('确定要清空本地缓存的工程吗？此操作不可撤销。')
      if (confirmed) {
        clearProject()
        notice.log('已清空缓存工程')
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

      // 防抖处理：清除之前的计时器，设置新的500ms延迟
      if (this._moveSelectedLayersDebounceTimer) {
        clearTimeout(this._moveSelectedLayersDebounceTimer)
      }

      this._moveSelectedLayersDebounceTimer = setTimeout(() => {
        historyManager.recordSnapshot(this.danmakus, '移动选中弹幕层级')
        this._moveSelectedLayersDebounceTimer = null
      }, 500)
    }
  }
})
