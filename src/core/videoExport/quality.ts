import { Quality } from 'mediabunny'

export type ExportQuality = 'low' | 'high' | 'very-high' | 'near-lossless'

export function createVideoExportQuality(
  quality: ExportQuality,
  width: number,
  height: number,
  fps: number
) {
  if (quality === 'near-lossless') {
    const referenceBitrate = 30_000_000
    const pixelScale = Math.pow((width * height) / (1920 * 1080), 0.95)
    const fallbackBitrate = Math.min(
      500_000_000,
      Math.max(30_000_000, Math.ceil(referenceBitrate * pixelScale * fps / 30))
    )

    return new Quality({ quantizer: 0, bitrate: fallbackBitrate })
  }

  return new Quality(quality)
}
