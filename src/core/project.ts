export interface Project {
  meta: {
    version: string
    createdAt: number
  }

  timeline: {
    scale: number
    offset: number
  }

  player?: {
    screenWidth: number
    screenHeight: number
    exportXmlAsRatio: boolean
  }

  danmakus: any[]
}