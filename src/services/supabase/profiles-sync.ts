import { levelSystem } from '../level-system'
import { achievementEngine } from '../achievements/achievement-engine'
import { requireSupabase, isSupabaseConfigured } from './client'

/** The monotonic progress scalars mirrored in the `profiles` row. */
interface ProfileScalars {
  levelXp: number
  simCount: number
  simBestEdge: number
}

/** Current user id from the local session (fast, no network). */
async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

/** Read the current local progress scalars from their engines. */
function localScalars(): ProfileScalars {
  return {
    levelXp: levelSystem.getTotalXP(),
    simCount: achievementEngine.getSimCount(),
    simBestEdge: achievementEngine.getBestSimEdge(),
  }
}

/** Fetch the user's progress scalars from the cloud (zeros if no row yet). */
async function fetchCloud(userId: string): Promise<ProfileScalars> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('level_xp, sim_count, sim_best_edge')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { levelXp: 0, simCount: 0, simBestEdge: 0 }
  return {
    levelXp: data.level_xp ?? 0,
    simCount: data.sim_count ?? 0,
    simBestEdge: data.sim_best_edge ?? 0,
  }
}

/** Upsert the progress scalars onto the user's profile row. */
async function upsertCloud(userId: string, s: ProfileScalars): Promise<void> {
  const { error } = await requireSupabase()
    .from('profiles')
    .upsert(
      {
        id: userId,
        level_xp: s.levelXp,
        sim_count: s.simCount,
        sim_best_edge: s.simBestEdge,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  if (error) throw error
}

/**
 * On sign-in: reconcile local and cloud progress by taking the max of each
 * scalar (level XP and the sim counters only ever grow), then persist the
 * merged values both locally and to the cloud. This is what keeps the level
 * from resetting to 1 on a fresh device. Idempotent — safe on every sign-in.
 *
 * Note: XP is reconciled by max, not sum, so progress made on two devices
 * between syncs doesn't add up. Acceptable for a single-user trainer that is
 * almost always used online (login is required).
 */
export async function syncProfileOnSignIn(): Promise<void> {
  if (!isSupabaseConfigured) return
  const userId = await currentUserId()
  if (!userId) return
  const local = localScalars()
  const cloud = await fetchCloud(userId)
  const merged: ProfileScalars = {
    levelXp: Math.max(local.levelXp, cloud.levelXp),
    simCount: Math.max(local.simCount, cloud.simCount),
    simBestEdge: Math.max(local.simBestEdge, cloud.simBestEdge),
  }
  levelSystem.setTotalXP(merged.levelXp)
  achievementEngine.setSimCounters(merged.simCount, merged.simBestEdge)
  await upsertCloud(userId, merged)
}

/**
 * Push the current local progress scalars to the cloud. Fire-and-forget and
 * best-effort: a failed push is reconciled by the max-merge on the next
 * sign-in. Safe to call after any XP or simulation change.
 */
export function pushProfileScalars(): void {
  if (!isSupabaseConfigured) return
  void (async () => {
    try {
      const userId = await currentUserId()
      if (userId) await upsertCloud(userId, localScalars())
    } catch (e) {
      console.error('profile cloud push failed', e)
    }
  })()
}
