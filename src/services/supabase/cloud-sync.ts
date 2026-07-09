import { localStorageService } from '../storage/storage-service'
import { SupabaseStorageService } from './supabase-storage'
import { syncAchievementsOnSignIn } from './achievements-sync'
import { syncProfileOnSignIn } from './profiles-sync'
import { fetchCloudSessions, upsertCloudSessions, normalizeId, mergeById } from './bankroll-sync'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useLevelStore } from '../../store/level-store'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'
import type { TrackedSession } from '../../store/bankroll-tracker-store'
import { requireSupabase, isSupabaseConfigured } from './client'

const cloud = new SupabaseStorageService()

/** localStorage flag key marking a user's one-time local→cloud migration as done. */
function migratedKey(userId: string): string {
  return `bjt_cloud_migrated_${userId}`
}

/**
 * Union-merge local and cloud bankroll sessions by id (local wins on conflict,
 * so an offline edit is preserved and pushed up). Legacy sessions created
 * before this sync used non-uuid ids; those are reassigned a uuid so they fit
 * the cloud primary key. The merged set is written back locally and pushed up.
 */
async function syncBankrollOnSignIn(userId: string): Promise<void> {
  const store = useBankrollTrackerStore.getState()
  const localNormalized: TrackedSession[] = store.sessions.map(normalizeId)
  const cloudSessions = await fetchCloudSessions(userId)

  store.hydrate(mergeById(localNormalized, cloudSessions))
  await upsertCloudSessions(userId, localNormalized) // push local-only + local edits
}

/**
 * Run when a user signs in:
 *  1. One-time migrate local sessions into the cloud (idempotent — upsert on id,
 *     so it never duplicates or overwrites cloud data).
 *  2. Union-merge achievements between local and cloud (both directions).
 *  3. Reconcile progress scalars (level XP, sim counters) by max-merge.
 *  4. Hydrate the stats store from the cloud (now the source of truth).
 *
 * Non-fatal on failure: the app stays usable, we just log and move on.
 */
export async function handleSignedIn(): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await requireSupabase().auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return

    if (!localStorage.getItem(migratedKey(userId))) {
      const localSessions = await localStorageService.getAllSessionResults()
      if (localSessions.length > 0) {
        await cloud.saveMany(localSessions)
      }
      try { localStorage.setItem(migratedKey(userId), new Date().toISOString()) } catch { /* ignore */ }
    }

    // Achievements: union cloud + local, push local-only up, refresh the UI.
    // Isolated so a failure here can't block stats hydration below.
    try {
      await syncAchievementsOnSignIn()
      useAchievementStore.getState().loadAchievements()
    } catch (e) {
      console.error('achievement sync on sign-in failed', e)
    }

    // Progress scalars: max-merge level XP + sim counters, then refresh the UI.
    try {
      await syncProfileOnSignIn()
      useLevelStore.getState().refresh()
    } catch (e) {
      console.error('profile sync on sign-in failed', e)
    }

    // Bankroll tracker: union-merge the real-money session log.
    try {
      await syncBankrollOnSignIn(userId)
    } catch (e) {
      console.error('bankroll sync on sign-in failed', e)
    }

    await useStatsStore.getState().loadStats()
  } catch (e) {
    console.error('cloud sync on sign-in failed', e)
  }
}
