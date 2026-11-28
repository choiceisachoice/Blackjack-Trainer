import type { StorageService } from '../storage/storage-service'
import { computeLifetimeStats } from '../storage/storage-service'
import type { TrainingSessionResult, TrainingMode, LifetimeStats } from '../stats-types'
import { requireSupabase } from './client'

/**
 * Rows per history request. Supabase's default `max_rows` — a larger page
 * would be cut to this size silently and read as the last one.
 */
export const HISTORY_PAGE_SIZE = 1000

/** A row of the `training_sessions` table. */
interface SessionRow {
  id: string
  user_id: string
  mode: string
  counting_system: string
  started_at: string
  duration_seconds: number
  total_questions: number
  correct_answers: number
  accuracy: number
  best_streak: number
  details: TrainingSessionResult['details']
}

/** Map an app session result to a DB row (for the current user). */
function toRow(r: TrainingSessionResult, userId: string): SessionRow {
  return {
    id: r.id,
    user_id: userId,
    mode: r.mode,
    counting_system: r.countingSystem,
    started_at: r.timestamp,
    duration_seconds: r.durationSeconds,
    total_questions: r.totalQuestions,
    correct_answers: r.correctAnswers,
    accuracy: r.accuracy,
    best_streak: r.bestStreak,
    details: r.details,
  }
}

/** Map a DB row back to an app session result. */
function fromRow(row: SessionRow): TrainingSessionResult {
  return {
    id: row.id,
    mode: row.mode as TrainingMode,
    timestamp: row.started_at,
    countingSystem: row.counting_system as TrainingSessionResult['countingSystem'],
    durationSeconds: row.duration_seconds,
    totalQuestions: row.total_questions,
    correctAnswers: row.correct_answers,
    accuracy: row.accuracy,
    bestStreak: row.best_streak,
    details: row.details,
  }
}

/**
 * Supabase-backed implementation of `StorageService`, scoped to the signed-in
 * user via Row-Level Security. Used in place of `LocalStorageService` once a
 * user is authenticated.
 */
export class SupabaseStorageService implements StorageService {
  /** Current user id from the local session (fast, no network). */
  private async userId(): Promise<string | null> {
    const { data } = await requireSupabase().auth.getSession()
    return data.session?.user.id ?? null
  }

  private async fetchAll(): Promise<TrainingSessionResult[]> {
    return (await this.readHistory()).sessions
  }

  /**
   * The signed-in user's whole history, newest first, and whose it is.
   *
   * Paged. PostgREST answers at most `max_rows` rows per request (1000 on
   * Supabase unless changed) and says nothing when it cuts a list short, so a
   * single `select` showed a learner past 1000 sessions only the newest 1000 —
   * on a new device, in the lifetime figures, in the curriculum that is
   * derived from the sessions, and in the data export. The order is total
   * (`started_at`, then `id`), so the pages neither overlap nor skip while
   * nothing changes; a row inserted at the head while paging shifts the rest
   * by one, which the id check below absorbs.
   *
   * `userId` is null when there is no signed-in session, and `sessions` is
   * then empty: the caller must not read that as "the cloud has nothing".
   */
  async readHistory(): Promise<{ userId: string | null; sessions: TrainingSessionResult[] }> {
    const uid = await this.userId()
    if (!uid) return { userId: null, sessions: [] }
    const seen = new Set<string>()
    const sessions: TrainingSessionResult[] = []
    for (let from = 0; ; from += HISTORY_PAGE_SIZE) {
      const { data, error } = await requireSupabase()
        .from('training_sessions')
        .select('*')
        .eq('user_id', uid)
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE - 1)
      if (error) throw error
      const rows = (data ?? []) as SessionRow[]
      let fresh = 0
      for (const row of rows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        sessions.push(fromRow(row))
        fresh++
      }
      // A short page is the last one. A page with nothing new means the
      // server is not honouring the range — stop rather than loop.
      if (rows.length < HISTORY_PAGE_SIZE || fresh === 0) break
    }
    return { userId: uid, sessions }
  }

  async saveSessionResult(result: TrainingSessionResult): Promise<void> {
    const uid = await this.userId()
    // Thrown, not returned: the caller keeps the session marked as waiting
    // for upload until a write has actually happened. Offline with an expired
    // token there is no session to read, and returning quietly here reported
    // "saved to the cloud" for a row that was never sent.
    if (!uid) throw new Error('no signed-in session; the session was not sent')
    // Upsert on the primary key so a retried/migrated save can't duplicate.
    const { error } = await requireSupabase()
      .from('training_sessions')
      .upsert(toRow(result, uid), { onConflict: 'id' })
    if (error) throw error
  }

  /** Bulk upsert — used by the one-time local→cloud migration. */
  async saveMany(results: TrainingSessionResult[]): Promise<void> {
    if (results.length === 0) return
    const uid = await this.userId()
    // Thrown for the same reason as in `saveSessionResult`.
    if (!uid) throw new Error('no signed-in session; the sessions were not sent')
    const { error } = await requireSupabase()
      .from('training_sessions')
      .upsert(results.map(r => toRow(r, uid)), { onConflict: 'id' })
    if (error) throw error
  }

  async getSessionResults(mode: TrainingMode): Promise<TrainingSessionResult[]> {
    return (await this.fetchAll()).filter(s => s.mode === mode)
  }

  async getAllSessionResults(): Promise<TrainingSessionResult[]> {
    return this.fetchAll()
  }

  async getSessionResultsByDateRange(start: Date, end: Date): Promise<TrainingSessionResult[]> {
    const startMs = start.getTime()
    const endMs = end.getTime()
    return (await this.fetchAll()).filter(s => {
      const t = new Date(s.timestamp).getTime()
      return t >= startMs && t <= endMs
    })
  }

  async getLifetimeStats(): Promise<LifetimeStats> {
    return computeLifetimeStats(await this.fetchAll())
  }

  async clearAll(): Promise<void> {
    const uid = await this.userId()
    if (!uid) return
    const { error } = await requireSupabase().from('training_sessions').delete().eq('user_id', uid)
    if (error) throw error
  }
}
