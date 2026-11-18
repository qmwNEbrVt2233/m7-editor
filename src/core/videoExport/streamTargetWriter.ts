import type { StreamTargetChunk } from 'mediabunny'

/**
 * Wraps chunk emissions into a WritableStream<StreamTargetChunk> that coalesces contiguous
 * sequential writes up to `maxBufferBytes` before invoking `emitChunk`.
 * This drastically cuts IPC round-trips and file write syscalls (especially on WebKit where
 * mediabunny StreamTarget runs with chunked: false).
 */
export function createCoalescedChunkWritable(
  emitChunk: (position: number, bytes: Uint8Array<ArrayBuffer>) => void,
  maxBufferBytes = 1024 * 1024
): WritableStream<StreamTargetChunk> {
  const bufferSize = Number.isFinite(maxBufferBytes) && maxBufferBytes >= 1024
    ? Math.floor(maxBufferBytes)
    : 1024 * 1024
  const staging = new Uint8Array(bufferSize)
  let pendingPos = 0
  let pendingLen = 0

  const flushPending = () => {
    if (pendingLen <= 0) {
      return
    }
    const copy = new Uint8Array(pendingLen)
    copy.set(staging.subarray(0, pendingLen))
    const pos = pendingPos
    pendingPos = 0
    pendingLen = 0
    emitChunk(pos, copy)
  }

  return new WritableStream<StreamTargetChunk>({
    write(chunk) {
      if (
        chunk.type !== 'write' ||
        chunk.data.byteLength === 0 ||
        !Number.isFinite(chunk.position) ||
        chunk.position < 0
      ) {
        return
      }
      const data = chunk.data
      const pos = Math.trunc(chunk.position)

      if (pendingLen > 0 && pos !== pendingPos + pendingLen) {
        flushPending()
      }

      if (pendingLen > 0 && pendingLen + data.byteLength > bufferSize) {
        flushPending()
      }

      if (data.byteLength >= bufferSize) {
        const copy = new Uint8Array(data.byteLength)
        copy.set(data)
        emitChunk(pos, copy)
        return
      }

      if (pendingLen === 0) {
        pendingPos = pos
      }
      staging.set(data, pendingLen)
      pendingLen += data.byteLength
    },
    close() {
      flushPending()
    },
    abort() {
      pendingPos = 0
      pendingLen = 0
    },
  })
}
