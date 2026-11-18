import { canEncodeVideo, Quality, type VideoCodec } from 'mediabunny'

export type ExportQuality = 'low' | 'high' | 'very-high' | 'near-lossless'

const EXPORT_QUALITIES = new Set<ExportQuality>(['low', 'high', 'very-high', 'near-lossless'])

export function isValidExportQuality(value: unknown): value is ExportQuality {
  return typeof value === 'string' && EXPORT_QUALITIES.has(value as ExportQuality)
}

export type DirectVideoEncodingTarget = {
  codec: VideoCodec
  quality: Quality
  hardwareAcceleration: 'prefer-hardware' | 'no-preference'
}

export function computeNearLosslessBitrate(width: number, height: number, fps: number): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1920
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1080
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  const referenceBitrate = 30_000_000
  const pixelScale = Math.pow((safeWidth * safeHeight) / (1920 * 1080), 0.95)
  const raw = Math.ceil((referenceBitrate * pixelScale * safeFps) / 30)
  if (!Number.isFinite(raw)) {
    return 500_000_000
  }
  return Math.min(500_000_000, Math.max(30_000_000, raw))
}

export function createVideoExportQuality(
  quality: ExportQuality,
  width: number,
  height: number,
  fps: number
) {
  const safeQuality: ExportQuality = isValidExportQuality(quality) ? quality : 'very-high'
  if (safeQuality === 'near-lossless') {
    const bitrate = computeNearLosslessBitrate(width, height, fps)

    // Quantizer 0 triggers slow CPU/lossless encoding paths on H.264/HEVC WebCodecs;
    // high VBR matching the WebKit target keeps hardware encoders fast and visually lossless.
    return new Quality({ bitrate, bitrateMode: 'variable' })
  }

  return new Quality(safeQuality)
}

export async function resolveDirectVideoEncodingTarget(
  width: number,
  height: number,
  fps: number,
  quality: ExportQuality
): Promise<DirectVideoEncodingTarget | null> {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isFinite(fps) ||
    width < 16 ||
    width > 7680 ||
    height < 16 ||
    height > 4320 ||
    width % 2 !== 0 ||
    height % 2 !== 0 ||
    fps <= 0 ||
    fps > 120 ||
    !isValidExportQuality(quality)
  ) {
    return null
  }

  const resolvedQuality = createVideoExportQuality(quality, width, height, fps)
  const exceedsStandard4k = width > 4096 || height > 4096
  const nearLosslessBitrate =
    quality === 'near-lossless' ? computeNearLosslessBitrate(width, height, fps) : 0
  const cappedQuality = nearLosslessBitrate > 240_000_000
    ? new Quality({ bitrate: 240_000_000, bitrateMode: 'variable' })
    : null

  const candidates: Array<DirectVideoEncodingTarget> = [
    { codec: 'avc', quality: resolvedQuality, hardwareAcceleration: 'prefer-hardware' },
    ...(cappedQuality
      ? [{ codec: 'avc' as const, quality: cappedQuality, hardwareAcceleration: 'prefer-hardware' as const }]
      : []),
    ...(exceedsStandard4k
      ? [{ codec: 'hevc' as const, quality: resolvedQuality, hardwareAcceleration: 'prefer-hardware' as const }]
      : []),
    { codec: 'avc', quality: resolvedQuality, hardwareAcceleration: 'no-preference' },
    ...(cappedQuality
      ? [{ codec: 'avc' as const, quality: cappedQuality, hardwareAcceleration: 'no-preference' as const }]
      : []),
    ...(exceedsStandard4k
      ? [{ codec: 'hevc' as const, quality: resolvedQuality, hardwareAcceleration: 'no-preference' as const }]
      : []),
  ]

  for (const candidate of candidates) {
    const supported = await canEncodeVideo(candidate.codec, {
      width,
      height,
      frameRate: fps,
      quality: candidate.quality,
      hardwareAcceleration: candidate.hardwareAcceleration,
    }).catch(() => false)
    if (supported) {
      return candidate
    }
  }

  return null
}
