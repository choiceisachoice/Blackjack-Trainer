/**
 * Which finished sessions are on this device but not yet confirmed in the cloud.
 *
 * A session is written locally first and pushed to the cloud in the
 * background. Until this list existed nothing recorded whether that push had
 * arrived: a failed one was logged to a console nobody reads, and a request
 * that never returned was not noticed at all. The list is the difference
 * between "saved" and "saved here, still to be uploaded" — which is what the
 * offline notice tells the learner, and what the reconnect push works off.
 *
 * Only ids are kept; the sessions themselves stay in `bjt_sessions`. The key
 * carries the app prefix on purpose, so the sign-out wipe takes it along with
 * the sessions it points at.
 *
 * No imports: the storage facade, the cloud sync and the notice all read this,
 * and a leaf module cannot become part of an import cycle.
 */

/** localStorage key holding the ids of sessions awaiting upload. */
export const PENDING_SESSIONS_KEY = 'bjt_pending_sessions'

/** What a subscriber (the offline notice) needs to know. */
export interface PendingSnapshot {
  /** How many sessions are waiting for the cloud. */
  count: number
  /**
   * Whether an upload attempt has failed or timed out and the sessions are
   * still waiting. False while a first attempt is simply in flight.
   */
  failed: boolean
}

let failed = false
let snapshot: PendingSnapshot = { count: 0, failed: false }
let snapshotStale = true
const listeners = new Set<() => void>()

function read(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_SESSIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function write(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(PENDING_SESSIONS_KEY)
    else localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(ids))
  } catch { /* storage unavailable: the session itself could not be kept either */ }
}

function changed(): void {
  snapshotStale = true
  listeners.forEach(l => l())
}

/** Ids of the sessions still waiting for the cloud. */
export function getPendingSessionIds(): string[] {
  return read()
}

/** Record that a session has been handed to the cloud and is not confirmed yet. */
export function markSessionPending(id: string): void {
  const ids = read()
  if (ids.includes(id)) return
  write([...ids, id])
  changed()
}

/** Record that the cloud has these sessions. Clears the failure once none are left. */
export function confirmSessionsUploaded(ids: readonly string[]): void {
  if (ids.length === 0) return
  const before = read()
  const after = before.filter(id => !ids.includes(id))
  if (after.length !== before.length) write(after)
  if (after.length === 0) failed = false
  changed()
}

/** Record that an upload attempt failed or never returned. */
export function markUploadFailed(): void {
  // Nothing waiting means nothing failed to arrive; a flag left standing here
  // would make the next session look stranded while it is merely in flight.
  if (read().length === 0) return
  if (failed) {
    // Still announced: the retry schedule counts attempts off this.
    listeners.forEach(l => l())
    return
  }
  failed = true
  changed()
}

/**
 * Forget everything — called by the sign-out wipe, which has just removed the
 * key and the sessions it pointed at.
 */
export function resetPendingSessions(): void {
  write([])
  failed = false
  changed()
}

/** Current state. The same object is returned until something changes. */
export function getPendingSnapshot(): PendingSnapshot {
  if (snapshotStale) {
    const count = read().length
    const next = { count, failed: failed && count > 0 }
    if (next.count !== snapshot.count || next.failed !== snapshot.failed) snapshot = next
    snapshotStale = false
  }
  return snapshot
}

/** Subscribe to changes. Returns the unsubscribe function. */
export function subscribePendingSessions(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
