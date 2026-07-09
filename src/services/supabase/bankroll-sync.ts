import type { TrackedSession } from '../../store/bankroll-tracker-store'
import { requireSupabase, isSupabaseConfigured } from './client'

/** A row of the `bankroll_sessions` table (subset we read/write). */
interface BankrollRow {
  id: string
  user_id: string
  played_on: string
  casino: string | null
  hours_played: number
  result: number | string
  meta: { notes?: string } | null
  created_at: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reassign a uuid to a session whose id predates cloud sync (the old ids were
 * `${Date.now()}-${random}`, which don't fit the cloud uuid primary key).
 * Sessions that already have a uuid id are returned unchanged.
 */
export function normalizeId(s: TrackedSession): TrackedSession {
  return UUID_RE.test(s.id) ? s : { ...s, id: crypto.randomUUID() }
}

/** Union-merge tracked sessions by id; local wins on conflict (offline edits kept). */
export function mergeById(local: TrackedSession[], cloud: TrackedSession[]): TrackedSession[] {
  const byId = new Map<string, TrackedSession>()
  for (const s of cloud) byId.set(s.id, s)
  for (const s of local) byId.set(s.id, s)
  return [...byId.values()]
}

/** Current user id from the local session (fast, no network). */
async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

/** Map a tracked session to a DB row for the given user. */
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

/** Map a DB row back to a tracked session. `result` comes back as a string (numeric). */
function fromRow(r: BankrollRow): TrackedSession {
  return {
    id: r.id,
    date: r.played_on,
    casino: r.casino ?? '',
    result: Number(r.result),
    hoursPlayed: Number(r.hours_played),
    notes: r.meta?.notes ?? '',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
  }
}

/** Fetch the user's tracked bankroll sessions from the cloud. */
export async function fetchCloudSessions(userId: string): Promise<TrackedSession[]> {
  const { data, error } = await requireSupabase()
    .from('bankroll_sessions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data as BankrollRow[]).map(fromRow)
}

/** Bulk upsert tracked sessions (idempotent on the primary key). */
export async function upsertCloudSessions(userId: string, sessions: TrackedSession[]): Promise<void> {
  if (sessions.length === 0) return
  const { error } = await requireSupabase()
    .from('bankroll_sessions')
    .upsert(sessions.map(s => toRow(s, userId)), { onConflict: 'id' })
  if (error) throw error
}

/** Push one added/edited session to the cloud (fire-and-forget, best-effort). */
export function pushSession(session: TrackedSession): void {
  if (!isSupabaseConfigured) return
  void (async () => {
    try {
      const userId = await currentUserId()
      if (userId) await upsertCloudSessions(userId, [session])
    } catch (e) {
      console.error('bankroll session cloud push failed', e)
    }
  })()
}

/** Remove a deleted session from the cloud (fire-and-forget, best-effort). */
export function removeCloudSession(id: string): void {
  if (!isSupabaseConfigured) return
  void (async () => {
    try {
      const userId = await currentUserId()
      if (!userId) return
      const { error } = await requireSupabase()
        .from('bankroll_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)
      if (error) throw error
    } catch (e) {
      console.error('bankroll session cloud delete failed', e)
    }
  })()
}
