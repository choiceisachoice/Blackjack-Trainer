import type { Achievement, UnlockedAchievement } from '../achievements/achievement-types'
import { achievementEngine } from '../achievements/achievement-engine'
import { requireSupabase, isSupabaseConfigured } from './client'

/** A row of the `user_achievements` table (subset we select). */
interface AchievementRow {
  achievement_id: string
  unlocked_at: string
}

/** Current user id from the local session (fast, no network). */
async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

/** Fetch the signed-in user's unlocked achievements from the cloud. */
async function fetchCloud(userId: string): Promise<UnlockedAchievement[]> {
  const { data, error } = await requireSupabase()
    .from('user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)
  if (error) throw error
  return (data as AchievementRow[]).map(r => ({
    achievementId: r.achievement_id,
    unlockedAt: new Date(r.unlocked_at).getTime(),
  }))
}

/**
 * Upsert unlock rows for the user. Idempotent on the (user_id, achievement_id)
 * primary key; `ignoreDuplicates` keeps the earliest cloud unlock time intact.
 */
async function pushRows(userId: string, unlocked: UnlockedAchievement[]): Promise<void> {
  if (unlocked.length === 0) return
  const rows = unlocked.map(u => ({
    user_id: userId,
    achievement_id: u.achievementId,
    unlocked_at: new Date(u.unlockedAt).toISOString(),
  }))
  const { error } = await requireSupabase()
    .from('user_achievements')
    .upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true })
  if (error) throw error
}

/**
 * On sign-in: union the cloud unlock set with the local one (so unlocks earned
 * on another device appear here) and push any local-only unlocks up to the
 * cloud. Idempotent — safe to run on every sign-in.
 */
export async function syncAchievementsOnSignIn(): Promise<void> {
  if (!isSupabaseConfigured) return
  const userId = await currentUserId()
  if (!userId) return
  const remote = await fetchCloud(userId)
  const localOnly = achievementEngine.mergeUnlocked(remote)
  await pushRows(userId, localOnly)
}

/**
 * Push freshly-unlocked achievements to the cloud. Fire-and-forget and
 * best-effort: uses the engine's stored unlock time and never throws into the
 * caller (a failed push is retried by the union merge on the next sign-in).
 */
export function pushNewUnlocks(achievements: Achievement[]): void {
  if (!isSupabaseConfigured || achievements.length === 0) return
  const unlocked = achievementEngine.getUnlocked()
  const rows = achievements
    .map(a => unlocked.find(u => u.achievementId === a.id))
    .filter((u): u is UnlockedAchievement => Boolean(u))
  if (rows.length === 0) return
  void (async () => {
    try {
      const userId = await currentUserId()
      if (userId) await pushRows(userId, rows)
    } catch (e) {
      console.error('achievement cloud push failed', e)
    }
  })()
}

/** Remove all of the user's cloud unlocks (used when local achievements reset). */
export async function clearCloudAchievements(): Promise<void> {
  if (!isSupabaseConfigured) return
  const userId = await currentUserId()
  if (!userId) return
  const { error } = await requireSupabase()
    .from('user_achievements')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}
