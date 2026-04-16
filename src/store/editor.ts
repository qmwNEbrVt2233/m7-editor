import { defineStore } from 'pinia'
import type { DanmakuItem } from '@/core/danmaku.ts'

export const useEditorStore = defineStore('editor', {
  state: () => ({
    danmakus: [
      {
        id: '1',
        startTime: 0,
        content: {
          text: '██████████████████',
          font: 'Microsoft YaHei',
          size: 60,
          color: '#ffffff',
          stroke: false
        },
        transform: {
          start: { x: 100, y: 100 },
          end: { x: 400, y: 100 },
          zRotate: 0,
          yRotate: 0
        },
        opacity: { from: 1, to: 1 },
        animation: {
          duration: 3000,
          moveDuration: 1000,
          delay: 0,
          easing: 'linear'
        }
      }
    ],
    currentTime: 0,
    playing: false
  }),

  actions: {
    addDanmaku(item: DanmakuItem) {
      this.danmakus.push(item)
    },

    setTime(time: number) {
      this.currentTime = time
    },

    togglePlay() {
      this.playing = !this.playing
    }
  }
})