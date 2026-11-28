import type { TrackedSession } from '../../store/bankroll-tracker-store'
import { requireSupabase, isSupabaseConfigured } from './client'
import { getLocalOwner } from '../storage/local-owner'
import { registerBeforeSignOut } from '../storage/before-sign-out'

/**
 * A row of the `bankroll_sessions` table (subset we read/write).
 *
 * `updated_at` and `deleted_at` arrive with migration 20261129120000. Until it
 * is pushed they are absent from the row, which reads as "never edited" and
 * "not deleted" — the behaviour before the migration.
 */
interface BankrollRow {
  id: string
  user_id: string
  played_on: string
  casino: string | null
  hours_played: number
  result: number | string
  meta: { notes?: string } | null
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
}

/**
 * A tracked session as the cloud holds it. `deletedAt` is set on a tombstone:
 * a row deleted on some device, kept so every other device learns of it.
 */
export type CloudTrackedSession = TrackedSession & { deletedAt?: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** localStorage key of the ids deleted on this device whose tombstone has not reached the cloud yet. */
export const PENDING_DELETES_KEY = 'bjt_bankroll_pending_deletes'

/**
 * Reassign a uuid to a session whose id predates cloud sync (the old ids were
 * `${Date.now()}-${random}`, which don't fit the cloud uuid primary key).
 * Sessions that already have a uuid id are returned unchanged.
 */
export function normalizeId(s: TrackedSession): TrackedSession {
  return UUID_RE.test(s.id) ? s : { ...s, id: crypto.randomUUID() }
}

// ── Pending deletes ──────────────────────────────────────────────────

/** The ids deleted on this device that the cloud has not confirmed yet. */
export function readPendingDeletes(): Set<string> {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writePendingDeletes(ids: Set<string>): void {
  try {
    if (ids.size === 0) localStorage.removeItem(PENDING_DELETES_KEY)
    else localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...ids]))
  } catch { /* blocked storage: the delete is still attempted once, now */ }
}

// ── Merge ────────────────────────────────────────────────────────────

/**
 * How recent a copy is: when it was last edited, or — for a copy from before
 * edits carried a time — when it was created.
 */
function editedAt(s: TrackedSession): number {
  return s.updatedAt ?? s.createdAt ?? 0
}

/** Whether this device's copy should stand over the cloud's (newer wins; a tie keeps the device's). */
function localWins(local: TrackedSession, cloud: TrackedSession): boolean {
  return editedAt(local) >= editedAt(cloud)
}

/**
 * Merge this device's tracked sessions with the cloud's, per id.
 *
 * - A tombstone in the cloud (deleted on any device) removes the session
 *   here, whatever this device holds — a deleted session never comes back.
 * - A session deleted on this device whose tombstone has not landed yet
 *   (offline, or the request failed) stays deleted, however the cloud reads.
 * - Otherwise the newer copy wins (`updatedAt`; `createdAt` for a copy from
 *   before edits were timed). A tie keeps this device's copy.
 *
 * Until 29 Nov 2026 the device always won and a delete was a hard delete, so
 * a session deleted on one device was restored by the next page load on
 * another, and an old edit on one device overwrote a newer one elsewhere.
 *
 * @param local - This device's sessions
 * @param cloud - The cloud's rows, tombstones included (`fetchCloudSessions`)
 * @returns The live sessions, without any tombstone marker
 */
export function mergeById(local: TrackedSession[], cloud: CloudTrackedSession[]): TrackedSession[] {
  const pending = readPendingDeletes()
  const tombstoned = new Set<string>()
  const byId = new Map<string, TrackedSession>()
  for (const c of cloud) {
    if (c.deletedAt !== undefined) {
      tombstoned.add(c.id)
      continue
    }
    byId.set(c.id, c)
  }
  for (const s of local) {
    if (tombstoned.has(s.id)) continue
    const c = byId.get(s.id)
    if (!c || localWins(s, c)) byId.set(s.id, s)
  }
  for (const id of pending) byId.delete(id)
  for (const id of tombstoned) byId.delete(id)
  return [...byId.values()]
}

/**
 * What the last fetch saw in the cloud, per account: each row's edit time and
 * whether it is a tombstone. `upsertCloudSessions` uses it so the sign-in
 * merge sends only the copies that won — sending a stale copy would overwrite
 * a newer edit, and the server would stamp it as the newest.
 */
const lastSeen = new Map<string, Map<string, { editedAt: number; deleted: boolean }>>()

// ── Supabase I/O ─────────────────────────────────────────────────────

/** Current user id from the local session (fast, no network). */
async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * The signed-in user, but only if this device's tracker is theirs — the test
 * `runSessionPush` applies. The upsert files a row under the *session's* user
 * id, so a tab still holding the previous account's log (signed out in
 * another tab, someone else signed in) would put real-money figures into a
 * stranger's account. Before the sign-in merge claims the device the push is
 * skipped; the merge sends the local log itself.
 */
async function owningUserId(): Promise<string | null> {
  const userId = await currentUserId()
  return userId && getLocalOwner() === userId ? userId : null
}

/** Map a tracked session to a DB row for the given user. `updated_at` is set by the server. */
function toRow(s: TrackedSession, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    played_on: s.date,
    casino: s.casino || null,
    hours_played: s.hoursPlayed,
    result: s.result,
    meta: { notes: s.notes ?? '' },
    created_at: new Date(s.createdAt).toISOString(),
  }
}

/** Parse a timestamptz, or undefined if it is missing or unreadable. */
function toMs(v: string | null | undefined): number | undefined {
  if (!v) return undefined
  const ms = new Date(v).getTime()
  return Number.isFinite(ms) ? ms : undefined
}

/** Map a DB row back to a tracked session. `result` comes back as a string (numeric). */
function fromRow(r: BankrollRow): CloudTrackedSession {
  const s: CloudTrackedSession = {
    id: r.id,
    date: r.played_on,
    casino: r.casino ?? '',
    result: Number(r.result),
    hoursPlayed: Number(r.hours_played),
    notes: r.meta?.notes ?? '',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
  }
  const updatedAt = toMs(r.updated_at)
  if (updatedAt !== undefined) s.updatedAt = updatedAt
  const deletedAt = toMs(r.deleted_at)
  if (deletedAt !== undefined) s.deletedAt = deletedAt
  return s
}

/**
 * Fetch the user's tracked bankroll sessions from the cloud, tombstones
 * included (`deletedAt` set) — `mergeById` needs them to drop stale copies.
 * Deletes still waiting on this device are sent first, so the answer already
 * carries them.
 */
export async function fetchCloudSessions(userId: string): Promise<CloudTrackedSession[]> {
  await flushPendingDeletes()
  const { data, error } = await requireSupabase()
    .from('bankroll_sessions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  const sessions = (data as BankrollRow[]).map(fromRow)
  lastSeen.set(userId, new Map(sessions.map(s => [s.id, { editedAt: editedAt(s), deleted: s.deletedAt !== undefined }])))
  return sessions
}

/** Upsert rows as given (idempotent on the primary key). */
async function writeRows(userId: string, sessions: TrackedSession[]): Promise<void> {
  if (sessions.length === 0) return
  const { error } = await requireSupabase()
    .from('bankroll_sessions')
    .upsert(sessions.map(s => toRow(s, userId)), { onConflict: 'id' })
  if (error) throw error
}

/**
 * Bulk upsert after a merge: only the copies that should stand. Skipped are
 * sessions deleted here (pending), tombstoned in the cloud, or older than the
 * cloud's copy the last fetch saw. Without a fetch for this account every
 * session not deleted here is sent, as before.
 */
export async function upsertCloudSessions(userId: string, sessions: TrackedSession[]): Promise<void> {
  const pending = readPendingDeletes()
  const seen = lastSeen.get(userId)
  const toSend = sessions.filter(s => {
    if (pending.has(s.id)) return false
    const c = seen?.get(s.id)
    if (!c) return true
    return !c.deleted && editedAt(s) > c.editedAt
  })
  await writeRows(userId, toSend)
}

/**
 * Push one added/edited session to the cloud (fire-and-forget, best-effort).
 * Always sent: it is an edit made just now. A row already deleted elsewhere
 * stays deleted — the upsert does not carry `deleted_at`, and the database
 * refuses to clear it.
 */
export function pushSession(session: TrackedSession): void {
  if (!isSupabaseConfigured) return
  void (async () => {
    try {
      const userId = await owningUserId()
      if (userId) await writeRows(userId, [session])
    } catch (e) {
      console.error('bankroll session cloud push failed', e)
    }
  })()
}

/** The PostgREST / Postgres answers for "this column does not exist" (migration not pushed yet). */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' || error.code === '42703' || /deleted_at/.test(error.message ?? '')
}

/** Today as "YYYY-MM-DD" (a tombstone's `played_on` must not be null). */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Write the tombstone for one id. An upsert, not an update: a session deleted
 * before its own push landed has no row yet, and a late push would otherwise
 * create it live. The figures are blanked — a deleted entry should not keep
 * its amounts in the cloud. Falls back to a hard delete on a database
 * without the column.
 */
async function writeTombstone(userId: string, id: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from('bankroll_sessions')
    .upsert({
      id,
      user_id: userId,
      played_on: today(),
      // Every field the person entered is blanked, the bankroll figures
      // included: an upsert only overwrites the columns it names, so a
      // column left out here would keep the deleted entry's money amount.
      casino: null,
      hours_played: 0,
      result: 0,
      starting_bankroll: null,
      final_bankroll: null,
      meta: {},
      deleted_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (!error) return
  if (!isMissingColumn(error)) throw error
  const { error: delError } = await supabase
    .from('bankroll_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (delError) throw delError
}

let flushing: Promise<void> | null = null

/**
 * Send every delete still waiting on this device. Each one leaves the waiting
 * list only once the cloud took it; the rest are tried again on the next
 * fetch, when the browser comes back online, and before a sign-out. Never
 * rejects. Does nothing when the device is not the signed-in account's.
 */
export function flushPendingDeletes(): Promise<void> {
  if (!isSupabaseConfigured || readPendingDeletes().size === 0) return Promise.resolve()
  if (flushing) return flushing
  flushing = (async () => {
    try {
      const userId = await owningUserId()
      if (!userId) return
      // Re-read each turn: a delete made while this runs is sent in the same pass.
      const tried = new Set<string>()
      for (;;) {
        const id = [...readPendingDeletes()].find(p => !tried.has(p))
        if (id === undefined) break
        tried.add(id)
        try {
          await writeTombstone(userId, id)
          const left = readPendingDeletes()
          left.delete(id)
          writePendingDeletes(left)
        } catch (e) {
          console.error('bankroll session cloud delete failed', e)
        }
      }
    } catch (e) {
      console.error('bankroll session cloud delete failed', e)
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/**
 * Delete a session in the cloud (fire-and-forget). Recorded on the device
 * first, so a delete that fails — offline, a timeout — is retried until it
 * lands instead of the next merge bringing the session back.
 */
export function removeCloudSession(id: string): void {
  if (!isSupabaseConfigured) return
  const pending = readPendingDeletes()
  pending.add(id)
  writePendingDeletes(pending)
  void flushPendingDeletes()
}

// Waiting deletes go before the sign-out wipe takes the list, and again
// whenever the browser reports the network back.
registerBeforeSignOut(flushPendingDeletes)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushPendingDeletes() })
}
