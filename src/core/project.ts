export interface Project {
  meta: {
    version: string
    createdAt: number
  }

  timeline: {
    scale: number
    offset: number
  }

  danmakus: any[]
}