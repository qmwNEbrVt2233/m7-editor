import type { DanmakuItem } from './danmaku'

export function toXML(list: DanmakuItem[]) {
  return list
    .map(d => {
      const p = [
        (d.startTime / 1000).toFixed(5),
        7,
        d.content.size,
        parseInt(d.content.color.replace('#', ''), 16),
        Date.now(),
        0,
        '0',
        Math.floor(Math.random() * 100000),
        10
      ].join(',')

      const body = JSON.stringify([
        d.transform.start.x,
        d.transform.start.y,
        `${d.opacity.from}-${d.opacity.to}`,
        d.animation.duration / 1000,
        d.content.text,
        d.transform.zRotate,
        d.transform.yRotate,
        d.transform.end.x,
        d.transform.end.y,
        d.animation.moveDuration,
        d.animation.delay,
        d.content.stroke ? 1 : 0,
        d.content.font,
        d.animation.easing === 'speedup' ? 1 : 0
      ])

      return `<d p="${p}">${body}</d>`
    })
    .join('\n')
}