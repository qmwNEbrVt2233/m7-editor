import { defineStore } from 'pinia'
import type { DanmakuItem } from '@/core/danmaku.ts'
import { saveProject, loadProject } from '../localstorage/projectStorage'

export const useEditorStore = defineStore('editor', {
  state: () => {
    const saved = loadProject()

    return {
      // 视频相关状态
      videoUrl: saved?.video?.url || '',
      videoDuration: saved?.video?.duration || 0,
      videoElement: null as HTMLVideoElement | null,

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
            moveDuration: 0,
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
      playheadStepMs: 16.666667  // 默认60fps对应的毫秒值
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

          console.log('文件加载成功')
        } catch (e) {
          console.error('文件解析失败', e)
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

    updateDanmaku(id: string, patch: any) {
      const d = this.danmakus.find((d: any) => d.id === id)
      if (!d) return

      Object.assign(d, patch)
    },

    updateSelectedDanmakus(patch: any) {
      this.danmakus.forEach((d: any) => {
        if (this.selectedIds.includes(d.id)) {
          Object.assign(d, patch)
        }
      })
    },

    // 视频相关操作
    setVideoUrl(url: string) {
      this.videoUrl = url
    },

    setVideoDuration(duration: number) {
      this.videoDuration = duration
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
          version: '1.0',
          createdAt: Date.now()
        },
        timeline: {
          scale: 0.1,
          offset: 0
        },
        video: {
          url: this.videoUrl,
          duration: this.videoDuration
        },
        danmakus: this.danmakus
      }
    }
  }
})