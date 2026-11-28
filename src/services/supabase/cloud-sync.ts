import { localStorageService, getSyncedSessionIds, markSessionsSynced } from '../storage/storage-service'
import { clearLocalAppData, getLocalOwner, setLocalOwner } from '../storage/local-reset'
import { LOCAL_OWNER_KEY } from '../storage/local-owner'
import { SupabaseStorageService } from './supabase-storage'
import { useAuthStore } from '../../store/auth-store'
import { syncAchievementsOnSignIn } from './achievements-sync'
import { syncProfileOnSignIn, resetProfileSync, pushProfileScalars, pushProfileScalarsNow } from './profiles-sync'
import { runBeforeSignOut } from '../storage/before-sign-out'
import {
  confirmSessionsUploaded,
  getPendingSessionIds,
  getPendingSnapshot,
  markUploadFailed,
  subscribePendingSessions,
} from '../storage/pending-sessions'
import { withTimeout } from '../storage/with-timeout'
import { useCloudSyncStore } from '../../store/cloud-sync-store'
import { fetchCloudSessions, upsertCloudSessions, normalizeId, mergeById } from './bankroll-sync'
import { useStatsStore } from '../../store/stats-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { rebuildTrackedSessions, mergeTrackedSessions } from '../casino-tracker-rebuild'
import { useAchievementStore } from '../../store/achievement-store'
import { useLevelStore } from '../../store/level-store'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'
import { useEntitlementStore } from '../../store/entitlement-store'
import type { TrackedSession } from '../../store/bankroll-tracker-store'
import type { TrainingSessionResult } from '../stats-types'
import { requireSupabase, isSupabaseConfigured } from './client'
import { clearGuestRound, guestDataBelongsTo } from '../guest-trial'

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
async function syncBankrollOnSignIn(userId: string, current: () => boolean): Promise<void> {
  const cloudSessions = await fetchCloudSessions(userId)
  // The account may have changed while the request was out: this is that
  // account's real-money log and must not land in someone else's tracker.
  if (!current()) return

  // Read the local set only AFTER the fetch resolves. Snapshotting it before the
  // await would drop any session the user added while the request was in flight.
  const store = useBankrollTrackerStore.getState()
  const localNormalized: TrackedSession[] = store.sessions.map(normalizeId)

  store.hydrate(mergeById(localNormalized, cloudSessions))
  await upsertCloudSessions(userId, localNormalized) // push local-only + local edits
}

/** What a sign-out attempt came to. */
export type SignOutOutcome = 'signedOut' | 'unsaved'

/** How long the level and the achievements may take to go up before a sign-out stops waiting for them. */
export const SIGN_OUT_PROGRESS_TIMEOUT_MS = 12_000

/**
 * Send what is still waiting on this device, while there is still a session
 * to send it as. Resolves with whether nothing is left waiting.
 *
 * The level, the stage claims and the achievements go up with the sessions,
 * as on reconnect: their own pushes failed along with the session's. A failure
 * of those two is logged and does not hold the sign-out — see the note in
 * `signOutAndClearLocal`.
 */
async function uploadBeforeSignOut(): Promise<boolean> {
  if (!isSupabaseConfigured || getPendingSessionIds().length === 0) return true
  // No request when the browser itself says there is no network: it could
  // only fail, after a wait.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    await pushLocalSessions()
    const results = await Promise.allSettled([
      withTimeout(pushProfileScalarsNow(), SIGN_OUT_PROGRESS_TIMEOUT_MS, 'profile push before sign-out'),
      withTimeout(syncAchievementsOnSignIn(), SIGN_OUT_PROGRESS_TIMEOUT_MS, 'achievement sync before sign-out'),
    ])
    for (const r of results) {
      if (r.status === 'rejected') console.error('progress upload before sign-out failed', r.reason)
    }
  } catch (e) {
    console.error('upload of waiting sessions before sign-out failed', e)
  }
  // Asked again rather than inferred: a push that resolved without sending
  // (the device's data is not this account's) leaves the list as it was.
  return getPendingSessionIds().length === 0
}

/**
 * Sign out and wipe the local caches.
 *
 * The wipe is mandatory, not cosmetic: `handleSignedIn` treats whatever sits in
 * localStorage as belonging to the account that signs in next. Leaving the
 * previous user's data behind would push their training history, achievements,
 * level and real-money bankroll log into a stranger's cloud account. The cloud
 * copy is untouched — signing back in restores everything.
 *
 * Resolves with `'unsaved'` — and has then wiped nothing and signed nobody
 * out — when sessions recorded on this device could not be uploaded. The
 * caller asks, and calls again with `discardUnsaved` if the answer is to sign
 * out regardless. Never rejects.
 *
 * @param options.discardUnsaved Sign out even if sessions are lost with it
 */
export async function signOutAndClearLocal(
  options: { discardUnsaved?: boolean } = {},
): Promise<SignOutOutcome> {
  // 0. Before anything is wiped, while the user is still signed in:
  //
  //    a) Work held only in memory is finished and recorded — a casino table
  //       in play. It used to be recorded by the table's unmount, *after* the
  //       wipe, into storage that no longer had an owner and was then merged
  //       into whoever signed in next.
  //    b) Sessions still waiting for the cloud are sent. The wipe takes
  //       `bjt_sessions` and the list of what is waiting; nothing brings them
  //       back. If they cannot be sent, nothing happens here at all and the
  //       caller is told.
  //
  //    Not covered, and known: with the sessions confirmed, a level push that
  //    fails here is only logged, and progress with no session attached that
  //    never reached the cloud (nothing on the waiting list) is not looked for.
  await runBeforeSignOut()
  if (!options.discardUnsaved && !(await uploadBeforeSignOut())) return 'unsaved'

  // 1. The wipe — unconditionally from here on, and before the server call.
  //    It is synchronous and cannot fail on a network, and it used to run
  //    *after* the server call — so a failed call skipped it entirely and left
  //    the previous user's data for `handleSignedIn` to push into whoever
  //    signed in next.
  //
  //    A sign-in merge still in flight is disowned first: whatever it receives
  //    from now on belongs to the account that just left.
  syncRun++
  signInSync = null
  clearLocalAppData()
  knownOwner = null
  resetProfileSync()
  useCloudSyncStore.getState().set('idle')

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
  return 'signedOut'
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

/** How long the batch push of local sessions may take before it counts as failed. */
export const SESSION_PUSH_TIMEOUT_MS = 20_000

/** In-flight session push, so a repeat call joins it instead of racing it. */
let sessionPush: Promise<number> | null = null

/**
 * Push the sessions on this device the cloud has not confirmed yet. Resolves
 * with how many were sent; rejects when the cloud did not confirm them.
 *
 * Not the whole of `bjt_sessions`: that used to go up on every page load, a
 * payload that only grew, against a fixed time limit. What goes is every
 * session waiting for upload plus every session never confirmed at all — a
 * guest's, a legacy one, one written by a build before the confirmed list
 * existed (so the first load after an update sends everything once, as
 * before). A session leaves this set only on a confirmed write, so a failed
 * push loses nothing.
 *
 * This is the one push there is. The sign-in merge runs it on every page
 * load, and `installReconnectSync` runs it again when the browser comes back
 * online — so a session saved without a connection does not wait for the next
 * visit. It is an upsert on the session id: sending a session twice writes one
 * row, which is what makes it safe to call from both.
 *
 * It covers the guest → first-account migration and every session that fell
 * back to local. Legacy sessions predate uuid ids (older builds used short
 * counters like "a0"). The cloud primary key is a uuid, and the push is ONE
 * upsert, so a single legacy row makes Postgres reject the whole batch
 * (22P02). Those ids are reassigned and written back locally first, so local
 * and cloud agree and the next sync does not duplicate anything.
 */
export function pushLocalSessions(): Promise<number> {
  if (sessionPush) return sessionPush
  sessionPush = runSessionPush().finally(() => { sessionPush = null })
  return sessionPush
}

async function runSessionPush(): Promise<number> {
  // Only what belongs to the signed-in account goes up — the same test
  // `getDeviceSessionResults` applies before showing it. The upsert writes
  // every row under the *current* session's user id, so without this a device
  // still holding someone else's sessions (the wipe that enforces ownership
  // runs a moment after sign-in; the reconnect triggers do not wait for it)
  // would file them in this account. A guest's sessions have no owner until
  // the sign-in merge claims them with `setLocalOwner`, and it does so before
  // it calls this — which is what keeps the first-account migration working.
  // Nothing is confirmed here: what is waiting stays waiting.
  const userId = useAuthStore.getState().user?.id
  if (!userId || getLocalOwner() !== userId) return 0

  // Read before the sessions: an id marked after this line belongs to a
  // session this batch may not contain, and must not be confirmed by it.
  const waiting = getPendingSessionIds()
  const synced = getSyncedSessionIds()
  const localSessions = await localStorageService.getAllSessionResults()
  if (localSessions.length === 0) {
    // Marked as waiting with no local copy (the local write failed): there is
    // nothing left on this device to send.
    confirmSessionsUploaded(waiting)
    return 0
  }
  const normalized = localSessions.map(normalizeSessionId)
  if (normalized.some((s, i) => s.id !== localSessions[i].id)) {
    await localStorageService.replaceAllSessionResults(normalized)
  }
  const unsent = normalized.filter(s => !synced.has(s.id) || waiting.includes(s.id))
  if (unsent.length === 0) {
    // Every session here is in the cloud already; an id still waiting has no
    // local copy left to send (as above).
    confirmSessionsUploaded(waiting)
    return 0
  }
  try {
    await withTimeout(cloud.saveMany(unsent), SESSION_PUSH_TIMEOUT_MS, 'session push')
  } catch (e) {
    markUploadFailed()
    throw e
  }
  confirmSessionsUploaded(waiting)
  markSessionsSynced(unsent.map(s => s.id))
  return unsent.length
}

/** First wait before a failed upload is tried again; doubles up to the cap. */
export const UPLOAD_RETRY_MIN_MS = 15_000
/** Longest wait between two upload attempts. */
export const UPLOAD_RETRY_MAX_MS = 5 * 60_000

/**
 * Send what is waiting as soon as it can be sent.
 *
 * Three triggers, one push:
 *  - the browser's `online` event — the connection came back;
 *  - the tab becoming visible again — a phone that was in a pocket;
 *  - a timer after a failed attempt, backing off from 15 s to 5 min — for the
 *    case `online` never reports: the network is there and Supabase is not.
 *
 * The level, the stage claims and the achievements go up with it. Their own
 * pushes are fire-and-forget and failed along with the session's.
 *
 * Returns the function that removes the listeners (for tests).
 */
export function installReconnectSync(): () => void {
  if (!isSupabaseConfigured || typeof window === 'undefined') return () => {}

  let retryDelay = UPLOAD_RETRY_MIN_MS
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const signedIn = () => useAuthStore.getState().status === 'signedIn'
  const online = () => navigator.onLine !== false

  const upload = () => {
    if (!signedIn() || !online() || getPendingSessionIds().length === 0) return
    pushLocalSessions().then(
      () => {
        pushProfileScalars()
        syncAchievementsOnSignIn().catch(e => console.error('achievement sync after reconnect failed', e))
      },
      e => console.error('upload of waiting sessions failed; it will be tried again', e),
    )
  }

  const onOnline = () => {
    if (!signedIn()) return
    // Progress written while offline (a stage claim, a plan answer) has no
    // session attached; one cheap update sends it either way.
    if (getPendingSessionIds().length === 0) pushProfileScalars()
    upload()
  }
  const onVisible = () => { if (document.visibilityState === 'visible') upload() }

  const unsubscribe = subscribePendingSessions(() => {
    if (!getPendingSnapshot().failed) {
      retryDelay = UPLOAD_RETRY_MIN_MS
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      return
    }
    if (retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryDelay = Math.min(retryDelay * 2, UPLOAD_RETRY_MAX_MS)
      upload()
    }, retryDelay)
  })

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    unsubscribe()
    if (retryTimer) clearTimeout(retryTimer)
  }
}

// Installed once, with the module: `App` imports this file on every page.
installReconnectSync()

/**
 * Whose data this tab's memory holds, as far as this tab knows: read when the
 * page loaded, moved only by this tab's own claim and wipe.
 */
let knownOwner: string | null = getLocalOwner()

/**
 * Set once another tab has changed whose data this device holds. From then on
 * this tab's in-memory engines and stores (level XP, achievements, the
 * bankroll log) describe nobody's storage, and nothing may be merged from
 * them — only a reload clears them.
 */
let memoryIsStale = false

/** The reload, as an object so tests can stand in for it (jsdom cannot navigate). */
export const tabReload = { reload: (): void => { window.location.reload() } }

/**
 * Reload this tab when another tab changes whose data the device holds.
 *
 * Signing out in tab A wipes storage and reloads A's engines; tab B kept the
 * previous account's XP, achievements and bankroll log in memory. When the
 * next account signed in, B received SIGNED_IN, found storage ownerless — so
 * not foreign — and merged its memory into that account: the XP by max (made
 * permanent by the database trigger) and the real-money log by upsert.
 *
 * Two ways to learn of it: a `storage` event on the owner key (fired only in
 * the *other* tabs, which is exactly "a change this tab did not start"; a key
 * of null is `localStorage.clear()`), and a page restored from the back-forward
 * cache, which missed every event while it was frozen. A reload is the one
 * thing that resets every singleton at once.
 *
 * Returns the function that removes the listeners (for tests).
 */
export function installForeignOwnerReload(): () => void {
  if (!isSupabaseConfigured || typeof window === 'undefined') return () => {}

  const goStale = () => {
    memoryIsStale = true
    // A merge already running speaks for the account that left.
    syncRun++
    signInSync = null
    tabReload.reload()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea && e.storageArea !== localStorage) return
    if (e.key === null || (e.key === LOCAL_OWNER_KEY && e.oldValue !== e.newValue)) goStale()
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted && getLocalOwner() !== knownOwner) goStale()
  }

  window.addEventListener('storage', onStorage)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pageshow', onPageShow)
  }
}

installForeignOwnerReload()

/**
 * How long one network step of the sign-in merge may take. Without a limit a
 * request that never answers held the whole merge — and every screen waiting
 * for `done` — for good.
 */
export const SIGN_IN_STEP_TIMEOUT_MS = 15_000

/** In-flight sign-in sync and whose it is, so a repeat call joins it instead of racing it. */
let signInSync: { userId: string | null; promise: Promise<void> } | null = null

/**
 * Counts sign-in merges and sign-outs. A merge remembers the number it started
 * with; once the number has moved on, the account it was started for is no
 * longer the one on this device and it must write nothing more.
 */
let syncRun = 0

/**
 * Run when a user signs in. Concurrency-safe: a second call for the same user
 * while one is in flight (StrictMode double-effect) joins the first. A call
 * for a different user starts its own run — joining would hand that user the
 * previous one's merge and skip their own — and the earlier run stops writing.
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
  const userId = useAuthStore.getState().user?.id ?? null
  if (signInSync && signInSync.userId === userId) return signInSync.promise
  const run = ++syncRun
  useCloudSyncStore.getState().set('syncing')
  const promise = runSignInSync(run).finally(() => {
    // Superseded by a sign-out or by another account's run: the status and
    // the slot are theirs now.
    if (run !== syncRun) return
    signInSync = null
    useCloudSyncStore.getState().set('done')
  })
  signInSync = { userId, promise }
  return promise
}

async function runSignInSync(run: number): Promise<void> {
  /** Whether this run still speaks for the account on this device. */
  const current = () => run === syncRun

  /**
   * One step of the merge: bounded in time, isolated from the others, and its
   * result only shown if the account has not changed meanwhile. Resolves with
   * whether the run may go on.
   */
  const step = async (what: string, work: () => Promise<void>, apply?: () => void): Promise<boolean> => {
    try {
      await withTimeout(work(), SIGN_IN_STEP_TIMEOUT_MS, what)
      if (current()) apply?.()
    } catch (e) {
      console.error(`${what} on sign-in failed`, e)
    }
    return current()
  }

  try {
    const { data } = await requireSupabase().auth.getSession()
    const userId = data.session?.user.id
    if (!userId || !current()) return

    // This tab's memory belongs to an account another tab has since signed
    // out (see `installForeignOwnerReload`). Merging it would hand that
    // account's level and bankroll log to this one; the reload is on its way.
    if (memoryIsStale) {
      tabReload.reload()
      return
    }

    // Account isolation. `null` owner means guest data that has never belonged
    // to an account — that is the legitimate one-time migration, so keep it.
    //
    // With one exception since the public trial round (`/try`): ownerless
    // data that carries the trial's stamp goes only to an account created
    // after that round began — the visitor who played and then signed up. On
    // a shared computer the next sign-in may be somebody else's existing
    // account, and a stranger's round must not land in their history. See
    // `services/guest-trial.ts`.
    const owner = getLocalOwner()
    const foreign = owner
      ? owner !== userId
      : !guestDataBelongsTo(data.session?.user.created_at)
    if (foreign) {
      clearLocalAppData()
      resetProfileSync()
    }
    setLocalOwner(userId)
    // Read back, not assumed: a write storage refused leaves the owner as it was.
    knownOwner = getLocalOwner()
    // Claimed or wiped: either way the stamp has done its work.
    clearGuestRound()

    // Push any local sessions to the cloud (idempotent upsert on id) — see
    // `pushLocalSessions`. Isolated like the steps below: a push that fails
    // used to abort this entire sync, taking achievements, level, bankroll and
    // stats hydration with it. The sessions stay marked as waiting and the
    // reconnect sync tries again. It carries its own time limit.
    try {
      await pushLocalSessions()
    } catch (e) {
      console.error('session push on sign-in failed; the sessions stay on this device', e)
    }
    if (!current()) return

    // Achievements: union cloud + local, push local-only up, refresh the UI.
    // Isolated so a failure here can't block stats hydration below.
    if (!await step('achievement sync', syncAchievementsOnSignIn,
      () => useAchievementStore.getState().loadAchievements())) return

    // Progress scalars: max-merge level XP + sim counters, then refresh the UI.
    if (!await step('profile sync', syncProfileOnSignIn,
      () => useLevelStore.getState().refresh())) return

    // Bankroll tracker: union-merge the real-money session log.
    if (!await step('bankroll sync', () => syncBankrollOnSignIn(userId, current))) return

    // Entitlement: load the Pro subscription status for gating.
    //
    // The store writes its answer whenever the request comes back. If this
    // run has been superseded by then, that answer is the previous account's
    // subscription drawn for whoever is here now — so it is put right, and on
    // the request itself rather than on the timed wait, which may have given
    // up first.
    const entitlement = useEntitlementStore.getState().loadEntitlement()
    void entitlement.then(() => {
      if (current()) return
      if (useAuthStore.getState().status === 'signedIn') void useEntitlementStore.getState().loadEntitlement()
      else useEntitlementStore.getState().reset()
    }, () => { /* the store reports its own failures */ })
    if (!await step('entitlement load', () => entitlement)) return

    // The history. It has its own time limit (`CLOUD_READ_TIMEOUT_MS`).
    await useStatsStore.getState().loadStats()
    if (!current()) {
      // As with the entitlement: what just landed in the store is the
      // previous account's history.
      if (useAuthStore.getState().status === 'signedIn') void useStatsStore.getState().loadStats()
      else useStatsStore.setState({ sessions: [], lifetimeStats: null })
      return
    }

    /*
      Put the Casino Session Tracker back.

      It is the one piece of progress with no table of its own, so `signOut`'s
      mandatory local wipe used to destroy it outright while everything else
      came back from the cloud. Signing out silently deleted a log of
      real-money bankroll figures.

      No fifth table was needed in the end: `training_sessions.details` is
      jsonb, so the two bankroll figures and the table config now ride along in
      the session record, and the tracker is derivable from what already syncs.
      Merged rather than replaced, and local wins — the same rule the bankroll
      sync uses, so an offline session added on this device is not overwritten
      by a reconstruction of what the cloud saw.
    */
    const tracker = useCasinoSessionTrackerStore.getState()
    tracker.hydrate(mergeTrackedSessions(
      tracker.sessions,
      rebuildTrackedSessions(useStatsStore.getState().sessions)
    ))
  } catch (e) {
    console.error('cloud sync on sign-in failed', e)
  }
}
