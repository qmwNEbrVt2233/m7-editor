export class Player {
  private start = 0
  private current = 0
  private playing = false
  private rafId: number | null = null

  play() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    const safeCurrent = Number.isFinite(this.current) ? Math.max(0, this.current) : 0
    this.current = safeCurrent
    this.start = performance.now() - safeCurrent
    this.playing = true
    this.rafId = requestAnimationFrame(() => this.loop())
  }

  pause() {
    if (this.playing) {
      this.current = Math.max(0, performance.now() - this.start)
    }
    this.playing = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private loop() {
    if (!this.playing) {
      this.rafId = null
      return
    }

    this.current = Math.max(0, performance.now() - this.start)
    this.rafId = requestAnimationFrame(() => this.loop())
  }

  getCurrentTime() {
    return this.current
  }
}