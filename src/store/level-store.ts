import { create } from 'zustand'
import type { TrainingSessionResult } from '../services/stats-types'
import type { LevelDefinition, LevelProgress } from '../services/level-system'
import { levelSystem, sessionXP, personalBestXP, XP_REWARDS } from '../services/level-system'
import { pushProfileScalars } from '../services/supabase/profiles-sync'
import { soundEngine } from '../services/sound-engine'

/** State shape for the level store. */
export interface LevelStoreState {
  /** Total accumulated XP. */
  totalXP: number
  /** Current level definition. */
  level: LevelDefinition
  /** Progress toward the next level. */
  progress: LevelProgress
  /** Whether to show the level-up popup. */
  showLevelUp: boolean
  /**
   * Data for the level-up popup, or null when none is pending.
   *
   * `breakdown` lists where the XP of this climb came from ("Speed drill +75,
   * Daily challenge +100"). Finishing a session pays out from up to four
   * sources at once, and a popup that shows only "Level 3" leaves a beginner
   * with no idea what they did to earn it.
   */
  levelUpData:
    | { oldLevel: LevelDefinition; newLevel: LevelDefinition; breakdown: XPSource[] }
    | null

  /**
   * The most recent XP payout, for the toast that announces it.
   *
   * This exists because finishing a session *felt* like it paid nothing. The XP
   * was always credited — correctly, and to the right account — but silently,
   * and only once the mode unmounted. Achievements and challenges announce
   * themselves the moment they land, so those read as working and training did
   * not. Same mechanism, opposite impression.
   *
   * `id` increments on every payout so an identical amount from an identical
   * source still re-triggers the toast; without it, two 40-XP drills in a row
   * would announce once.
   */
  lastAward: XpAward | null

  /**
   * A screen is showing the latest award itself, so the toast stays quiet.
   *
   * The round summary draws the XP a round earned inside the moment that
   * earned it — on the level bar, beside the score. A toast saying the same
   * thing in the corner at the same time is the announcement twice. The
   * screen claims the award *before* the round is paid
   * (`holdAwardInPlace`), so the toast never renders for a frame, and hands
   * it back on leaving (`releaseAwardInPlace`), which marks it seen
   * (`awardSeenId`). Achievement toasts are not affected: an unlocked award
   * is news the summary does not carry.
   */
  awardInPlace: boolean
  /**
   * The id of the last award a screen showed in place. The toast does not
   * announce it again once that screen is gone; any later payout has a new id
   * and is announced as usual. An id rather than clearing `lastAward`, so a
   * screen that mounts twice (StrictMode) still finds its award.
   */
  awardSeenId: number
}

/**
 * One announcement of XP: what was credited, and what it was made of.
 *
 * A finished session pays from several places within the same moment — the
 * answers, the accuracy on top, a personal best, and an instant later a
 * stage, a kept week, a challenge, an award. Each used to replace the one
 * before it in `lastAward`, so the toast showed whichever came last and the
 * rest was paid in silence. Payouts that land while an announcement is still
 * fresh now join it as further `parts`.
 *
 * `amount` is always the sum of `parts` — the lines of the toast add up to
 * what was credited, by construction.
 */
export interface XpAward {
  /** Increments with every payout, so the toast re-arms. */
  id: number
  /** XP credited by everything in this announcement. */
  amount: number
  /** What it was made of, in the order it was paid. Every part is above zero. */
  parts: XPSource[]
  /**
   * The one line that says it all, when one line can: a single part, or a
   * session the day's limit left nothing of. Absent once there is more to say.
   */
  labelKey?: string
  labelParams?: Record<string, string>
  /** A remark that is not an amount — the day's limit took part of a session. */
  noteKey?: string
  /** When it was last added to (epoch ms). */
  at: number
}

/** How long after a payout a further one still belongs to the same announcement. */
export const AWARD_MERGE_MS = 1500

/** The most lines the toast lists under its total. */
export const AWARD_MAX_LINES = 3

/** One line of the toast: a part with its amount, or a remark without one. */
export interface AwardLine {
  labelKey: string
  labelParams?: Record<string, string>
  amount?: number
}

/**
 * The lines the toast shows for an award — at most {@link AWARD_MAX_LINES}.
 *
 * More parts than fit are not dropped: the two largest keep their own line
 * and the rest share one ("Other"), so the lines still add up to the total.
 * The remark about the day's limit is shown when there is a line left for it.
 *
 * @param award - The announcement
 */
export function awardLines(award: Pick<XpAward, 'parts' | 'noteKey'>): AwardLine[] {
  let lines: AwardLine[] = award.parts.map(p => ({ ...p }))
  if (lines.length > AWARD_MAX_LINES) {
    const keep = new Set(
      award.parts
        .map((p, i) => ({ i, amount: p.amount }))
        .sort((a, b) => b.amount - a.amount || a.i - b.i)
        .slice(0, AWARD_MAX_LINES - 1)
        .map(x => x.i),
    )
    const rest = award.parts.reduce((sum, p, i) => (keep.has(i) ? sum : sum + p.amount), 0)
    lines = [
      ...award.parts.filter((_, i) => keep.has(i)).map(p => ({ ...p })),
      { labelKey: 'xp.part.other', amount: rest },
    ]
  }
  if (award.noteKey && lines.length < AWARD_MAX_LINES) lines.push({ labelKey: award.noteKey })
  return lines
}

/**
 * One line of the "where did this XP come from" breakdown.
 *
 * A translation **key**, not a rendered string. The store used to hold
 * `'Training session'`, `'Challenge'`, `'Achievement'` — English literals in a
 * `.ts` module, which the JSX lint rule cannot see — and the level-up popup
 * rendered them raw. Seven languages, one English breakdown. Same class of
 * defect as the constant maps found during the i18n work; storing the key and
 * translating at render is what makes it impossible to reintroduce.
 */
export interface XPSource {
  labelKey: string
  labelParams?: Record<string, string>
  amount: number
}

/** Actions for the level store. */
export interface LevelStoreActions {
  /**
   * Add XP from a completed training session. `earlier` are the sessions
   * recorded before it: a mode pays up to a limit per day.
   */
  addSessionXP(session: TrainingSessionResult, earlier?: TrainingSessionResult[]): void
  /** Add XP from a completed challenge or a finished plan stage. */
  addChallengeXP(amount: number, labelKey?: string, labelParams?: Record<string, string>): void
  /** Add XP from an unlocked achievement. */
  addAchievementXP(tier: string): void
  /** Add XP from several achievements unlocked at once (one popup, one cloud push). */
  addAchievementsXP(tiers: string[]): void
  /** Dismiss the level-up popup. */
  dismissLevelUp(): void
  /** Dismiss the XP toast. */
  dismissXpAward(): void
  /** A screen shows the coming award itself: hold the toast back. Call before the payout. */
  holdAwardInPlace(): void
  /** The screen is gone: let the toast speak again, and count the award it showed as seen. */
  releaseAwardInPlace(): void
  /** Refresh all state from the engine. */
  refresh(): void
}

export type LevelStore = LevelStoreState & LevelStoreActions

/** Map achievement tier to XP reward. */
function tierToXP(tier: string): number {
  switch (tier) {
    case 'bronze': return XP_REWARDS.achievementBronze
    case 'silver': return XP_REWARDS.achievementSilver
    case 'gold': return XP_REWARDS.achievementGold
    case 'diamond': return XP_REWARDS.achievementDiamond
    default: return 0
  }
}

/**
 * Zustand store for the Level System.
 *
 * Wraps the LevelSystem engine and provides reactive state for the UI.
 */
/**
 * Apply XP once and fold any level-up into the pending popup.
 *
 * This is the fix for "a fresh account level-jumps and the popup is a mystery".
 * A single completed session pays out from four places in a row — session,
 * daily challenge, weekly challenge, achievements — each a separate store
 * calling in synchronously with no React render between them. Previously every
 * path set `showLevelUp`/`levelUpData` outright, so of a Lv.1 → Lv.2 → Lv.3
 * burst only the LAST hop survived and the sound played several times.
 *
 * Here the transitions ACCUMULATE: the earliest `oldLevel` and the latest
 * `newLevel` are kept, and every payout appends to `breakdown`. Zustand's `set`
 * updates state synchronously, so `get()` inside the same burst already sees
 * the accumulated value — the sound fires once, on the first hop only.
 */
/** Monotonic id so repeated identical payouts still register as new. */
let awardSeq = 0

/** What one payout announces. */
interface Payout {
  /** What was credited, line by line. May be empty when only a remark is made. */
  parts: XPSource[]
  /** The single line for it, when it stands alone. */
  labelKey: string
  labelParams?: Record<string, string>
  noteKey?: string
}

/**
 * The announcement after a payout: a new one, or the fresh one with this
 * payout added to it.
 */
function announce(previous: XpAward | null, payout: Payout): XpAward {
  awardSeq += 1
  const now = Date.now()
  const parts = payout.parts.filter(p => p.amount > 0)
  const sum = (list: XPSource[]) => list.reduce((n, p) => n + p.amount, 0)
  if (!previous || now - previous.at > AWARD_MERGE_MS) {
    return {
      id: awardSeq,
      amount: sum(parts),
      parts,
      // One line only when one line says everything.
      ...(parts.length <= 1 ? { labelKey: payout.labelKey, labelParams: payout.labelParams } : {}),
      noteKey: payout.noteKey,
      at: now,
    }
  }
  const all = [...previous.parts, ...parts]
  return {
    id: awardSeq,
    amount: sum(all),
    parts: all,
    // Two payouts are two lines. Only two remarks with nothing paid are one.
    ...(all.length === 0 ? { labelKey: previous.labelKey ?? payout.labelKey } : {}),
    noteKey: previous.noteKey ?? payout.noteKey,
    at: now,
  }
}

function applyXP(
  set: (partial: Partial<LevelStore>) => void,
  get: () => LevelStore,
  payout: Payout,
): void {
  const amount = payout.parts.reduce((n, p) => n + Math.max(0, p.amount), 0)
  if (amount <= 0) return

  const before = get().levelUpData
  const result = levelSystem.addXP(amount)

  const base = {
    lastAward: announce(get().lastAward, payout),
    totalXP: levelSystem.getTotalXP(),
    level: levelSystem.getLevel(),
    progress: levelSystem.getProgressToNext(),
  }

  // The level-up popup keeps one line per payout, as before.
  const source: XPSource = { labelKey: payout.labelKey, labelParams: payout.labelParams, amount }

  if (result.leveledUp && result.oldLevel && result.newLevel) {
    // Sound only on the first hop of a burst — before this hop there was no
    // pending popup.
    if (!before) soundEngine.levelUp()
    set({
      ...base,
      showLevelUp: true,
      levelUpData: {
        oldLevel: before?.oldLevel ?? result.oldLevel, // earliest wins
        newLevel: result.newLevel,                      // latest wins
        breakdown: [...(before?.breakdown ?? []), source],
      },
    })
  } else if (before) {
    // No new level, but a popup is already pending from an earlier hop in this
    // same burst — record where this XP came from so the breakdown is complete.
    set({ ...base, levelUpData: { ...before, breakdown: [...before.breakdown, source] } })
  } else {
    set(base)
  }
  pushProfileScalars()
}

export const useLevelStore = create<LevelStore>((set, get) => ({
  totalXP: levelSystem.getTotalXP(),
  level: levelSystem.getLevel(),
  progress: levelSystem.getProgressToNext(),
  showLevelUp: false,
  levelUpData: null,
  lastAward: null,
  awardInPlace: false,
  awardSeenId: 0,

  addSessionXP(session, earlier = []) {
    const xp = sessionXP(session, earlier)
    // A new personal best is paid on top, and outside the day's limit: the
    // limit is there against grinding, and a best cannot be ground.
    const best = personalBestXP(session, earlier)
    // What the session is made of. The answers are paid first, the accuracy
    // factor is what it added on top; the two are `xp.amount` exactly.
    const base = xp.base ?? xp.amount
    const parts: XPSource[] = [
      { labelKey: 'xp.part.correct', amount: base },
      { labelKey: 'xp.part.accuracy', amount: xp.amount - base },
      { labelKey: 'xp.part.personalBest', amount: best },
    ].filter(p => p.amount > 0)
    const labelKey = best > 0
      ? 'xp.source.personalBest'
      : xp.amount > 0
        ? (xp.capped ? 'xp.source.sessionCapped' : 'xp.source.session')
        : 'xp.source.dailyCap'
    const payout: Payout = { parts, labelKey, noteKey: xp.capped ? 'xp.part.dailyCap' : undefined }
    if (parts.length > 0) {
      applyXP(set, get, payout)
    } else if (xp.capped) {
      // Earned, and not paid: say so, or a good session reads as a broken one.
      set({ lastAward: announce(get().lastAward, payout) })
    }
  },

  addChallengeXP(amount, labelKey = 'xp.source.challenge', labelParams) {
    applyXP(set, get, { parts: [{ labelKey, labelParams, amount }], labelKey, labelParams })
  },

  addAchievementXP(tier) {
    const labelKey = 'xp.source.achievement'
    applyXP(set, get, { parts: [{ labelKey, amount: tierToXP(tier) }], labelKey })
  },

  addAchievementsXP(tiers) {
    // Sum first, then apply once, so several achievements unlocked together are
    // one line in the breakdown rather than several competing popups.
    const labelKey = 'xp.source.achievements'
    applyXP(set, get, { parts: [{ labelKey, amount: tiers.reduce((sum, t) => sum + tierToXP(t), 0) }], labelKey })
  },

  dismissLevelUp() {
    set({ showLevelUp: false, levelUpData: null })
  },

  dismissXpAward() {
    set({ lastAward: null })
  },

  holdAwardInPlace() {
    set({ awardInPlace: true })
  },

  releaseAwardInPlace() {
    const { awardInPlace, lastAward, awardSeenId } = get()
    if (!awardInPlace) return
    set({ awardInPlace: false, awardSeenId: lastAward?.id ?? awardSeenId })
  },

  refresh() {
    set({
      totalXP: levelSystem.getTotalXP(),
      level: levelSystem.getLevel(),
      progress: levelSystem.getProgressToNext(),
    })
  },
}))
