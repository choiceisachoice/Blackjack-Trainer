/**
 * The recorded sounds of the casino table: cards and chips, as audio files.
 *
 * The table's sounds used to be synthesised — a 40ms burst of filtered white
 * noise for a card, three for a payout. They were inoffensive and they sounded
 * like what they were. These are recordings of the real things (Kenney, "Casino
 * Audio", CC0 — the licence sits beside the files in `public/sounds/table`).
 *
 * Two things keep a sound that plays hundreds of times a session from wearing:
 * there are several takes of each and the same take never plays twice in a
 * row, and every play is shifted a few percent in pitch and level. A dealt
 * hand is five or six cards in a second; identical samples in a row are what
 * makes a table sound like a machine.
 *
 * The takes were chosen by measurement, not by ear (15 Nov 2026): short, an
 * onset within 40ms of the file's start, and close to each other in level and
 * brightness so a rotation does not jump. Leading silence is trimmed and every
 * file is brought to the same peak.
 */

/** The events at the table that have a recording. */
export type TableSound = 'deal' | 'flip' | 'chip' | 'payout' | 'take' | 'shuffle'

/** How many takes there are of each sound, and its level relative to the others. */
export const TABLE_SOUNDS: Record<TableSound, { takes: number; gain: number }> = {
  deal: { takes: 4, gain: 0.55 },
  flip: { takes: 2, gain: 0.6 },
  chip: { takes: 3, gain: 0.8 },
  payout: { takes: 3, gain: 0.7 },
  take: { takes: 3, gain: 0.6 },
  shuffle: { takes: 1, gain: 0.5 },
}

/** Where a take is served from. */
export function sampleUrl(sound: TableSound, take: number): string {
  return `/sounds/table/${sound}-${take + 1}.mp3`
}

/**
 * Which take to play next: any but the one that played last.
 *
 * @param takes - How many takes exist
 * @param last - The take played last, or -1 for none
 * @param random - A number in [0, 1)
 */
export function pickTake(takes: number, last: number, random: number): number {
  if (takes <= 1) return 0
  if (last < 0 || last >= takes) return Math.min(takes - 1, Math.floor(random * takes))
  const step = 1 + Math.min(takes - 2, Math.floor(random * (takes - 1)))
  return (last + step) % takes
}

/**
 * The gain of a sample for a master volume.
 *
 * The master volume was tuned for the synthesised cues and sits at 0.15 by
 * default; a recording at 0.15 is inaudible. The curve maps that default to a
 * level that is present without leading, and the top of the slider to full.
 */
export function sampleGain(sound: TableSound, masterVolume: number): number {
  const master = Math.max(0, Math.min(1, masterVolume))
  return Math.min(1, master * 3.2) * TABLE_SOUNDS[sound].gain
}

class TableSamples {
  private buffers = new Map<string, AudioBuffer>()
  private loading = false
  private last = new Map<TableSound, number>()

  /**
   * Fetch and decode every take, once. Safe to call on every sound; failures
   * are silent — a table without recordings falls back to the synthesised cue.
   */
  load(ctx: AudioContext): void {
    if (this.loading || typeof fetch === 'undefined') return
    this.loading = true
    for (const sound of Object.keys(TABLE_SOUNDS) as TableSound[]) {
      for (let take = 0; take < TABLE_SOUNDS[sound].takes; take++) {
        const url = sampleUrl(sound, take)
        fetch(url)
          .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then(data => ctx.decodeAudioData(data))
          .then(buffer => { this.buffers.set(url, buffer) })
          .catch(() => { /* not available: the caller falls back */ })
      }
    }
  }

  /**
   * Play one take of a sound.
   *
   * @returns false when no recording is ready yet, so the caller can fall back
   */
  play(ctx: AudioContext, sound: TableSound, masterVolume: number): boolean {
    const takes = TABLE_SOUNDS[sound].takes
    const take = pickTake(takes, this.last.get(sound) ?? -1, Math.random())
    const buffer = this.buffers.get(sampleUrl(sound, take))
      ?? [...Array(takes).keys()].map(i => this.buffers.get(sampleUrl(sound, i))).find(Boolean)
    if (!buffer) return false
    this.last.set(sound, take)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 0.96 + Math.random() * 0.08
    const gain = ctx.createGain()
    gain.gain.value = sampleGain(sound, masterVolume) * (0.9 + Math.random() * 0.2)
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    return true
  }
}

/** The table's recordings, shared by the sound engine. */
export const tableSamples = new TableSamples()
