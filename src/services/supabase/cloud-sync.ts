import { localStorageService } from '../storage/storage-service'
import { clearLocalAppData, getLocalOwner, setLocalOwner } from '../storage/local-reset'
import { SupabaseStorageService } from './supabase-storage'
import { useAuthStore } from '../../store/auth-store'
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

/**
 * Union-merge local and cloud bankroll sessions by id (local wins on conflict,
 * so an offline edit is preserved and pushed up). Legacy sessions created
 * before this sync used non-uuid ids; those are reassigned a uuid so they fit
 * the cloud primary key. The merged set is written back locally and pushed up.
 */
async function syncBankrollOnSignIn(userId: string): Promise<void> {
  const cloudSessions = await fetchCloudSessions(userId)

  // Read the local set only AFTER the fetch resolves. Snapshotting it before the
  // await would drop any session the user added while the request was in flight.
  const store = useBankrollTrackerStore.getState()
  const localNormalized: TrackedSession[] = store.sessions.map(normalizeId)

  store.hydrate(mergeById(localNormalized, cloudSessions))
  await upsertCloudSessions(userId, localNormalized) // push local-only + local edits
}

/**
 * Sign out and wipe the local caches.
 *
 * The wipe is mandatory, not cosmetic: `handleSignedIn` treats whatever sits in
 * localStorage as belonging to the account that signs in next. Leaving the
 * previous user's data behind would push their training history, achievements,
 * level and real-money bankroll log into a stranger's cloud account. The cloud
 * copy is untouched — signing back in restores everything.
 */
export async function signOutAndClearLocal(): Promise<void> {
  await useAuthStore.getState().signOut()
  clearLocalAppData()
}

/** In-flight sign-in sync, so a repeat call joins it instead of racing it. */
let signInSync: Promise<void> | null = null

/**
 * Run when a user signs in. Concurrency-safe: a second call while one is in
 * flight (StrictMode double-effect, a fast sign-out→sign-in) joins the first.
 *
 *  0. **Account isolation:** if the local caches belong to a different user,
 *     wipe them before anything merges. Otherwise the steps below would push
 *     the previous user's data into this account.
 *  1. One-time migrate local sessions into the cloud (idempotent — upsert on id,
 *     so it never duplicates or overwrites cloud data).
 *  2. Union-merge achievements between local and cloud (both directions).
 *  3. Reconcile progress scalars (level XP, sim counters) by max-merge.
 *  4. Union-merge the bankroll session log.
 *  5. Hydrate the stats store from the cloud (now the source of truth).
 *
 * Non-fatal on failure: the app stays usable, we just log and move on.
 */
export function handleSignedIn(): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve()
  if (signInSync) return signInSync
  signInSync = runSignInSync().finally(() => { signInSync = null })
  return signInSync
}

async function runSignInSync(): Promise<void> {
  try {
    const { data } = await requireSupabase().auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return

    // Account isolation. `null` owner means guest data that has never belonged
    // to an account — that is the legitimate one-time migration, so keep it.
    const owner = getLocalOwner()
    if (owner && owner !== userId) {
      clearLocalAppData()
    }
    setLocalOwner(userId)

    // Push any local sessions to the cloud (idempotent upsert on id). This
    // covers both the guest → first-account migration and any sessions that
    // fell back to local while offline. Cheap: a signed-in user's new sessions
    // go straight to the cloud, so local stays near-empty between syncs.
    const localSessions = await localStorageService.getAllSessionResults()
    if (localSessions.length > 0) {
      await cloud.saveMany(localSessions)
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
