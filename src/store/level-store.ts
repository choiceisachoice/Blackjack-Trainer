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
}

/** One line of the "where did this XP come from" breakdown. */
export interface XPSource {
  label: string
  amount: number
}

/** Actions for the level store. */
export interface LevelStoreActions {
  /** Add XP from a completed training session. */
  addSessionXP(session: TrainingSessionResult): void
  /** Add XP from a completed challenge or a finished plan stage. */
  addChallengeXP(amount: number, label?: string): void
  /** Add XP from an unlocked achievement. */
  addAchievementXP(tier: string): void
  /** Add XP from several achievements unlocked at once (one popup, one cloud push). */
  addAchievementsXP(tiers: string[]): void
  /** Dismiss the level-up popup. */
  dismissLevelUp(): void
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
function applyXP(
  set: (partial: Partial<LevelStore>) => void,
  get: () => LevelStore,
  amount: number,
  label: string,
): void {
  if (amount <= 0) return

  const before = get().levelUpData
  const result = levelSystem.addXP(amount)

  const base = {
    totalXP: levelSystem.getTotalXP(),
    level: levelSystem.getLevel(),
    progress: levelSystem.getProgressToNext(),
  }

  const source: XPSource = { label, amount }

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

  addSessionXP(session) {
    applyXP(set, get, calculateSessionXP(session), 'Training session')
  },

  addChallengeXP(amount, label = 'Challenge') {
    applyXP(set, get, amount, label)
  },

  addAchievementXP(tier) {
    applyXP(set, get, tierToXP(tier), 'Achievement')
  },

  addAchievementsXP(tiers) {
    // Sum first, then apply once, so several achievements unlocked together are
    // one line in the breakdown rather than several competing popups.
    applyXP(set, get, tiers.reduce((sum, t) => sum + tierToXP(t), 0), 'Achievements')
  },

  dismissLevelUp() {
    set({ showLevelUp: false, levelUpData: null })
  },

  refresh() {
    set({
      totalXP: levelSystem.getTotalXP(),
      level: levelSystem.getLevel(),
      progress: levelSystem.getProgressToNext(),
    })
  },
}))
