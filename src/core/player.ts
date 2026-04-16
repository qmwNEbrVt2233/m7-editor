export class Player {
  private start = 0
  private current = 0
  private playing = false

  play() {
    this.start = performance.now() - this.current
    this.playing = true
    this.loop()
  }

  pause() {
    this.playing = false
  }

  private loop() {
    if (!this.playing) return

    this.current = performance.now() - this.start

    requestAnimationFrame(() => this.loop())
  }

  getCurrentTime() {
    return this.current
  }
}