import { create } from 'zustand'
import type { TrainingSessionResult } from '../services/stats-types'
import type { LevelDefinition, LevelProgress } from '../services/level-system'
import { levelSystem, calculateSessionXP, XP_REWARDS } from '../services/level-system'
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
  lastAward: { amount: number; labelKey: string; labelParams?: Record<string, string>; id: number } | null
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
  /** Add XP from a completed training session. */
  addSessionXP(session: TrainingSessionResult): void
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

function applyXP(
  set: (partial: Partial<LevelStore>) => void,
  get: () => LevelStore,
  amount: number,
  labelKey: string,
  labelParams?: Record<string, string>,
): void {
  if (amount <= 0) return

  const before = get().levelUpData
  const result = levelSystem.addXP(amount)
  awardSeq += 1

  const base = {
    lastAward: { amount, labelKey, labelParams, id: awardSeq },
    totalXP: levelSystem.getTotalXP(),
    level: levelSystem.getLevel(),
    progress: levelSystem.getProgressToNext(),
  }

  const source: XPSource = { labelKey, labelParams, amount }

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

  addSessionXP(session) {
    applyXP(set, get, calculateSessionXP(session), 'xp.source.session')
  },

  addChallengeXP(amount, labelKey = 'xp.source.challenge', labelParams) {
    applyXP(set, get, amount, labelKey, labelParams)
  },

  addAchievementXP(tier) {
    applyXP(set, get, tierToXP(tier), 'xp.source.achievement')
  },

  addAchievementsXP(tiers) {
    // Sum first, then apply once, so several achievements unlocked together are
    // one line in the breakdown rather than several competing popups.
    applyXP(set, get, tiers.reduce((sum, t) => sum + tierToXP(t), 0), 'xp.source.achievements')
  },

  dismissLevelUp() {
    set({ showLevelUp: false, levelUpData: null })
  },

  dismissXpAward() {
    set({ lastAward: null })
  },

  refresh() {
    set({
      totalXP: levelSystem.getTotalXP(),
      level: levelSystem.getLevel(),
      progress: levelSystem.getProgressToNext(),
    })
  },
}))
