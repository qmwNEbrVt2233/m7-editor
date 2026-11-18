export type ExportOutputDelivery = 'file' | 'download'

export type DirectExportOutputSink = {
  readonly displayPath: string
  readonly delivery: ExportOutputDelivery
  start(): Promise<void>
  writeChunk(position: number, bytes: Uint8Array<ArrayBuffer>): Promise<void>
  finish(fileSize: number): Promise<void>
  cancel(): Promise<void>
}

export type SparseOutputSegment = {
  start: number
  end: number
  data: Uint8Array<ArrayBuffer>
}

type SaveFilePickerWritable = {
  write: (data: { type: 'write'; position: number; data: Uint8Array<ArrayBuffer> }) => Promise<void>
  truncate: (size: number) => Promise<void>
  close: () => Promise<void>
  abort: () => Promise<void>
}

type SaveFilePickerHandle = {
  name?: string
  createWritable: (options?: { keepExistingData?: boolean }) => Promise<SaveFilePickerWritable>
}

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<SaveFilePickerHandle>
}

/**
 * Inserts a write over `[position, position + bytes.byteLength)` into a sorted list of
 * non-overlapping segments, returning the updated segment array with newer bytes overriding overlaps.
 */
export function applySparseWrite(
  segments: SparseOutputSegment[],
  position: number,
  bytes: Uint8Array<ArrayBuffer>
): SparseOutputSegment[] {
  if (!Number.isFinite(position) || position < 0) {
    throw new Error('写入位置必须是非负有限数字')
  }
  const start = Math.trunc(position)
  const length = bytes.byteLength
  if (length === 0) return segments
  const end = start + length

  // Fast path for sequential appends without modifying earlier offsets.
  if (segments.length === 0 || segments[segments.length - 1]!.end <= start) {
    segments.push({ start, end, data: bytes })
    return segments
  }

  const nextSegments: SparseOutputSegment[] = []
  let inserted = false

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    if (seg.end <= start) {
      nextSegments.push(seg)
      continue
    }
    if (seg.start >= end) {
      if (!inserted) {
        nextSegments.push({ start, end, data: bytes })
        inserted = true
      }
      nextSegments.push(seg)
      continue
    }

    if (seg.start < start) {
      nextSegments.push({
        start: seg.start,
        end: start,
        data: seg.data.subarray(0, start - seg.start),
      })
    }

    if (!inserted) {
      nextSegments.push({ start, end, data: bytes })
      inserted = true
    }

    if (seg.end > end) {
      nextSegments.push({
        start: end,
        end: seg.end,
        data: seg.data.subarray(end - seg.start),
      })
    }
  }

  if (!inserted) {
    nextSegments.push({ start, end, data: bytes })
  }

  return nextSegments
}

/**
 * Materializes sparse sorted segments into sequential Blob-ready Uint8Array slices
 * zero-filling any unwritten gaps and clamping cleanly to `fileSize`.
 */
export function assembleSparseOutputParts(
  segments: readonly SparseOutputSegment[],
  fileSize: number
): Uint8Array<ArrayBuffer>[] {
  const targetSize = Number.isFinite(fileSize) ? Math.max(0, Math.trunc(fileSize)) : 0
  if (targetSize === 0) return []

  const parts: Uint8Array<ArrayBuffer>[] = []
  let cursor = 0

  for (let i = 0; i < segments.length && cursor < targetSize; i += 1) {
    const seg = segments[i]!
    if (seg.end <= cursor) continue

    const segStart = Math.max(seg.start, cursor)
    if (segStart > cursor) {
      const gapLength = Math.min(segStart, targetSize) - cursor
      parts.push(new Uint8Array(gapLength))
      cursor += gapLength
      if (cursor >= targetSize) break
    }

    const segEnd = Math.min(seg.end, targetSize)
    if (segEnd > segStart) {
      const startOffset = segStart - seg.start
      const endOffset = segEnd - seg.start
      parts.push(
        startOffset === 0 && endOffset === seg.data.byteLength
          ? seg.data
          : seg.data.subarray(startOffset, endOffset)
      )
      cursor = segEnd
    }
  }

  if (cursor < targetSize) {
    parts.push(new Uint8Array(targetSize - cursor))
  }

  return parts
}

export function formatDefaultVideoExportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
  return `m7-export-${stamp}.mp4`
}

function sanitizeVideoExportFilenameStem(name?: string | null): string {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  const withoutExtension = trimmed.replace(/\.mp4$/i, '')
  const sanitized = withoutExtension.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  const cleaned = sanitized.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!cleaned) return ''
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    return `${cleaned}_`
  }
  return cleaned
}

export function resolveDefaultVideoExportFilename(
  projectMode: 'single' | 'folder' = 'single',
  projectName?: string | null,
  now = new Date()
): string {
  if (projectMode === 'folder') {
    const stem = sanitizeVideoExportFilenameStem(projectName)
    if (stem) {
      return `${stem}.mp4`
    }
  }
  return formatDefaultVideoExportFilename(now)
}

export function createFileSystemAccessOutputSink(
  handle: SaveFilePickerHandle,
  fallbackName = formatDefaultVideoExportFilename()
): DirectExportOutputSink {
  let writable: SaveFilePickerWritable | null = null

  return {
    displayPath: handle.name || fallbackName,
    delivery: 'file',
    async start() {
      writable = await handle.createWritable({ keepExistingData: false })
    },
    async writeChunk(position, bytes) {
      if (!writable) {
        throw new Error('文件写入通道未初始化')
      }
      if (!Number.isFinite(position) || position < 0) {
        throw new Error('写入位置必须是非负有限数字')
      }
      await writable.write({ type: 'write', position: Math.trunc(position), data: bytes })
    },
    async finish(fileSize) {
      if (!writable) return
      const active = writable
      const targetSize = Number.isFinite(fileSize) ? Math.max(0, Math.trunc(fileSize)) : 0
      try {
        await active.truncate(targetSize)
        await active.close()
        writable = null
      } catch (error) {
        writable = null
        await active.abort().catch(() => undefined)
        throw error
      }
    },
    async cancel() {
      if (!writable) return
      const active = writable
      writable = null
      await active.abort().catch(() => undefined)
    },
  }
}

export function createBlobDownloadOutputSink(fileName: string): DirectExportOutputSink {
  let segments: SparseOutputSegment[] = []

  return {
    displayPath: fileName,
    delivery: 'download',
    async start() {
      segments = []
    },
    async writeChunk(position, bytes) {
      segments = applySparseWrite(segments, position, bytes)
    },
    async finish(fileSize) {
      const parts = assembleSparseOutputParts(segments, fileSize)
      segments = []
      const blob = new Blob(parts, { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const parent = document.body ?? document.documentElement
      if (!parent) {
        URL.revokeObjectURL(url)
        throw new Error('无法触发浏览器文件下载')
      }
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.style.display = 'none'
      let clickTriggered = false
      try {
        parent.appendChild(anchor)
        anchor.click()
        clickTriggered = true
      } finally {
        anchor.remove()
        if (clickTriggered) {
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } else {
          URL.revokeObjectURL(url)
        }
      }
    },
    async cancel() {
      segments = []
    },
  }
}

/**
 * Selects a browser export sink under the current user activation:
 * uses File System Access `showSaveFilePicker` when supported, returns `null` if the
 * user cancels the picker, or falls back to in-memory Blob download.
 */
export async function chooseBrowserExportOutputSink(
  suggestedName = formatDefaultVideoExportFilename()
): Promise<DirectExportOutputSink | null> {
  const picker = typeof window !== 'undefined'
    ? (window as WindowWithSaveFilePicker).showSaveFilePicker
    : undefined

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
      })
      if (handle) {
        return createFileSystemAccessOutputSink(handle, suggestedName)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null
      }
      // Fall through to Blob download if showSaveFilePicker is restricted by policy/context.
    }
  }

  return createBlobDownloadOutputSink(suggestedName)
}
