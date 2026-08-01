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
import { useEntitlementStore } from '../../store/entitlement-store'
import type { TrackedSession } from '../../store/bankroll-tracker-store'
import type { TrainingSessionResult } from '../stats-types'
import { requireSupabase, isSupabaseConfigured } from './client'

const cloud = new SupabaseStorageService()

/** Matches a canonical uuid; anything else is a legacy id that needs replacing. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Give a training session a uuid if it doesn't have one.
 *
 * Mirrors `normalizeId` for bankroll sessions: the cloud primary key is a uuid,
 * but sessions recorded by older builds carry short local ids. Sessions that
 * already have a uuid are returned unchanged, so this is idempotent.
 */
export function normalizeSessionId(s: TrainingSessionResult): TrainingSessionResult {
  return UUID_RE.test(s.id) ? s : { ...s, id: crypto.randomUUID() }
}

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
  // 1. The wipe, first and unconditionally. It is synchronous and cannot fail on
  //    a network, and it used to run *after* the server call — so a failed call
  //    skipped it entirely and left the previous user's data for `handleSignedIn`
  //    to push into whoever signed in next.
  clearLocalAppData()

  // 2. Ask the server to revoke, while the access token still exists to revoke
  //    with. Best effort: a failure here costs the remote session, not this one.
  try {
    await useAuthStore.getState().signOut()
  } catch (e) {
    console.error('server sign-out failed; the local session is cleared regardless', e)
  }

  // 3. Make certain the stored session is gone.
  //
  //    supabase-js returns early from `_signOut` when the API call fails with
  //    anything other than 401/403/404 — *before* it removes the persisted
  //    session. So on a flaky connection the token survives and the next reload
  //    signs the user straight back in: a sign-out that does not sign anyone
  //    out. Removing the key directly is the only way to guarantee it, and it is
  //    narrow — only `sb-*-auth-token`, nothing else.
  forgetStoredAuthSession()
  useAuthStore.setState({ status: 'signedOut', session: null, user: null })
}

/** Drop any persisted Supabase auth session from this browser. */
function forgetStoredAuthSession(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && /^sb-.*-auth-token/.test(key)) doomed.push(key)
    }
    doomed.forEach(key => localStorage.removeItem(key))
  } catch { /* storage unavailable — nothing persisted, nothing to forget */ }
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
    // Legacy sessions predate uuid ids (older builds used short counters like
    // "a0"). The cloud primary key is a uuid, and the push is ONE upsert, so a
    // single legacy row makes Postgres reject the whole batch (22P02) — which
    // aborted this entire sync, taking achievements, level, bankroll and stats
    // hydration with it. Reassign those ids and write them back locally first,
    // so local and cloud agree and the next sync doesn't duplicate anything.
    const localSessions = await localStorageService.getAllSessionResults()
    if (localSessions.length > 0) {
      const normalized = localSessions.map(normalizeSessionId)
      if (normalized.some((s, i) => s.id !== localSessions[i].id)) {
        await localStorageService.replaceAllSessionResults(normalized)
      }
      await cloud.saveMany(normalized)
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

    // Entitlement: load the Pro subscription status for gating.
    await useEntitlementStore.getState().loadEntitlement()

    await useStatsStore.getState().loadStats()
  } catch (e) {
    console.error('cloud sync on sign-in failed', e)
  }
}
