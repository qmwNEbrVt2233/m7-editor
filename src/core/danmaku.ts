export interface DanmakuItem {
  id: string

  // 时间（统一毫秒）
  startTime: number

  content: {
    text: string
    font: string
    size: number
    color: string
    stroke: boolean
  }

  transform: {
    start: { x: number; y: number }
    end: { x: number; y: number }
    zRotate: number
    yRotate: number
  }

  opacity: {
    from: number
    to: number
  }

  animation: {
    duration: number       // 生存时间 ms
    moveDuration: number   // 运动时间 ms
    delay: number
    easing: 'linear' | 'ease-in'
  }
}