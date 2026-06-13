/**
 * Casino Ambient Sound — MP3-based casino atmosphere.
 *
 * Plays a looping MP3 file (`/sounds/casino-ambience.mp3`) via HTMLAudioElement.
 * Volume is persisted in localStorage under `bjt_ambient_volume`.
 */

const STORAGE_KEY = 'bjt_ambient_volume'
const DEFAULT_VOLUME = 0.15
const AUDIO_SRC = '/sounds/casino-ambience.mp3'

class CasinoAmbient {
  private audio: HTMLAudioElement | null = null
  private _volume: number

  constructor() {
    this._volume = this.loadVolume()
  }

  /** Start playing the ambient loop. */
  start(): void {
    if (this.audio) return
    try {
      const el = new Audio(AUDIO_SRC)
      el.loop = true
      el.volume = this._volume
      el.play().catch(() => { /* user gesture required — silently ignore */ })
      this.audio = el
    } catch { /* Audio not supported */ }
  }

  /** Stop playing and release the audio element. */
  stop(): void {
    if (!this.audio) return
    this.audio.pause()
    this.audio.src = ''
    this.audio = null
  }

  /** Set the ambient volume (0–1). Applies immediately if playing. Persists to localStorage. */
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
    if (this.audio) {
      this.audio.volume = this._volume
    }
    this.saveVolume(this._volume)
  }

  /** Get the ambient volume. */
  get volume(): number {
    return this._volume
  }

  /** Whether ambient is currently playing. */
  get playing(): boolean {
    return this.audio !== null
  }

  private loadVolume(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw !== null) {
        const val = parseFloat(raw)
        if (!isNaN(val)) return Math.max(0, Math.min(1, val))
      }
    } catch { /* ignore */ }
    return DEFAULT_VOLUME
  }

  private saveVolume(v: number): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(v))
    } catch { /* ignore */ }
  }
}

/** Singleton casino ambient instance. */
export const casinoAmbient = new CasinoAmbient()
