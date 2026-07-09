import type { StorageService } from '../storage/storage-service'
import { computeLifetimeStats } from '../storage/storage-service'
import type { TrainingSessionResult, TrainingMode, LifetimeStats } from '../stats-types'
import { requireSupabase } from './client'

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
    const uid = await this.userId()
    if (!uid) return []
    const { data, error } = await requireSupabase()
      .from('training_sessions')
      .select('*')
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
    if (error) throw error
    return (data as SessionRow[]).map(fromRow)
  }

  async saveSessionResult(result: TrainingSessionResult): Promise<void> {
    const uid = await this.userId()
    if (!uid) return
    // Upsert on the primary key so a retried/migrated save can't duplicate.
    const { error } = await requireSupabase()
      .from('training_sessions')
      .upsert(toRow(result, uid), { onConflict: 'id' })
    if (error) throw error
  }

  /** Bulk upsert — used by the one-time local→cloud migration. */
  async saveMany(results: TrainingSessionResult[]): Promise<void> {
    const uid = await this.userId()
    if (!uid || results.length === 0) return
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
