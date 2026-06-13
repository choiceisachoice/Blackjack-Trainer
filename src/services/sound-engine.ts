/**
 * Sound engine for the Blackjack Card Counting Trainer.
 *
 * All sounds are synthesized using the Web Audio API — primarily filtered
 * white noise for casino-realistic textures (felt, cards, chips) and very
 * soft sine tones for feedback. No external audio files required.
 */

/** Helper: play a short burst of filtered white noise. */
function playNoise(
  ctx: AudioContext,
  duration: number,
  filterType: BiquadFilterType,
  filterFreq: number,
  filterQ: number,
  volume: number,
  startTime: number,
  decay = 8,
): void {
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterFreq
  filter.Q.value = filterQ

  const gain = ctx.createGain()
  gain.gain.value = volume

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start(startTime)
}

/** Helper: play a soft sine tone with fade-in and exponential fade-out. */
function playSoftTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  startTime: number,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/**
 * SoundEngine synthesizes short, subtle audio cues via the Web Audio API.
 *
 * Design principles:
 * - Soft, muted sounds (filtered noise, not shrill oscillators)
 * - Casino atmosphere: felt, cards, chips
 * - Barely perceptible, never annoying
 * - Debounced: same sound ignored if triggered within 50ms
 *
 * AudioContext is lazily created on first use (must happen after user
 * interaction to comply with browser autoplay policies).
 */
class SoundEngine {
  private ctx: AudioContext | null = null
  private _enabled = true
  private _volume = 0.15
  private lastPlayTime: Map<string, number> = new Map()
  private minInterval = 50

  /** Lazily initialize AudioContext. Returns null if unavailable. */
  private getContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      this.ctx = new AudioContext()
      return this.ctx
    } catch {
      return null
    }
  }

  /** Debounce check: returns true if this sound should play. */
  private shouldPlay(soundName: string): boolean {
    if (!this._enabled) return false
    const now = performance.now()
    const last = this.lastPlayTime.get(soundName) ?? 0
    if (now - last < this.minInterval) return false
    this.lastPlayTime.set(soundName, now)
    return true
  }

  /** Whether sounds are enabled. */
  get enabled(): boolean {
    return this._enabled
  }

  set enabled(v: boolean) {
    this._enabled = v
  }

  /** Master volume (0-1). */
  get volume(): number {
    return this._volume
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
  }

  // ── Card Sounds ─────────────────────────────────────

  /** Soft "fft" — card sliding across felt. Filtered white noise, 0.04s. */
  cardDeal(): void {
    if (!this.shouldPlay('cardDeal')) return
    const ctx = this.getContext()
    if (!ctx) return
    playNoise(ctx, 0.04, 'bandpass', 2000, 0.3, 0.08 * this._volume, ctx.currentTime)
  }

  /** Soft "tick" — dealer reveals hole card. Short noise snap, 0.03s. */
  cardFlip(): void {
    if (!this.shouldPlay('cardFlip')) return
    const ctx = this.getContext()
    if (!ctx) return
    playNoise(ctx, 0.03, 'highpass', 3000, 0.5, 0.10 * this._volume, ctx.currentTime, 12)
  }

  // ── Chip Sounds ─────────────────────────────────────

  /** Muted "tok" — chip placed on felt. Low-pass filtered noise, 0.03s. */
  chipPlace(): void {
    if (!this.shouldPlay('chipPlace')) return
    const ctx = this.getContext()
    if (!ctx) return
    playNoise(ctx, 0.03, 'lowpass', 800, 0.5, 0.10 * this._volume, ctx.currentTime, 10)
  }

  /** Stacked chip clicks — 3 quick filtered noise bursts ascending. ~0.15s. */
  chipCollect(): void {
    if (!this.shouldPlay('chipCollect')) return
    const ctx = this.getContext()
    if (!ctx) return
    const t = ctx.currentTime
    const vol = 0.12 * this._volume
    playNoise(ctx, 0.02, 'lowpass', 600, 0.5, vol, t, 10)
    playNoise(ctx, 0.02, 'lowpass', 800, 0.5, vol, t + 0.05, 10)
    playNoise(ctx, 0.02, 'lowpass', 1000, 0.5, vol, t + 0.10, 10)
  }

  // ── Feedback Sounds ─────────────────────────────────

  /** Gentle "ding-ding" — correct answer. Two soft sine tones (G4 → C5). */
  correct(): void {
    if (!this.shouldPlay('correct')) return
    const ctx = this.getContext()
    if (!ctx) return
    const t = ctx.currentTime
    const vol = 0.10 * this._volume
    playSoftTone(ctx, 392, 0.08, vol, t)
    playSoftTone(ctx, 523, 0.10, vol, t + 0.08)
  }

  /** Gentle "bom" — wrong answer. Single low, warm sine tone (A3). */
  wrong(): void {
    if (!this.shouldPlay('wrong')) return
    const ctx = this.getContext()
    if (!ctx) return
    playSoftTone(ctx, 220, 0.12, 0.08 * this._volume, ctx.currentTime)
  }

  /** Soft mini-fanfare — new best streak. C-E-G ascending (C5-E5-G5). */
  streak(): void {
    if (!this.shouldPlay('streak')) return
    const ctx = this.getContext()
    if (!ctx) return
    const t = ctx.currentTime
    const vol = 0.12 * this._volume
    playSoftTone(ctx, 523, 0.08, vol, t)
    playSoftTone(ctx, 659, 0.08, vol, t + 0.10)
    playSoftTone(ctx, 784, 0.10, vol, t + 0.20)
  }

  // ── UI Sounds ───────────────────────────────────────

  /** Barely-there click — noise micro-burst, 0.015s. */
  buttonClick(): void {
    if (!this.shouldPlay('buttonClick')) return
    const ctx = this.getContext()
    if (!ctx) return
    playNoise(ctx, 0.015, 'bandpass', 4000, 0.5, 0.04 * this._volume, ctx.currentTime, 15)
  }

  /** Tiny high "tss" — countdown tick. Noise, 0.02s. */
  timerTick(): void {
    if (!this.shouldPlay('timerTick')) return
    const ctx = this.getContext()
    if (!ctx) return
    playNoise(ctx, 0.02, 'highpass', 5000, 0.5, 0.06 * this._volume, ctx.currentTime, 12)
  }

  /** Ascending C-E-G-C scale — session complete. Soft sine tones, ~0.6s. */
  sessionComplete(): void {
    if (!this.shouldPlay('sessionComplete')) return
    const ctx = this.getContext()
    if (!ctx) return
    const t = ctx.currentTime
    const vol = 0.12 * this._volume
    playSoftTone(ctx, 262, 0.12, vol, t)
    playSoftTone(ctx, 330, 0.12, vol, t + 0.15)
    playSoftTone(ctx, 392, 0.12, vol, t + 0.30)
    playSoftTone(ctx, 523, 0.18, vol, t + 0.45)
  }

  /** Grand ascending fanfare — level up. C4-E4-G4-C5-E5, louder, ~0.8s. */
  levelUp(): void {
    if (!this.shouldPlay('levelUp')) return
    const ctx = this.getContext()
    if (!ctx) return
    const t = ctx.currentTime
    const vol = 0.16 * this._volume
    playSoftTone(ctx, 262, 0.14, vol, t)
    playSoftTone(ctx, 330, 0.14, vol, t + 0.15)
    playSoftTone(ctx, 392, 0.14, vol, t + 0.30)
    playSoftTone(ctx, 523, 0.16, vol * 1.1, t + 0.45)
    playSoftTone(ctx, 659, 0.22, vol * 1.2, t + 0.62)
  }
}

/** Singleton sound engine instance. */
export const soundEngine = new SoundEngine()
