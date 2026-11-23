import type { LevelDefinition } from '../../services/level-system'
import type { XPSource } from '../../store/level-store'

/*
 * The level-up moment, as plain data: when each part moves, which pictures a
 * climb hands out, whether it crossed a tier, and the XP lines it lists. The
 * component only draws what this module decides, so the decisions can be
 * tested without rendering anything.
 */

/**
 * The timing of the level-up moment, as numbers a test can hold.
 *
 * Every duration and curve here is a published token, not a feeling: Material 3
 * (the spring-to-bezier table and the long duration band) and IBM Carbon's
 * expressive set. The level-up is the textbook *expressive* moment — rare,
 * earned, worth being seen — so it gets the slower, more visible values, and
 * it gets them once: nothing here loops.
 *
 * One rule shapes the whole table: **the moment is over in under 1.2 s.** A
 * reward that keeps moving after that stops reading as a reward and starts
 * reading as a wait. `levelUpTimeline` is tested against that budget for every
 * jump the ladder allows, so a later tweak cannot quietly blow it.
 *
 * Reduced motion does not use any of this: the popup renders its settled state
 * directly — no roll, no sparks, no sweep.
 */

/** The curves, by job. Named after where they come from. */
export const EASE = {
  /** M3 expressive default spatial (spring → bezier). Overshoots: transforms only. */
  spatial: 'cubic-bezier(0.38, 1.21, 0.22, 1)',
  /** M3 expressive default effects. Opacity; never overshoots. */
  effects: 'cubic-bezier(0.34, 0.8, 0.34, 1)',
  /** Carbon expressive entrance: something appears and comes to rest. */
  entrance: 'cubic-bezier(0, 0, 0.3, 1)',
  /** M3 standard decelerate: the ring's pulse spreading out and fading. */
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  /**
   * Carbon expressive standard: in view from start to end — the number roll,
   * the ring filling, the light sweep. Not a decelerate curve on purpose: the
   * roll is watched the whole way, and M3's emphasized decelerate put the
   * number on its final digit at 40 % of the run, so the burst that marks the
   * landing went off a quarter-second after the number had visibly stopped.
   */
  standard: 'cubic-bezier(0.4, 0.14, 0.3, 1)',
} as const

/** Everything settled by then, for any jump. */
export const SETTLE_BUDGET_MS = 1200

/** When the number starts to roll — once the card has mostly arrived. */
export const ROLL_DELAY_MS = 120

/** One animated thing: when it starts and how long it runs, in ms. */
export interface Beat {
  delay: number
  duration: number
}

/** The whole moment, from the backdrop to the last spark. */
export interface LevelUpTimeline {
  backdrop: Beat
  /** The card's opacity (an effect) and its rise (spatial) run separately. */
  cardFade: Beat
  cardRise: Beat
  /** Ring filling and the number rolling from the old level to the new. */
  roll: Beat
  /** The moment the number lands. */
  landAt: number
  /** The ring's one pulse outwards when the number lands. */
  pulse: Beat
  /** The sparks; each adds its own small delay (`Spark.delay`). */
  burst: Beat
  /** The level's name, and the two lines under it. */
  title: Beat
  heroLines: Beat[]
  /** The reward column: pictures, XP, footer — staggered. */
  column: Beat[]
  /** The tier change, when there is one: the card appearing, then a light sweep. */
  tier: { pop: Beat; sweep: Beat } | null
  /** When the last thing stops moving. */
  settledAt: number
}

/**
 * How long the number takes to roll over `steps` levels.
 *
 * Duration scales with distance — the M3 long band, one token per level gained
 * and capped at its top (long1–long4: 450–600 ms). A burst of twelve levels is
 * a fast roll, not a slow one.
 *
 * @param steps - Levels gained in this climb
 */
export function rollDuration(steps: number): number {
  const band = [450, 500, 550, 600]
  return band[Math.min(band.length, Math.max(1, steps)) - 1]
}

/** Longest extra delay a single spark adds, so the burst does not fire as one. */
const SPARK_JITTER_MS = 30

/**
 * The level-up moment for a climb of `steps` levels.
 *
 * @param steps - Levels gained (1 for an ordinary level-up)
 * @param withTier - Whether the climb crossed into a new tier
 */
export function levelUpTimeline(steps: number, withTier: boolean): LevelUpTimeline {
  const roll: Beat = { delay: ROLL_DELAY_MS, duration: rollDuration(steps) }
  const landAt = roll.delay + roll.duration
  const title: Beat = { delay: landAt - 200, duration: 300 }
  const heroLines: Beat[] = [
    { delay: title.delay + 40, duration: 300 },
    { delay: title.delay + 80, duration: 300 },
  ]
  // Carbon: stagger, and keep the whole sequence under 500 ms.
  const column: Beat[] = [160, 220, 280].map(delay => ({ delay, duration: 300 }))
  const pulse: Beat = { delay: landAt - 40, duration: 450 }
  const burst: Beat = { delay: landAt - 60, duration: 450 }
  const tier = withTier
    ? { pop: { delay: landAt - 160, duration: 300 }, sweep: { delay: landAt - 40, duration: 400 } }
    : null

  const beats: Beat[] = [
    roll, title, ...heroLines, ...column, pulse,
    { delay: burst.delay + SPARK_JITTER_MS, duration: burst.duration },
    ...(tier ? [tier.pop, tier.sweep] : []),
  ]
  return {
    backdrop: { delay: 0, duration: 240 },
    cardFade: { delay: 0, duration: 200 },
    cardRise: { delay: 0, duration: 500 },
    roll, landAt, pulse, burst, title, heroLines, column, tier,
    settledAt: Math.max(...beats.map(b => b.delay + b.duration)),
  }
}

/** One spark of the burst: which way it flies, how far, how late, how big. */
export interface Spark {
  /** Degrees, clockwise from the right. */
  angle: number
  /** How far beyond the ring it travels, px. */
  distance: number
  /** Extra delay on top of the burst's, ms. */
  delay: number
  /** Diameter, px. */
  size: number
  /** Gold, or the level's own colour. */
  gold: boolean
}

/**
 * The sparks thrown off the ring when the number lands.
 *
 * Deterministic on purpose: the same popup looks the same every time, and a
 * still taken for review shows what a player sees. Spread evenly round the
 * ring with a little jitter so it does not read as a clock face.
 *
 * @param count - How many
 */
export function sparks(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => ({
    angle: ((i * 360) / count + (((i * 37) % 17) - 8) + 360) % 360,
    distance: 30 + ((i * 53) % 5) * 7,
    delay: ((i * 7) % 4) * (SPARK_JITTER_MS / 3),
    size: i % 3 === 0 ? 4 : 3,
    gold: i % 2 === 0,
  }))
}

/** How many of a burst's pictures are drawn; the rest are counted. */
export const MAX_PICTURES_SHOWN = 4

/**
 * The profile pictures a climb from `from` to `to` hands out.
 *
 * One per level gained. The newest are drawn, newest last — so the picture of
 * the level just reached sits at the end, beside the button that sets it —
 * and anything older is a count.
 *
 * @param from - The level before the climb
 * @param to - The level after it
 */
export function picturesFor(from: number, to: number): { shown: number[]; more: number } {
  const levels = Array.from({ length: Math.max(0, to - from) }, (_, i) => from + 1 + i)
  const shown = levels.slice(-MAX_PICTURES_SHOWN)
  return { shown, more: levels.length - shown.length }
}

/**
 * Whether a climb crossed into a new tier — beginner, mid, advanced, elite.
 *
 * @param from - The level before the climb
 * @param to - The level after it
 */
export function tierChanged(from: LevelDefinition, to: LevelDefinition): boolean {
  return from.tier !== to.tier
}

/** The most XP lines the card lists above its total. */
export const MAX_XP_ROWS = 4

/**
 * The XP lines of a climb, ready to list.
 *
 * The store keeps one line per payout, so a daily and a weekly challenge in the
 * same burst arrive as two lines both called "Challenge". Those are one line
 * here. Past {@link MAX_XP_ROWS} the largest keep their own line and the rest
 * share one ("Other"), so the lines still add up to the total — the same rule
 * the XP toast follows.
 *
 * @param breakdown - Where the XP of this climb came from, in payout order
 */
export function xpRows(breakdown: readonly XPSource[]): XPSource[] {
  const merged: XPSource[] = []
  const at = new Map<string, number>()
  for (const part of breakdown) {
    if (part.amount <= 0) continue
    const key = `${part.labelKey}|${JSON.stringify(part.labelParams ?? {})}`
    const i = at.get(key)
    if (i === undefined) {
      at.set(key, merged.length)
      merged.push({ ...part })
    } else {
      merged[i] = { ...merged[i], amount: merged[i].amount + part.amount }
    }
  }
  if (merged.length <= MAX_XP_ROWS) return merged
  const keep = new Set(
    merged
      .map((p, i) => ({ i, amount: p.amount }))
      .sort((a, b) => b.amount - a.amount || a.i - b.i)
      .slice(0, MAX_XP_ROWS - 1)
      .map(x => x.i),
  )
  const rest = merged.reduce((sum, p, i) => (keep.has(i) ? sum : sum + p.amount), 0)
  return [...merged.filter((_, i) => keep.has(i)), { labelKey: 'xp.part.other', amount: rest }]
}

/**
 * A level colour (`#rrggbb`) at the given opacity, for washes and rings.
 *
 * @param hex - The colour, as the level table writes it
 * @param alpha - 0–1
 */
export function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * A level colour for small type: lifted a little toward white.
 *
 * The ladder's colours clear AA on the plain card — `level-system.contrast`
 * walks them — but small type sits on their own tinted washes here, and the
 * darkest rungs dropped below it there: level 11's purple measured 4.27:1 as
 * an 11px label on the tier card. Large type (the title, the number) keeps
 * the colour as it is.
 *
 * @param hex - The colour, as the level table writes it
 */
export function ink(hex: string): string {
  return `color-mix(in oklab, ${hex} 78%, white)`
}
