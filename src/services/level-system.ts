import { minAnswersFor } from './accuracy-sample'
import { dayKey } from './date-utils'
import type { TrainingSessionResult } from './stats-types'

const STORAGE_KEY = 'bjt_level_xp'

/** Tier categories for level groups. */
export type LevelTier = 'beginner' | 'mid' | 'advanced' | 'elite'

/** A single level definition. */
export interface LevelDefinition {
  /** Level number (1-25). */
  level: number
  /** Key for this level's name, under `levels` — `levels.l<level>`. */
  titleKey: string
  /** Total XP needed to reach this level. */
  xpRequired: number
  /** Tier category. */
  tier: LevelTier
  /** Primary color for this level title. */
  color: string
  /** Glow/shadow color for effects. */
  glowColor: string
}

/**
 * All 25 level definitions, ordered by ascending xpRequired.
 *
 * ## Why the curve was re-cut (Aug 2026)
 *
 * The old top end was decoration. Modelled against the XP actually available to
 * somebody training every day — roughly 330, across four sessions, a daily and
 * a share of a weekly — level 22 sat **3.7 years** away and level 25 **8.2
 * years**. That is not an ambitious ladder; it is eight levels nobody would
 * ever see, existing only in this file.
 *
 * For scale: the entire achievement catalogue, all 102 unlocked, paid 8,425 XP.
 * That did not reach level 9.
 *
 * The curve now tops out at 210,000. With the session rewards below (also
 * raised), daily training reaches 25 in roughly **15 months**, and three
 * sessions a week reach 20 in about **18 months**. The shape is unchanged —
 * quick early levels, a long tail — only the tail is finite now.
 *
 * Requirements were lowered, never raised. A rebalance must not take a level
 * away from somebody who already earned it.
 */
/*
 * ## Why four of these are lighter than they look designed to be
 *
 * Levels 1, 10, 11 and 12 were the four darkest rungs, and they were the four
 * that failed. Measured on the live app against the three grounds these ever
 * appear on — the page, the top bar and a card — they read 3.71, 3.47, 4.24 and
 * 3.15 against AA's 4.5. Level 1 is the one a new account sees, in the nav bar,
 * on every screen.
 *
 * Two of them were the awkward ones: 10 and 12 were authored as *darker*
 * variants of their neighbours, and on a dark theme that direction does not
 * exist. Lightening them the minimum needed to clear AA turned them into
 * near-duplicates — 17 and 9 units from their neighbour where the ladder's
 * typical spacing is 53. They are lightened further and slightly desaturated
 * instead, which buys back the separation (45 and 43) without moving the hue,
 * so the climb still reads grey → green → blue → violet → gold → diamond.
 *
 * `level-system.contrast.test.ts` walks the whole table, so a rung added later
 * cannot quietly reintroduce this.
 */
export const LEVELS: LevelDefinition[] = [
  // Beginner (grey tones) — levels 1-5
  { level: 1,  titleKey: 'levels.l1',                   xpRequired: 0,        tier: 'beginner', color: '#7a8190', glowColor: 'rgba(122,129,144,0.3)' },
  { level: 2,  titleKey: 'levels.l2',                  xpRequired: 50,       tier: 'beginner', color: '#9ca3af', glowColor: 'rgba(156,163,175,0.3)' },
  { level: 3,  titleKey: 'levels.l3',               xpRequired: 200,      tier: 'beginner', color: '#a8a29e', glowColor: 'rgba(168,162,158,0.3)' },
  { level: 4,  titleKey: 'levels.l4',             xpRequired: 450,      tier: 'beginner', color: '#b8b8b8', glowColor: 'rgba(184,184,184,0.3)' },
  { level: 5,  titleKey: 'levels.l5',              xpRequired: 850,    tier: 'beginner', color: '#d4d4d4', glowColor: 'rgba(212,212,212,0.3)' },

  // Mid (green → blue) — levels 6-10
  { level: 6,  titleKey: 'levels.l6',            xpRequired: 1_400,    tier: 'mid', color: '#22c55e', glowColor: 'rgba(34,197,94,0.3)' },
  { level: 7,  titleKey: 'levels.l7',             xpRequired: 2_200,    tier: 'mid', color: '#16a34a', glowColor: 'rgba(22,163,74,0.3)' },
  { level: 8,  titleKey: 'levels.l8',           xpRequired: 3_300,    tier: 'mid', color: '#0ea5e9', glowColor: 'rgba(14,165,233,0.3)' },
  { level: 9,  titleKey: 'levels.l9',          xpRequired: 4_800,    tier: 'mid', color: '#3b82f6', glowColor: 'rgba(59,130,246,0.3)' },
  { level: 10, titleKey: 'levels.l10',                  xpRequired: 6_800,   tier: 'mid', color: '#628ae1', glowColor: 'rgba(98,138,225,0.4)' },

  // Advanced (purple → gold) — levels 11-17
  { level: 11, titleKey: 'levels.l11',            xpRequired: 9_400,   tier: 'advanced', color: '#9266f7', glowColor: 'rgba(146,102,247,0.3)' },
  { level: 12, titleKey: 'levels.l12',             xpRequired: 12_800,   tier: 'advanced', color: '#aa86e8', glowColor: 'rgba(170,134,232,0.3)' },
  { level: 13, titleKey: 'levels.l13',              xpRequired: 17_000,   tier: 'advanced', color: '#a855f7', glowColor: 'rgba(168,85,247,0.4)' },
  { level: 14, titleKey: 'levels.l14',            xpRequired: 22_000,   tier: 'advanced', color: '#c084fc', glowColor: 'rgba(192,132,252,0.4)' },
  { level: 15, titleKey: 'levels.l15',               xpRequired: 28_000,   tier: 'advanced', color: '#d4a843', glowColor: 'rgba(212,168,67,0.4)' },
  { level: 16, titleKey: 'levels.l16',                 xpRequired: 35_500,   tier: 'advanced', color: '#eab308', glowColor: 'rgba(234,179,8,0.4)' },
  { level: 17, titleKey: 'levels.l17',                xpRequired: 44_500,  tier: 'advanced', color: '#f59e0b', glowColor: 'rgba(245,158,11,0.5)' },

  // Elite (gold → diamond) — levels 18-25
  { level: 18, titleKey: 'levels.l18',              xpRequired: 55_000,  tier: 'elite', color: '#fbbf24', glowColor: 'rgba(251,191,36,0.4)' },
  { level: 19, titleKey: 'levels.l19',              xpRequired: 67_500,  tier: 'elite', color: '#fcd34d', glowColor: 'rgba(252,211,77,0.5)' },
  { level: 20, titleKey: 'levels.l20',                 xpRequired: 82_000,  tier: 'elite', color: '#fde68a', glowColor: 'rgba(253,230,138,0.5)' },
  { level: 21, titleKey: 'levels.l21',           xpRequired: 99_000,  tier: 'elite', color: '#ffd700', glowColor: 'rgba(255,215,0,0.5)' },
  { level: 22, titleKey: 'levels.l22',          xpRequired: 119_000,  tier: 'elite', color: '#ffec80', glowColor: 'rgba(255,236,128,0.5)' },
  { level: 23, titleKey: 'levels.l23',               xpRequired: 143_000,  tier: 'elite', color: '#e0f2fe', glowColor: 'rgba(224,242,254,0.4)' },
  { level: 24, titleKey: 'levels.l24',               xpRequired: 172_000,  tier: 'elite', color: '#bae6fd', glowColor: 'rgba(186,230,253,0.5)' },
  { level: 25, titleKey: 'levels.l25',    xpRequired: 210_000, tier: 'elite', color: '#b9f2ff', glowColor: 'rgba(185,242,255,0.6)' },
]

/**
 * What an achievement pays, by tier.
 *
 * Training is not in this table any more: a session is paid by what was
 * answered correctly in it (`sessionXP`), not by a fixed amount for having
 * finished one.
 */
export const XP_REWARDS = {
  achievementBronze: 25,
  achievementSilver: 50,
  achievementGold: 100,
  achievementDiamond: 200,
} as const

/**
 * XP for one correct answer, by mode.
 *
 * An answer is not the same amount of work everywhere. In the Speed Drill one
 * "answer" is a whole run of cards counted and totalled; at the casino table
 * it is a decision made while holding a count; a flashcard is a few seconds.
 */
export const XP_PER_CORRECT: Record<TrainingSessionResult['mode'], number> = {
  speedDrill: 12,
  casinoSession: 3,
  tableCounting: 2,
  deviationFlashCards: 2,
  deviationAtTable: 2,
  betSpread: 2,
  deckEstimation: 2,
}

/** The most one mode's training pays in one day. */
export const DAILY_MODE_XP_CAP = 150

/** Result of an addXP operation. */
export interface AddXPResult {
  /** Whether the player leveled up. */
  leveledUp: boolean
  /** The new level (only set if leveledUp). */
  newLevel?: LevelDefinition
  /** The previous level (only set if leveledUp). */
  oldLevel?: LevelDefinition
}

/** Progress toward the next level. */
export interface LevelProgress {
  /** XP earned within the current level. */
  current: number
  /** XP required to reach the next level. */
  required: number
  /** Percentage (0-100) toward the next level. */
  percent: number
}

/** What a session pays, and what the day's limit did to it. */
export interface SessionXP {
  /** What is credited. */
  amount: number
  /** What the answers were worth before the day's limit. */
  earned: number
  /** The day's limit for this mode took some or all of it. */
  capped: boolean
  /**
   * The part of `amount` paid for the correct answers themselves, and the part
   * the accuracy factor added on top. `base + bonus === amount`, always: when
   * the day's limit cuts a session short the answers are paid first and the
   * bonus gets what is left, so the lines of the toast add up to the credit.
   */
  base: number
  bonus: number
}

/**
 * What a session's answers are worth, before the day's limit.
 *
 * Paid per **correct answer**, so a session is worth what was done in it:
 * twenty flashcards in one sitting and twenty across four are the same XP.
 * Accuracy multiplies it (x1.25 from 85 %, x1.5 from 95 %) once the session is
 * large enough for its accuracy to mean anything — the sample the awards and
 * the plan already ask for (`minAnswersFor`).
 *
 * What this replaced paid 25 XP for finishing any session, plus up to 70 for
 * its accuracy whatever its size: three correct flashcards were 95 XP, and the
 * cheapest way up the ladder was many short sessions. A casino session also
 * paid for its profit, which is luck.
 *
 * @param session - The finished session
 */
export function sessionXPEarned(session: TrainingSessionResult): number {
  const correct = Math.max(0, Math.min(session.correctAnswers, session.totalQuestions))
  if (correct === 0) return 0
  const base = correct * (XP_PER_CORRECT[session.mode] ?? 2)
  const proven = session.totalQuestions >= minAnswersFor(session.mode)
  const accuracy = session.totalQuestions > 0 ? correct / session.totalQuestions : 0
  const factor = !proven ? 1 : accuracy >= 0.95 ? 1.5 : accuracy >= 0.85 ? 1.25 : 1
  return Math.round(base * factor)
}

/**
 * What a session pays once the day's limit is applied.
 *
 * One mode pays at most `DAILY_MODE_XP_CAP` in a day. The limit is worked out
 * from the day's own sessions rather than kept in a counter, so it cannot be
 * reset by signing out and it is the same on every device.
 *
 * @param session - The finished session
 * @param earlier - Sessions recorded before it (any day, any mode)
 */
export function sessionXP(session: TrainingSessionResult, earlier: TrainingSessionResult[] = []): SessionXP {
  const earned = sessionXPEarned(session)
  const day = dayKey(session.timestamp)
  let paidToday = 0
  for (const s of earlier) {
    if (s.id === session.id || s.mode !== session.mode || dayKey(s.timestamp) !== day) continue
    paidToday = Math.min(DAILY_MODE_XP_CAP, paidToday + sessionXPEarned(s))
  }
  const amount = Math.max(0, Math.min(earned, DAILY_MODE_XP_CAP - paidToday))
  const correct = Math.max(0, Math.min(session.correctAnswers, session.totalQuestions))
  const base = Math.min(amount, correct * (XP_PER_CORRECT[session.mode] ?? 2))
  return { amount, earned, capped: amount < earned, base, bonus: amount - base }
}

/** What beating a personal best pays. */
export const PERSONAL_BEST_XP = 50
/** Proven sessions a mode needs before a "best" means anything. */
export const PERSONAL_BEST_MIN_HISTORY = 3

/**
 * The award for a new personal best in a mode, or 0.
 *
 * The second half of the XP proposal: mastery pays most, and getting better
 * at a drill than you have ever been is mastery the app can measure. Three
 * rules keep it from being farmed:
 *
 *  - only a session large enough to prove its accuracy can set a best, and
 *    only against at least three earlier ones that were — the first good
 *    session is a start, not a record;
 *  - the best has to rise by a whole percentage point;
 *  - once a day per mode. A best is beaten upwards, so it pays a handful of
 *    times in a mode's whole life, and then never again at 100%.
 *
 * @param session - The finished session
 * @param earlier - Sessions recorded before it
 */
export function personalBestXP(session: TrainingSessionResult, earlier: TrainingSessionResult[] = []): number {
  if (session.mode === 'casinoSession') return 0
  const proven = (s: TrainingSessionResult) => s.totalQuestions >= minAnswersFor(s.mode)
  if (!proven(session)) return 0
  const before = earlier.filter(s => s.id !== session.id && s.mode === session.mode && proven(s) && s.timestamp < session.timestamp)
  if (before.length < PERSONAL_BEST_MIN_HISTORY) return 0
  const pct = (s: TrainingSessionResult) => Math.floor((s.totalQuestions > 0 ? s.correctAnswers / s.totalQuestions : 0) * 100)
  const best = Math.max(...before.map(pct))
  if (pct(session) < best + 1) return 0
  // Already paid today? Then an earlier session today beat the best before it.
  const day = dayKey(session.timestamp)
  const today = before.filter(s => dayKey(s.timestamp) === day).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const s of today) {
    const prior = before.filter(o => o.timestamp < s.timestamp)
    if (prior.length >= PERSONAL_BEST_MIN_HISTORY && pct(s) >= Math.max(...prior.map(pct)) + 1) return 0
  }
  return PERSONAL_BEST_XP
}

/**
 * XP credited for a training session.
 *
 * @param session - The finished session
 * @param earlier - Sessions recorded before it, for the day's limit
 */
export function calculateSessionXP(session: TrainingSessionResult, earlier: TrainingSessionResult[] = []): number {
  return sessionXP(session, earlier).amount
}

/**
 * Core level system engine.
 *
 * Tracks total XP, computes the current level, and detects level-ups.
 * Persists total XP to localStorage.
 */
export class LevelSystem {
  private totalXP: number = 0

  constructor() {
    this.load()
  }

  /** Get the current level definition based on total XP. */
  getLevel(): LevelDefinition {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (this.totalXP >= LEVELS[i].xpRequired) {
        return LEVELS[i]
      }
    }
    return LEVELS[0]
  }

  /** Get progress toward the next level. */
  getProgressToNext(): LevelProgress {
    const currentLevel = this.getLevel()
    const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1)

    if (!nextLevel) {
      return { current: 0, required: 0, percent: 100 }
    }

    const xpInCurrentLevel = this.totalXP - currentLevel.xpRequired
    const xpNeededForNext = nextLevel.xpRequired - currentLevel.xpRequired

    return {
      current: xpInCurrentLevel,
      required: xpNeededForNext,
      percent: Math.floor((xpInCurrentLevel / xpNeededForNext) * 100),
    }
  }

  /**
   * Add XP and detect level-up.
   *
   * @returns Info about whether a level-up occurred.
   */
  addXP(amount: number): AddXPResult {
    const oldLevel = this.getLevel()
    this.totalXP += amount
    this.save()
    const newLevel = this.getLevel()

    if (newLevel.level > oldLevel.level) {
      return { leveledUp: true, newLevel, oldLevel }
    }
    return { leveledUp: false }
  }

  /** Get the total accumulated XP. */
  getTotalXP(): number {
    return this.totalXP
  }

  /** Overwrite the total XP (used when hydrating from the cloud). Persists. */
  setTotalXP(xp: number): void {
    this.totalXP = Math.max(0, Math.floor(xp))
    this.save()
  }

  /** Clear all level data. */
  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY)
    this.totalXP = 0
  }

  /** Reload XP from localStorage. */
  reload(): void {
    this.load()
  }

  // ── Private ─────────────────────────────────────────────

  private save(): void {
    localStorage.setItem(STORAGE_KEY, String(this.totalXP))
  }

  private load(): void {
    const saved = localStorage.getItem(STORAGE_KEY)
    this.totalXP = saved ? (parseInt(saved, 10) || 0) : 0
  }
}

/** Singleton instance for app-wide use. */
export const levelSystem = new LevelSystem()
