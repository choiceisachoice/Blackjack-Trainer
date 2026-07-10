import { achievementEngine } from '../achievements/achievement-engine'
import { levelSystem } from '../level-system'
import { dailyChallengeEngine } from '../challenges/daily-challenge'
import { weeklyChallengeEngine } from '../challenges/weekly-challenge'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useLevelStore } from '../../store/level-store'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { useChallengeStore } from '../../store/challenge-store'
import { useWeeklyChallengeStore } from '../../store/weekly-challenge-store'

/** Every app-owned localStorage key starts with this. */
const APP_PREFIX = 'bjt_'

/**
 * Keys that describe the *device*, not the *person*. These survive a wipe so a
 * user isn't thrown back to light mode with the sound on after signing out.
 */
const DEVICE_PREF_KEYS = new Set([
  'bjt_theme',
  'bjt_sound_settings',
  'bjt_dealing_speed',
  'bjt_ambient_volume',
])

/** localStorage key recording which user the local caches currently belong to. */
export const LOCAL_OWNER_KEY = 'bjt_local_owner'

/** The user id the local caches belong to, or null for never-signed-in (guest) data. */
export function getLocalOwner(): string | null {
  try {
    return localStorage.getItem(LOCAL_OWNER_KEY)
  } catch {
    return null
  }
}

/** Record which user the local caches belong to. */
export function setLocalOwner(userId: string): void {
  try {
    localStorage.setItem(LOCAL_OWNER_KEY, userId)
  } catch { /* ignore */ }
}

/**
 * Wipe every trace of the current user's progress from this device: the
 * `bjt_*` localStorage keys (except device preferences), the in-memory engine
 * singletons, and the Zustand stores that mirror them.
 *
 * This is a **security boundary**, not a convenience. Without it, the sync layer
 * would treat the previous user's local data as belonging to whoever signs in
 * next and push their training history, achievements, level and real-money
 * bankroll log into a foreign cloud account.
 *
 * It never touches the cloud — signing back in re-hydrates everything.
 */
export function clearLocalAppData(): void {
  // 1. localStorage — drop all app keys except device preferences.
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(APP_PREFIX) && !DEVICE_PREF_KEYS.has(key)) {
        doomed.push(key)
      }
    }
    doomed.forEach(key => localStorage.removeItem(key))
  } catch { /* ignore */ }

  // 2. In-memory singletons — they cached the old user's data at construction.
  achievementEngine.reloadFromStorage()
  levelSystem.reload()
  dailyChallengeEngine.reloadFromStorage()
  weeklyChallengeEngine.reloadFromStorage()

  // 3. Zustand stores mirroring the above. Note: we deliberately do NOT call
  //    stats-store.resetAllStats() or achievement-store.resetAchievements() —
  //    those clear the *cloud* too, which would delete the signed-out user's data.
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
  useAchievementStore.setState({ unlockedIds: [], newlyUnlocked: [], totalUnlocked: 0 })
  useLevelStore.getState().refresh()
  useBankrollTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useCasinoSessionTrackerStore.getState().reset()
  useChallengeStore.getState().refresh()
  useWeeklyChallengeStore.getState().refresh()
}
