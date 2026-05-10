export interface Project {
  meta: {
    version: string
    createdAt: number
  }

  timeline: {
    currentTime: number
    scale: number
    offset: number
    scrollTop: number
  }

  player?: {
    screenWidth: number
    screenHeight: number
    maxLayers: number
  }

  danmakus: any[]
}